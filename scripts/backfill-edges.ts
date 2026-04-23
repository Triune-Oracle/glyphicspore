#!/usr/bin/env tsx
/**
 * Backfill edge repair utility for GlyphicSpore.
 *
 * POLICY: forward-correct by default.
 *   All new ingests write graph edges correctly. This script is opt-in
 *   maintenance — run it only if historical lineage completeness matters.
 *
 * Usage:
 *   npm run backfill:edges                             # dry-run (safe default)
 *   npm run backfill:edges -- --apply                  # live writes
 *   npm run backfill:edges -- --mission-id X           # dry-run, one mission
 *   npm run backfill:edges -- --mission-id X --apply   # live writes, one mission
 *
 * --apply is required to perform any writes. Without it the script reports
 * counts only and exits cleanly.
 *
 * Idempotent: all writes use MERGE — safe to run multiple times.
 *
 * Edges repaired:
 *   (Agent)-[:PERFORMED]->(Event)   inferred from evt.agent_id
 *   (Event)-[:CHILD_OF]->(Event)    inferred from evt.parent_event_id
 *   (Event)-[:PRODUCED]->(Artifact) inferred by (timestamp, agent_id, mission_id)
 *
 * Limitation (PRODUCED only):
 *   If two artifact events from the same agent share the same millisecond
 *   timestamp, cross-links are possible. Documented and acceptable for
 *   an opt-in repair pass; not a concern for new writes.
 */

import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

dotenv.config();

const args       = process.argv.slice(2);
const APPLY      = args.includes('--apply');
const DRY_RUN    = !APPLY;
const missionIdx = args.indexOf('--mission-id');
const MISSION    = missionIdx >= 0 ? args[missionIdx + 1] : null;

const NEO4J_URI      = process.env.NEO4J_URI      || 'bolt://localhost:7687';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

type Session = ReturnType<ReturnType<typeof neo4j.driver>['session']>;

async function count(s: Session, cypher: string, params: Record<string, unknown> = {}): Promise<number> {
  const r = await s.run(cypher, params);
  const v = r.records[0]?.get('count');
  return v != null ? Number(v) : 0;
}

async function write(s: Session, cypher: string, params: Record<string, unknown> = {}): Promise<number> {
  const r = await s.run(cypher, params);
  const v = r.records[0]?.get('processed');
  return v != null ? Number(v) : 0;
}

