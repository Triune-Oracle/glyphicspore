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

      await this.client.ping();
      console.log('✓ Redis connection verified');
    } catch (error) {
      console.error('✗ Redis connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      console.log('✓ Redis connection closed');
    }
  }

  /** Live round-trip probe — throws if Redis is unreachable. */
  async ping(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    await this.client.ping();
  }

  async getNextSequenceId(missionId: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    const key = `partyline:seq:${missionId}`;
    return this.client.incr(key);
  }

  async getCurrentSequenceId(missionId: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    const key = `partyline:seq:${missionId}`;
    const currentId = await this.client.get(key);
    return currentId ? parseInt(currentId, 10) : 0;
  }

  async resetSequenceId(missionId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized. Call connect() first.');
    }
    const key = `partyline:seq:${missionId}`;
    await this.client.del(key);
  }

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
