import { v4 as uuidv4 } from 'uuid';
import { getNeo4j } from '../db/neo4j';
import { getRedis } from '../db/redis';
import {
  PartylineEvent,
  EventIngestionRequest,
  EventIngestionRequestSchema,
  PartylineEventSchema,
} from '../types/partyline';

export class EventIngestionService {
  async ingestEvent(request: EventIngestionRequest): Promise<PartylineEvent> {
    const validated = EventIngestionRequestSchema.parse(request);

    const timestamp = new Date().toISOString();
    const sequenceId = await this.getNextSequenceId(validated.mission_id);

    const event: PartylineEvent = {
      timestamp,
      sequence_id: sequenceId,
      agent_id: validated.agent_id,
      event_type: validated.event_type,
      mission_id: validated.mission_id,
      context_delta: validated.context_delta,
      references_gov: validated.references_gov,
      artifacts: validated.artifacts,
      parent_event_id: validated.parent_event_id,
      error_details: validated.error_details,
      ttl_seconds: validated.ttl_seconds,
      signature: validated.signature,
    };

    const validatedEvent = PartylineEventSchema.parse(event);

    await this.storeEvent(validatedEvent);
    await this.mutateGraph(validatedEvent);

    return validatedEvent;
  }

  private async storeEvent(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    // MERGE the Agent so the PERFORMED edge can always be created,
    // even if a join event hasn't arrived yet.
    await neo4j.write(
      `
      MERGE (a:Agent {agent_id: $agentId, mission_id: $missionId})
      ON CREATE SET a.last_activity = $timestamp
      ON MATCH  SET a.last_activity = $timestamp
      CREATE (e:Event {
        sequence_id:    $sequenceId,
        timestamp:      $timestamp,
        agent_id:       $agentId,
        event_type:     $eventType,
        mission_id:     $missionId,
        context_delta:  $contextDelta,
        references_gov: $referencesGov,
        parent_event_id: $parentEventId,
        ttl_seconds:    $ttlSeconds
      })
      CREATE (a)-[:PERFORMED]->(e)
      RETURN e
      `,
      {
        agentId:       event.agent_id,
        missionId:     event.mission_id,
        timestamp:     event.timestamp,
        sequenceId:    event.sequence_id,
        eventType:     event.event_type,
        contextDelta:  JSON.stringify(event.context_delta),
        referencesGov: event.references_gov,
        parentEventId: event.parent_event_id ?? null,
        ttlSeconds:    event.ttl_seconds ?? null,
      }
    );

    // Wire parent lineage edge when present
    if (event.parent_event_id != null) {
      await neo4j.write(
        `
        MATCH (child:Event  {sequence_id: $childId})
        MATCH (parent:Event {sequence_id: $parentId})
        MERGE (child)-[:CHILD_OF]->(parent)
        `,
        { childId: event.sequence_id, parentId: event.parent_event_id }
      );
    }
  }

  private async mutateGraph(event: PartylineEvent): Promise<void> {
    switch (event.event_type) {
      case 'join':       await this.handleAgentJoin(event); break;
      case 'action':     await this.handleAction(event);    break;
      case 'artifact':   await this.handleArtifact(event);  break;
      case 'decision':   await this.handleDecision(event);  break;
      case 'error':      await this.handleError(event);     break;
      case 'checkpoint': await this.handleCheckpoint(event); break;
      default:           break;
    }
  }

  private async handleAgentJoin(event: PartylineEvent): Promise<void> {
    await getNeo4j().write(
      `
      MERGE (a:Agent {agent_id: $agentId, mission_id: $missionId})
      SET a.status     = 'active',
          a.joined_at  = $timestamp,
          a.last_activity = $timestamp
      `,
      { agentId: event.agent_id, missionId: event.mission_id, timestamp: event.timestamp }
    );
  }

  private async handleAction(event: PartylineEvent): Promise<void> {
    // Agent.last_activity is already updated in storeEvent; nothing extra needed here.
  }

  private async handleArtifact(event: PartylineEvent): Promise<void> {
    if (!event.artifacts || event.artifacts.length === 0) return;

    const neo4j = getNeo4j();

    for (const artifact of event.artifacts) {
      // MERGE Artifact and draw the provenance edge from the producing Event.
      await neo4j.write(
        `
        MATCH (evt:Event {sequence_id: $sequenceId, mission_id: $missionId})
        MERGE (art:Artifact {artifact_id: $artifactId, mission_id: $missionId})
        SET art.type       = $type,
            art.reference  = $reference,
            art.checksum   = $checksum,
            art.created_at = $timestamp,
            art.created_by = $agentId,
            art.status     = 'active'
        MERGE (evt)-[:PRODUCED]->(art)
        `,
        {
          sequenceId:  event.sequence_id,
          missionId:   event.mission_id,
          artifactId:  artifact.artifact_id,
          type:        artifact.type,
          reference:   artifact.reference,
          checksum:    artifact.checksum ?? null,
          timestamp:   event.timestamp,
          agentId:     event.agent_id,
        }
      );
    }
  }

  private async handleDecision(event: PartylineEvent): Promise<void> {
    const context = event.context_delta as Record<string, unknown>;
    await getNeo4j().write(
      `
      CREATE (d:Decision {
        decision_id:   $decisionId,
        decision_type: $decisionType,
        condition:     $condition,
        outcome:       $outcome,
        timestamp:     $timestamp,
        made_by:       $agentId,
        mission_id:    $missionId
      })
      `,
      {
        decisionId:   uuidv4(),
        decisionType: context.decision_type || 'unknown',
        condition:    context.condition || '',
        outcome:      context.outcome || 'pending',
        timestamp:    event.timestamp,
        agentId:      event.agent_id,
        missionId:    event.mission_id,
      }
    );
  }

  private async handleError(event: PartylineEvent): Promise<void> {
    await getNeo4j().write(
      `
      CREATE (err:Error {
        error_id:    $errorId,
        error_code:  $errorCode,
        message:     $message,
        severity:    'error',
        timestamp:   $timestamp,
        triggered_by: $agentId,
        mission_id:  $missionId,
        resolved:    false
      })
      `,
      {
        errorId:   uuidv4(),
        errorCode: event.error_details?.error_code || 'UNKNOWN',
        message:   event.error_details?.message || 'Unknown error',
        timestamp: event.timestamp,
        agentId:   event.agent_id,
        missionId: event.mission_id,
      }
    );
  }

  private async handleCheckpoint(event: PartylineEvent): Promise<void> {
    const context = event.context_delta as Record<string, unknown>;
    await getNeo4j().write(
      `
      CREATE (c:Checkpoint {
        checkpoint_id:   $checkpointId,
        checkpoint_name: $checkpointName,
        timestamp:       $timestamp,
        created_by:      $agentId,
        mission_id:      $missionId
      })
      `,
      {
        checkpointId:   uuidv4(),
        checkpointName: context.checkpoint_name || 'Unnamed checkpoint',
        timestamp:      event.timestamp,
        agentId:        event.agent_id,
        missionId:      event.mission_id,
      }
    );
  }

  private async getNextSequenceId(missionId: string): Promise<number> {
    return getRedis().getNextSequenceId(missionId);
  }
}
