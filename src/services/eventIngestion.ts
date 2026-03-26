import { v4 as uuidv4 } from 'uuid';
import { getNeo4j } from '../db/neo4j';
import { getRedis } from '../db/redis';
import {
  PartylineEvent,
  EventIngestionRequest,
  EventIngestionRequestSchema,
  PartylineEventSchema,
} from '../types/partyline';

/**
 * Event Ingestion Service
 * Handles validation, storage, and graph mutation of Partyline events
 */
export class EventIngestionService {
  /**
   * Ingest a new event into the Partyline
   * Validates, stores in Neo4j, and triggers graph mutations
   */
  async ingestEvent(request: EventIngestionRequest): Promise<PartylineEvent> {
    // Validate input
    const validated = EventIngestionRequestSchema.parse(request);

    // Generate timestamp and sequence_id
    const timestamp = new Date().toISOString();
    const sequenceId = await this.getNextSequenceId(validated.mission_id);

    // Build complete event
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

    // Validate complete event
    const validatedEvent = PartylineEventSchema.parse(event);

    // Store in Neo4j
    await this.storeEvent(validatedEvent);

    // Trigger graph mutations based on event type
    await this.mutateGraph(validatedEvent);

    return validatedEvent;
  }

  /**
   * Store event as a node in Neo4j
   */
  private async storeEvent(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    const cypher = `
      CREATE (e:Event {
        sequence_id: $sequenceId,
        timestamp: $timestamp,
        agent_id: $agentId,
        event_type: $eventType,
        mission_id: $missionId,
        context_delta: $contextDelta,
        references_gov: $referencesGov,
        parent_event_id: $parentEventId,
        ttl_seconds: $ttlSeconds
      })
      RETURN e
    `;

    await neo4j.write(cypher, {
      sequenceId: event.sequence_id,
      timestamp: event.timestamp,
      agentId: event.agent_id,
      eventType: event.event_type,
      missionId: event.mission_id,
      contextDelta: JSON.stringify(event.context_delta),
      referencesGov: event.references_gov,
      parentEventId: event.parent_event_id || null,
      ttlSeconds: event.ttl_seconds || null,
    });
  }

  /**
   * Trigger graph mutations based on event type
   * Updates GlyphicSpore visualization layer
   */
  private async mutateGraph(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    switch (event.event_type) {
      case 'join':
        await this.handleAgentJoin(event);
        break;
      case 'action':
        await this.handleAction(event);
        break;
      case 'artifact':
        await this.handleArtifact(event);
        break;
      case 'decision':
        await this.handleDecision(event);
        break;
      case 'error':
        await this.handleError(event);
        break;
      case 'checkpoint':
        await this.handleCheckpoint(event);
        break;
      default:
        // No graph mutation for other event types
        break;
    }
  }

  /**
   * Handle agent join event
   */
  private async handleAgentJoin(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    const cypher = `
      MERGE (a:Agent {
        agent_id: $agentId,
        mission_id: $missionId
      })
      SET a.status = 'active',
          a.joined_at = $timestamp,
          a.last_activity = $timestamp
      RETURN a
    `;

    await neo4j.write(cypher, {
      agentId: event.agent_id,
      missionId: event.mission_id,
      timestamp: event.timestamp,
    });
  }

  /**
   * Handle action event
   */
  private async handleAction(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();
    const context = event.context_delta as Record<string, unknown>;

    const cypher = `
      MATCH (a:Agent { agent_id: $agentId, mission_id: $missionId })
      SET a.last_activity = $timestamp
      RETURN a
    `;

    await neo4j.write(cypher, {
      agentId: event.agent_id,
      missionId: event.mission_id,
      timestamp: event.timestamp,
    });
  }

  /**
   * Handle artifact event
   */
  private async handleArtifact(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    if (!event.artifacts || event.artifacts.length === 0) {
      return;
    }

    for (const artifact of event.artifacts) {
      const cypher = `
        MERGE (art:Artifact {
          artifact_id: $artifactId,
          mission_id: $missionId
        })
        SET art.type = $type,
            art.reference = $reference,
            art.checksum = $checksum,
            art.created_at = $timestamp,
            art.created_by = $agentId,
            art.status = 'active'
        RETURN art
      `;

      await neo4j.write(cypher, {
        artifactId: artifact.artifact_id,
        missionId: event.mission_id,
        type: artifact.type,
        reference: artifact.reference,
        checksum: artifact.checksum || null,
        timestamp: event.timestamp,
        agentId: event.agent_id,
      });
    }
  }

  /**
   * Handle decision event
   */
  private async handleDecision(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();
    const context = event.context_delta as Record<string, unknown>;

    const cypher = `
      CREATE (d:Decision {
        decision_id: $decisionId,
        decision_type: $decisionType,
        condition: $condition,
        outcome: $outcome,
        timestamp: $timestamp,
        made_by: $agentId,
        mission_id: $missionId
      })
      RETURN d
    `;

    await neo4j.write(cypher, {
      decisionId: uuidv4(),
      decisionType: context.decision_type || 'unknown',
      condition: context.condition || '',
      outcome: context.outcome || 'pending',
      timestamp: event.timestamp,
      agentId: event.agent_id,
      missionId: event.mission_id,
    });
  }

  /**
   * Handle error event
   */
  private async handleError(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();

    const cypher = `
      CREATE (err:Error {
        error_id: $errorId,
        error_code: $errorCode,
        message: $message,
        severity: $severity,
        timestamp: $timestamp,
        triggered_by: $agentId,
        mission_id: $missionId,
        resolved: false
      })
      RETURN err
    `;

    await neo4j.write(cypher, {
      errorId: uuidv4(),
      errorCode: event.error_details?.error_code || 'UNKNOWN',
      message: event.error_details?.message || 'Unknown error',
      severity: 'error',
      timestamp: event.timestamp,
      agentId: event.agent_id,
      missionId: event.mission_id,
    });
  }

  /**
   * Handle checkpoint event
   */
  private async handleCheckpoint(event: PartylineEvent): Promise<void> {
    const neo4j = getNeo4j();
    const context = event.context_delta as Record<string, unknown>;

    const cypher = `
      CREATE (c:Checkpoint {
        checkpoint_id: $checkpointId,
        checkpoint_name: $checkpointName,
        timestamp: $timestamp,
        created_by: $agentId,
        mission_id: $missionId
      })
      RETURN c
    `;

    await neo4j.write(cypher, {
      checkpointId: uuidv4(),
      checkpointName: context.checkpoint_name || 'Unnamed checkpoint',
      timestamp: event.timestamp,
      agentId: event.agent_id,
      missionId: event.mission_id,
    });
  }

  /**
   * Get next sequence ID for a mission using Redis atomic INCR
   * Eliminates race condition from concurrent writes
   */
  private async getNextSequenceId(missionId: string): Promise<number> {
    const redis = getRedis();
    return await redis.getNextSequenceId(missionId);
  }
}
