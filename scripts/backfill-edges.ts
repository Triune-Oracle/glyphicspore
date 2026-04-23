#!/usr/bin/env tsx
/**
 * Backfill graph edges for Event/Agent/Artifact nodes written before
 * the relationship write path was implemented.
 *
 * POLICY: forward-correct by default.
 *   All new ingests create edges correctly. This script is opt-in and
 *   exists only if historical lineage completeness matters (demos,
 *   analytics, graph integrity checks).
 *
 * Usage:
 *   npm run backfill              # live run, all missions
 *   npm run backfill:dry          # count missing edges, no writes
 *   npm run backfill -- --mission TriumvirateSwarm
 *   npm run backfill:dry -- --mission TriumvirateSwarm
 *
 * Safety:
 *   - All writes use MERGE — safe to run multiple times
 *   - --dry-run never writes; reports counts only
 *   - Scoped by --mission when provided
 *
 * Limitations:
 *   PRODUCED inference matches Event{event_type:'artifact'} to Artifact
 *   by (timestamp, agent_id, mission_id). If two artifact events from
 *   the same agent occur within the same millisecond, cross-links are
 *   possible. Acceptable for backfill; not a concern for new writes.
 */

import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const missionIdx = args.indexOf('--mission');
const MISSION = missionIdx >= 0 ? args[missionIdx + 1] : null;

const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://localhost:7687';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const missionFilter = MISSION
  ? 'AND evt.mission_id = $mission'
  : '';

async function countMissing(
  session: ReturnType<typeof neo4j.driver.prototype.session>,
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<number> {
  const result = await session.run(cypher, params);
  const val = result.records[0]?.get('count');
  return val != null ? Number(val) : 0;
}

async function runWrite(
  session: ReturnType<typeof neo4j.driver.prototype.session>,
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<number> {
  const result = await session.run(cypher, params);
  return result.records[0] != null ? Number(result.records[0].get('processed')) : 0;
}

async function main() {
  console.log(`GlyphicSpore edge backfill — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (MISSION) console.log(`  Scoped to mission: ${MISSION}`);
  console.log();

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );

  await driver.verifyConnectivity();
  console.log('✓ Neo4j connected');
  console.log();

  const params = MISSION ? { mission: MISSION } : {};
  const s = driver.session();

  try {
    // ----------------------------------------------------------------
    // 1. (Agent)-[:PERFORMED]->(Event)
    // ----------------------------------------------------------------
    console.log('--- (Agent)-[:PERFORMED]->(Event) ---');

    const performedMissing = await countMissing(s,
      `MATCH (evt:Event)
       WHERE NOT EXISTS { ()-[:PERFORMED]->(evt) }
       ${missionFilter}
       RETURN COUNT(evt) AS count`,
      params
    );
    console.log(`  Missing: ${performedMissing}`);

    if (!DRY_RUN) {
      const performed = await runWrite(s,
        `MATCH (evt:Event)
         ${MISSION ? 'WHERE evt.mission_id = $mission' : ''}
         MERGE (ag:Agent {agent_id: evt.agent_id, mission_id: evt.mission_id})
         MERGE (ag)-[:PERFORMED]->(evt)
         RETURN COUNT(*) AS processed`,
        params
      );
      console.log(`  Processed: ${performed} events`);
    }
    console.log();

    // ----------------------------------------------------------------
    // 2. (Event)-[:CHILD_OF]->(Event)
    // ----------------------------------------------------------------
    console.log('--- (Event)-[:CHILD_OF]->(Event) ---');

    const childOfMissing = await countMissing(s,
      `MATCH (child:Event)
       WHERE child.parent_event_id IS NOT NULL
         AND NOT EXISTS { (child)-[:CHILD_OF]->() }
         ${missionFilter.replace('evt.', 'child.')}
       RETURN COUNT(child) AS count`,
      params
    );
    console.log(`  Missing: ${childOfMissing}`);

    if (!DRY_RUN) {
      const childOf = await runWrite(s,
        `MATCH (child:Event)
         WHERE child.parent_event_id IS NOT NULL
         ${MISSION ? 'AND child.mission_id = $mission' : ''}
         MATCH (parent:Event {sequence_id: child.parent_event_id})
         MERGE (child)-[:CHILD_OF]->(parent)
         RETURN COUNT(*) AS processed`,
        params
      );
      console.log(`  Processed: ${childOf} events`);
    }
    console.log();

    // ----------------------------------------------------------------
    // 3. (Event)-[:PRODUCED]->(Artifact)
    //    Inferred by matching event_type='artifact' events to Artifacts
    //    on (timestamp, agent_id, mission_id).
    // ----------------------------------------------------------------
    console.log('--- (Event)-[:PRODUCED]->(Artifact) ---');

    const producedMissing = await countMissing(s,
      `MATCH (evt:Event {event_type: 'artifact'})
       WHERE NOT EXISTS { (evt)-[:PRODUCED]->() }
       ${missionFilter}
       RETURN COUNT(evt) AS count`,
      params
    );
    console.log(`  Missing: ${producedMissing}`);
    if (producedMissing > 0) {
      console.log('  Note: PRODUCED is inferred by (timestamp, agent_id, mission_id).');
      console.log('        Review results if multiple artifact events share the same timestamp.');
    }

    if (!DRY_RUN) {
      const produced = await runWrite(s,
        `MATCH (evt:Event {event_type: 'artifact'})
         ${MISSION ? 'WHERE evt.mission_id = $mission' : ''}
         MATCH (art:Artifact {
           created_at: evt.timestamp,
           created_by: evt.agent_id,
           mission_id: evt.mission_id
         })
         MERGE (evt)-[:PRODUCED]->(art)
         RETURN COUNT(*) AS processed`,
        params
      );
      console.log(`  Processed: ${produced} event-artifact pairs`);
    }
    console.log();

    // ----------------------------------------------------------------
    // Summary
    // ----------------------------------------------------------------
    const total = performedMissing + childOfMissing + producedMissing;
    if (DRY_RUN) {
      console.log(`Dry run complete. Total missing edges: ${total}`);
      if (total === 0) console.log('Graph is already fully connected.');
    } else {
      console.log('Backfill complete.');
    }
  } finally {
    await s.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
