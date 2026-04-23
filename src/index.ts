import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { initNeo4j, getNeo4j } from './db/neo4j';
import { initRedis, getRedis } from './db/redis';
import eventRoutes from './routes/events';
import sporeRoutes from './routes/spores';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api', eventRoutes);
app.use('/api', sporeRoutes);

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'GlyphicSpore Backend',
    version: '1.0.0',
    description: 'Neo4j graph visualization layer for TriumvirateSwarm',
    endpoints: {
      health:          'GET  /api/health',
      ingestEvent:     'POST /api/event',
      getEvent:        'GET  /api/event/:sequenceId',
      getMissionEvents:'GET  /api/events/mission/:missionId',
      sporesList:      'GET  /api/spores?mission_id=<missionId>',
      sporeDetail:     'GET  /api/spores/:artifactId?mission_id=<missionId>',
      sporeLineage:    'GET  /api/spores/:artifactId/lineage?mission_id=<missionId>',
    },
  });
});

// Error middleware must be after route registration
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

async function startServer() {
  try {
    const redis = initRedis({
      host:     process.env.REDIS_HOST     || 'localhost',
      port:     parseInt(process.env.REDIS_PORT || '6379', 10),
      db:       parseInt(process.env.REDIS_DB   || '0',    10),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    await redis.connect();

    const neo4j = initNeo4j({
      uri:      process.env.NEO4J_URI      || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
    });
    await neo4j.connect();

    app.listen(PORT, () => {
      console.log(`✓ GlyphicSpore backend listening on port ${PORT}`);
      console.log(`✓ API root:      http://localhost:${PORT}/`);
      console.log(`✓ Health:        http://localhost:${PORT}/api/health`);
      console.log(`✓ Spores list:   http://localhost:${PORT}/api/spores?mission_id=TriumvirateSwarm`);
      console.log(`✓ Spore detail:  http://localhost:${PORT}/api/spores/<artifactId>?mission_id=TriumvirateSwarm`);
      console.log(`✓ Spore lineage: http://localhost:${PORT}/api/spores/<artifactId>/lineage?mission_id=TriumvirateSwarm`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    await getRedis().disconnect();
    await getNeo4j().disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

startServer();
