import neo4j, { Driver, Session } from 'neo4j-driver';
import { z } from 'zod';

const Neo4jConfigSchema = z.object({
  uri: z.string().url(),
  username: z.string(),
  password: z.string(),
});

type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

/**
 * Neo4j connection manager for GlyphicSpore
 * Handles driver initialization, session management, and query execution
 */
export class Neo4jConnection {
  private driver: Driver | null = null;
  private config: Neo4jConfig;

  constructor(config: Neo4jConfig) {
    this.config = Neo4jConfigSchema.parse(config);
  }

  /**
   * Initialize the Neo4j driver
   */
  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: 50,
          connectionAcquisitionTimeout: 30000,
          logging: neo4j.logging.console('info'),
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      console.log('✓ Neo4j connection verified');
    } catch (error) {
      console.error('✗ Neo4j connection failed:', error);
      throw error;
    }
  }

  /**
   * Close the Neo4j driver
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('✓ Neo4j connection closed');
    }
  }

  /**
   * Execute a Cypher query and return results
   */
  async query<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }

    const session = this.driver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((record) => record.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a write query (transaction)
   */
  async write<T>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }

    const session = this.driver.session({ defaultAccessMode: 'WRITE' });
    try {
      const result = await session.run(cypher, params);
      return result.records.map((record) => record.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Get a session for advanced operations
   */
  getSession(): Session {
    if (!this.driver) {
      throw new Error('Neo4j driver not initialized. Call connect() first.');
    }
    return this.driver.session();
  }

  /**
   * Check if driver is connected
   */
  isConnected(): boolean {
    return this.driver !== null;
  }
}

// Singleton instance
let instance: Neo4jConnection | null = null;

export function initNeo4j(config: Neo4jConfig): Neo4jConnection {
  if (!instance) {
    instance = new Neo4jConnection(config);
  }
  return instance;
}

export function getNeo4j(): Neo4jConnection {
  if (!instance) {
    throw new Error('Neo4j not initialized. Call initNeo4j() first.');
  }
  return instance;
}
