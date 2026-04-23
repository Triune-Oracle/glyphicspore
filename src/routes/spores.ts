import { Router, Request, Response } from 'express';
import { getNeo4j } from '../db/neo4j';

const router = Router();

interface SporeRow {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
  eventCount: number;
  agentCount: number;
  lastEventAt: string | null;
}

/**
 * GET /api/spores?mission_id=<id>
 *
 * Read-only graph projection: Artifact nodes aggregated with their
 * producing Event chain and contributing Agent counts.
 * No new node types — pure traversal over existing labels.
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
    const rows = await getNeo4j().query<SporeRow>(
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
    console.error('Spores query error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
