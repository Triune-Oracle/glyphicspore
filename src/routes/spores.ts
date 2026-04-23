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

interface LineageRow {
  artifactId: string;
  eventSeqId: number | null;
  eventType: string | null;
  agentId: string | null;
  parentSeqId: number | null;
}

interface GraphNode {
  id: string;
  type: 'artifact' | 'event' | 'agent';
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'PERFORMED' | 'PRODUCED' | 'CHILD_OF';
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
 * GET /api/spores/:artifactId/lineage?mission_id=<id>
 *
 * Graph-native lineage view: nodes and edges ready for Cytoscape,
 * React Flow, or any graph visualization library.
 *
 * Registered before /:artifactId to prevent Express param shadowing.
 */
router.get('/spores/:artifactId/lineage', async (req: Request, res: Response) => {
  const { artifactId } = req.params;
  const { mission_id } = req.query;

  if (!mission_id || typeof mission_id !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'mission_id query parameter is required',
    });
  }

  try {
    const rows = await getNeo4j().query<LineageRow>(
      `
      MATCH (art:Artifact {artifact_id: $artifactId, mission_id: $missionId})
      OPTIONAL MATCH (evt:Event)-[:PRODUCED]->(art)
      OPTIONAL MATCH (ag:Agent)-[:PERFORMED]->(evt)
      OPTIONAL MATCH (evt)-[:CHILD_OF]->(parent:Event)
      RETURN
        art.artifact_id    AS artifactId,
        evt.sequence_id    AS eventSeqId,
        evt.event_type     AS eventType,
        ag.agent_id        AS agentId,
        parent.sequence_id AS parentSeqId
      `,
      { artifactId, missionId: mission_id }
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Artifact not found',
      });
    }

    const nodesMap = new Map<string, GraphNode>();
    const edgeKeys = new Set<string>();
    const edges: GraphEdge[] = [];

    const addNode = (id: string, type: GraphNode['type']) => {
      if (!nodesMap.has(id)) nodesMap.set(id, { id, type });
    };
    const addEdge = (from: string, to: string, type: GraphEdge['type']) => {
      const key = `${from}|${to}|${type}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push({ from, to, type });
      }
    };

    const artNodeId = `artifact:${artifactId}`;
    addNode(artNodeId, 'artifact');

    for (const row of rows) {
      const evtSeqId   = row.eventSeqId  != null ? Number(row.eventSeqId)  : null;
      const parentSeqId = row.parentSeqId != null ? Number(row.parentSeqId) : null;

      if (evtSeqId != null) {
        const evtId = `event:${evtSeqId}`;
        addNode(evtId, 'event');
        addEdge(evtId, artNodeId, 'PRODUCED');

        if (row.agentId != null) {
          const agentId = `agent:${row.agentId}`;
          addNode(agentId, 'agent');
          addEdge(agentId, evtId, 'PERFORMED');
        }

        if (parentSeqId != null) {
          const parentId = `event:${parentSeqId}`;
          addNode(parentId, 'event');
          addEdge(evtId, parentId, 'CHILD_OF');
        }
      }
    }

    res.status(200).json({
      success: true,
      artifactId,
      missionId: mission_id,
      nodes: [...nodesMap.values()],
      edges,
    });
  } catch (error) {
    console.error('Spore lineage query error:', error);
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
