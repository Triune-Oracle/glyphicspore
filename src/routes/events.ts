import { Router, Request, Response } from 'express';
import { EventIngestionService } from '../services/eventIngestion';
import { EventIngestionRequestSchema } from '../types/partyline';
import { getNeo4j } from '../db/neo4j';
import { getRedis } from '../db/redis';
import { z } from 'zod';

const router = Router();
const eventService = new EventIngestionService();

router.post('/event', async (req: Request, res: Response) => {
  try {
    const eventRequest = EventIngestionRequestSchema.parse(req.body);
    const event = await eventService.ingestEvent(eventRequest);
    res.status(201).json({
      success: true,
      event,
      message: `Event ${event.sequence_id} ingested successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    console.error('Event ingestion error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/event/:sequenceId', async (req: Request, res: Response) => {
  try {
    const sequenceId = parseInt(req.params.sequenceId, 10);
    if (isNaN(sequenceId)) {
      return res.status(400).json({ success: false, error: 'Invalid sequence ID' });
    }
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Event retrieval endpoint coming soon',
    });
  } catch (error) {
    console.error('Event retrieval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/events/mission/:missionId', async (req: Request, res: Response) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Mission events retrieval endpoint coming soon',
    });
  } catch (error) {
    console.error('Mission events retrieval error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /health
 * Live dependency check. Returns 503 if any dependency is unreachable.
 */
router.get('/health', async (req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'fail'> = {
    api: 'ok',
    neo4j: 'ok',
    redis: 'ok',
  };

  try {
    await getNeo4j().query('RETURN 1');
  } catch {
    checks.neo4j = 'fail';
  }

  try {
    await getRedis().ping();
  } catch {
    checks.redis = 'fail';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    service: 'glyphicspore-backend',
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;
