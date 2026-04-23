import { Router, Request, Response } from 'express';
import { getNeo4j } from '../db/neo4j';

const router = Router();

interface SporeListRow {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
  eventCount: number;
  agentCount: number;
  lastEventAt: string | null;
}

interface SporeDetailRow {
  artifactId: string;
  missionId: string;
  artifactType: string;
  reference: string;
  status: string;
  createdAt: string;
  eventSeqId: number | null;
  eventType: string | null;
  eventTimestamp: string | null;
  parentEventId: number | null;
  agentId: string | null;
}

/**
 * GET /api/spores?mission_id=<id>
 *
 * List projection: every Artifact in a mission aggregated with its
 * producing Event chain and contributing Agent counts.
 */
router.get('/spores', async (req: Request, res: Response) => {
  const { mission_id } = req.query;

  if (!mission_id || typeof mission_id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'mission_id query parameter is required',
    });
  }

  try {
    const rows = await getNeo4j().query<SporeListRow>(
      `
      MATCH (art:Artifact {mission_id: $missionId})
      OPTIONAL MATCH (e:Event)-[:PRODUCED]->(art)
      OPTIONAL MATCH (a:Agent)-[:PERFORMED]->(e)
      RETURN
        art.artifact_id   AS id,
        art.reference     AS title,
        art.type          AS sourceType,
        art.status        AS status,
        art.created_at    AS createdAt,
        COUNT(DISTINCT e) AS eventCount,
        COUNT(DISTINCT a) AS agentCount,
        MAX(e.timestamp)  AS lastEventAt
      ORDER BY art.created_at DESC
      `,
      { missionId: mission_id }
    );

    res.status(200).json({
      success: true,
      mission_id,
      count: rows.length,
      spores: rows,
    });
  } catch (error) {
    console.error('Spores list query error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/spores/:artifactId?mission_id=<id>
 *
 * Detail projection: single Artifact with its full producing Event chain
 * (one-hop parent lineage) and every contributing Agent.
 *
 * mission_id is required because artifact_id is unique per mission, not globally.
 *
 * Returns flat rows from Neo4j and aggregates in TypeScript to avoid
 * complex nested COLLECT Cypher.
 */
router.get('/spores/:artifactId', async (req: Request, res: Response) => {
  const { artifactId } = req.params;
  const { mission_id } = req.query;

  if (!mission_id || typeof mission_id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'mission_id query parameter is required',
    });
  }

  try {
    const rows = await getNeo4j().query<SporeDetailRow>(
      `
      MATCH (art:Artifact {artifact_id: $artifactId, mission_id: $missionId})
      OPTIONAL MATCH (evt:Event)-[:PRODUCED]->(art)
      OPTIONAL MATCH (ag:Agent)-[:PERFORMED]->(evt)
      OPTIONAL MATCH (evt)-[:CHILD_OF]->(parent:Event)
      RETURN
        art.artifact_id    AS artifactId,
        art.mission_id     AS missionId,
        art.type           AS artifactType,
        art.reference      AS reference,
        art.status         AS status,
        art.created_at     AS createdAt,
        evt.sequence_id    AS eventSeqId,
        evt.event_type     AS eventType,
        evt.timestamp      AS eventTimestamp,
        parent.sequence_id AS parentEventId,
        ag.agent_id        AS agentId
      ORDER BY evt.timestamp DESC
      `,
      { artifactId, missionId: mission_id }
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Artifact not found',
      });
    }

    // Aggregate flat rows into structured response.
    // eventSeqId/agentId can be null when no events have been produced yet.
    const first = rows[0];
    const eventsMap = new Map<number, {
      sequenceId: number;
      eventType: string;
      timestamp: string;
      parentEventId: number | null;
    }>();
    const agentsSet = new Set<string>();

    for (const row of rows) {
      if (row.eventSeqId != null) {
        eventsMap.set(Number(row.eventSeqId), {
          sequenceId:    Number(row.eventSeqId),
          eventType:     row.eventType!,
          timestamp:     row.eventTimestamp!,
          parentEventId: row.parentEventId != null ? Number(row.parentEventId) : null,
        });
      }
      if (row.agentId != null) {
        agentsSet.add(row.agentId);
      }
    }

    const events = [...eventsMap.values()].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp)
    );
    const agents = [...agentsSet].map((id) => ({ agentId: id }));

    res.status(200).json({
      success: true,
      spore: {
        artifactId: first.artifactId,
        missionId:  first.missionId,
        type:       first.artifactType,
        reference:  first.reference,
        status:     first.status,
        createdAt:  first.createdAt,
        producedBy: {
          eventCount:    events.length,
          agentCount:    agents.length,
          latestEventAt: events[0]?.timestamp ?? null,
        },
        agents,
        events,
      },
    });
  } catch (error) {
    console.error('Spore detail query error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