async function main() {
  console.log('GlyphicSpore — edge backfill utility');
  console.log('-------------------------------------');
  console.log(`Mode:          ${DRY_RUN ? 'DRY RUN (pass --apply to write)' : 'LIVE WRITES'}`);
  console.log(`Mission scope: ${MISSION ?? 'all missions'}`);
  console.log();

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD));
  await driver.verifyConnectivity();
  console.log('✓ Neo4j connected');
  console.log();

  const p      = MISSION ? { mission: MISSION } : {};
  const mScope = MISSION ? 'AND evt.mission_id = $mission' : '';
  const s      = driver.session();

  // Running totals for summary
  let performedToCreate = 0, performedProcessed = 0;
  let childOfToCreate   = 0, childOfProcessed   = 0;
  let producedToCreate  = 0, producedProcessed  = 0;

  // Unresolved counts (always computed regardless of mode)
  let unresolvedParent   = 0;
  let unresolvedArtifact = 0;

  try {
    // ---------------------------------------------------------------
    // 1. (Agent)-[:PERFORMED]->(Event)
    // ---------------------------------------------------------------
    performedToCreate = await count(s,
      `MATCH (evt:Event)
       WHERE NOT EXISTS { ()-[:PERFORMED]->(evt) } ${mScope}
       RETURN COUNT(evt) AS count`, p);

    if (!DRY_RUN) {
      performedProcessed = await write(s,
        `MATCH (evt:Event)
         ${MISSION ? 'WHERE evt.mission_id = $mission' : ''}
         MERGE (ag:Agent {agent_id: evt.agent_id, mission_id: evt.mission_id})
         MERGE (ag)-[:PERFORMED]->(evt)
         RETURN COUNT(*) AS processed`, p);
    }

    // ---------------------------------------------------------------
    // 2. (Event)-[:CHILD_OF]->(Event)
    // ---------------------------------------------------------------
    childOfToCreate = await count(s,
      `MATCH (child:Event)
       WHERE child.parent_event_id IS NOT NULL
         AND NOT EXISTS { (child)-[:CHILD_OF]->() }
         ${MISSION ? 'AND child.mission_id = $mission' : ''}
       RETURN COUNT(child) AS count`, p);

    // Unresolved: parent_event_id set but no matching parent Event exists
    unresolvedParent = await count(s,
      `MATCH (child:Event)
       WHERE child.parent_event_id IS NOT NULL
         ${MISSION ? 'AND child.mission_id = $mission' : ''}
         AND NOT EXISTS { (:Event {sequence_id: child.parent_event_id}) }
       RETURN COUNT(child) AS count`, p);

    if (!DRY_RUN) {
      childOfProcessed = await write(s,
        `MATCH (child:Event)
         WHERE child.parent_event_id IS NOT NULL
           ${MISSION ? 'AND child.mission_id = $mission' : ''}
         MATCH (parent:Event {sequence_id: child.parent_event_id})
         MERGE (child)-[:CHILD_OF]->(parent)
         RETURN COUNT(*) AS processed`, p);
    }

    // ---------------------------------------------------------------
    // 3. (Event)-[:PRODUCED]->(Artifact)
    //    Inferred by (timestamp, agent_id, mission_id)
    // ---------------------------------------------------------------
    producedToCreate = await count(s,
      `MATCH (evt:Event {event_type: 'artifact'})
       WHERE NOT EXISTS { (evt)-[:PRODUCED]->() } ${mScope}
       RETURN COUNT(evt) AS count`, p);

    // Unresolved: artifact event with no matching Artifact by inference key
    unresolvedArtifact = await count(s,
      `MATCH (evt:Event {event_type: 'artifact'})
       WHERE NOT EXISTS {
         (:Artifact {created_at: evt.timestamp, created_by: evt.agent_id, mission_id: evt.mission_id})
       } ${mScope}
       RETURN COUNT(evt) AS count`, p);

    if (!DRY_RUN) {
      producedProcessed = await write(s,
        `MATCH (evt:Event {event_type: 'artifact'})
         ${MISSION ? 'WHERE evt.mission_id = $mission' : ''}
         MATCH (art:Artifact {
           created_at: evt.timestamp,
           created_by: evt.agent_id,
           mission_id: evt.mission_id
         })
         MERGE (evt)-[:PRODUCED]->(art)
         RETURN COUNT(*) AS processed`, p);
    }

    // ---------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------
    console.log('Backfill summary');
    console.log('----------------');
    console.log(`Mission scope: ${MISSION ?? 'all missions'}`);
    console.log(`Mode:          ${DRY_RUN ? 'dry run' : 'applied'}`);
    console.log();

    if (DRY_RUN) {
      console.log(`PERFORMED edges to create: ${performedToCreate}`);
      console.log(`CHILD_OF  edges to create: ${childOfToCreate}`);
      console.log(`PRODUCED  edges to create: ${producedToCreate}`);
    } else {
      console.log(`PERFORMED: processed ${performedProcessed} events`);
      console.log(`CHILD_OF:  processed ${childOfProcessed} events`);
      console.log(`PRODUCED:  processed ${producedProcessed} event-artifact pairs`);
    }

    console.log();
    console.log(`Unresolved parent_event_id references (orphan parent):  ${unresolvedParent}`);
    console.log(`Unresolved PRODUCED inference (no matching artifact):   ${unresolvedArtifact}`);

    if (unresolvedParent > 0 || unresolvedArtifact > 0) {
      console.log();
      console.log('Note: unresolved records cannot be repaired by inference alone.');
      console.log('      They remain as-is and do not affect new ingests.');
    }

    console.log();
    const totalMissing = performedToCreate + childOfToCreate + producedToCreate;
    if (DRY_RUN && totalMissing === 0) {
      console.log('Graph is already fully connected. Nothing to repair.');
    } else if (!DRY_RUN) {
      console.log('Done.');
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
