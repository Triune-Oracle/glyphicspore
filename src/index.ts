import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { initNeo4j, getNeo4j } from './db/neo4j';
import { initRedis, getRedis } from './db/redis';
import eventRoutes from './routes/events';

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message,
  });
});

// Routes
app.use('/api', eventRoutes);

/**
 * Root endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    service: 'GlyphicSpore Backend',
    version: '1.0.0',
    description: 'Neo4j graph visualization layer for TriumvirateSwarm',
    endpoints: {
      health: 'GET /api/health',
      ingestEvent: 'POST /api/event',
      getEvent: 'GET /api/event/:sequenceId',
      getMissionEvents: 'GET /api/events/mission/:missionId',
    },
  });
});

/**
 * Initialize server
 */
async function startServer() {
  try {
    // Initialize Redis connection (for atomic sequence ID generation)
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisDb = parseInt(process.env.REDIS_DB || '0', 10);
    const redisPassword = process.env.REDIS_PASSWORD || undefined;

    console.log('Initializing Redis connection...');
    const redis = initRedis({
      host: redisHost,
      port: redisPort,
      db: redisDb,
      password: redisPassword,
    });

    await redis.connect();

    // Initialize Neo4j connection
    const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const neo4jUsername = process.env.NEO4J_USERNAME || 'neo4j';
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';

    console.log('Initializing Neo4j connection...');
    const neo4j = initNeo4j({
      uri: neo4jUri,
      username: neo4jUsername,
      password: neo4jPassword,
    });

    await neo4j.connect();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✓ GlyphicSpore backend listening on port ${PORT}`);
      console.log(`✓ API documentation: http://localhost:${PORT}/`);
      console.log(`✓ Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  try {
    const redis = getRedis();
    await redis.disconnect();
    const neo4j = getNeo4j();
    await neo4j.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();
