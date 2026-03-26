import { Router, Request, Response } from 'express';
import { EventIngestionService } from '../services/eventIngestion';
import { EventIngestionRequestSchema } from '../types/partyline';
import { z } from 'zod';

const router = Router();
const eventService = new EventIngestionService();

/**
 * POST /event
 * Ingest a new Partyline event into GlyphicSpore
 *
 * Request body: Partyline event (without timestamp and sequence_id)
 * Response: Complete event with generated timestamp and sequence_id
 */
router.post('/event', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const eventRequest = EventIngestionRequestSchema.parse(req.body);

    // Ingest event
    const event = await eventService.ingestEvent(eventRequest);

    // Return success response
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

/**
 * GET /event/:sequenceId
 * Retrieve a specific event by sequence ID
 */
router.get('/event/:sequenceId', async (req: Request, res: Response) => {
  try {
    const sequenceId = parseInt(req.params.sequenceId, 10);

    if (isNaN(sequenceId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sequence ID',
      });
    }

    // TODO: Implement event retrieval from Neo4j
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Event retrieval endpoint coming soon',
    });
  } catch (error) {
    console.error('Event retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /events/mission/:missionId
 * Retrieve all events for a specific mission
 */
router.get('/events/mission/:missionId', async (req: Request, res: Response) => {
  try {
    const { missionId } = req.params;

    // TODO: Implement mission events retrieval from Neo4j
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Mission events retrieval endpoint coming soon',
    });
  } catch (error) {
    console.error('Mission events retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    service: 'glyphicspore-backend',
    timestamp: new Date().toISOString(),
  });
});

export default router;
