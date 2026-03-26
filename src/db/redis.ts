import Redis from 'ioredis';
import { z } from 'zod';

const RedisConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().default(6379),
  db: z.number().int().default(0),
  password: z.string().optional(),
});

type RedisConfig = z.infer<typeof RedisConfigSchema>;

/**
 * Redis connection manager for GlyphicSpore
 * Handles atomic sequence ID generation and Partyline subscription
 */
export class RedisConnection {
  private client: Redis | null = null;
  private config: RedisConfig;

  constructor(config: Partial<RedisConfig> = {}) {
    this.config = RedisConfigSchema.parse(config);
  }

  /**
   * Initialize the Redis client
   */
  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        password: this.config.password || undefined,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      // Test connectivity
      await this.client.ping();
      console.log('✓ Redis connection verified');
    } catch (error) {
      console.error('✗ Redis connection failed:', error);
      throw error;
    }
  }

  /**
   * Close the Redis client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('✓ Redis connection closed');
    }
  }

  /**
   * Get next sequence ID for a mission using atomic INCR
   * Key pattern: partyline:seq:{mission_id}
   */
  async getNextSequenceId(missionId: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }

    const key = `partyline:seq:${missionId}`;
    const nextId = await this.client.incr(key);
    return nextId;
  }

  /**
   * Get current sequence ID for a mission (without incrementing)
   */
  async getCurrentSequenceId(missionId: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }

    const key = `partyline:seq:${missionId}`;
    const currentId = await this.client.get(key);
    return currentId ? parseInt(currentId, 10) : 0;
  }

  /**
   * Reset sequence ID for a mission (admin operation)
   */
  async resetSequenceId(missionId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }

    const key = `partyline:seq:${missionId}`;
    await this.client.del(key);
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }
}

// Singleton instance
let instance: RedisConnection | null = null;

export function initRedis(config?: Partial<RedisConfig>): RedisConnection {
  if (!instance) {
    instance = new RedisConnection(config);
  }
  return instance;
}

export function getRedis(): RedisConnection {
  if (!instance) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return instance;
}
