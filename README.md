# GlyphicSpore v1+ Backend

**Neo4j graph visualization layer for TriumvirateSwarm**

Part of the TSCP (Triune Swarm Coordination Protocol) ecosystem.

## Overview

GlyphicSpore is the structural visualization layer that transforms Partyline events into a queryable Neo4j graph. It provides:

- **Event Ingestion** — Accepts Partyline events via REST API
- **Graph Mutation** — Automatically updates Neo4j based on event type
- **Query Interface** — Exposes Neo4j queries for pattern discovery and visualization

## Architecture

```
Partyline (Redis Streams)
    ↓
Event Ingestion API (POST /api/event)
    ↓
EventIngestionService (validation + storage)
    ↓
Neo4j Graph (nodes: Agent, Artifact, Event, Pattern, Decision, Checkpoint, Error)
    ↓
GlyphicSpore UI (React + Three.js + D3)
```

## Prerequisites

- **Node.js** 18+
- **Neo4j** 5.0+ (running locally or remote)
- **Redis** (optional, for future Partyline subscription)

## Local Development (one command)

Requires [Docker](https://docs.docker.com/get-docker/) for automatic Neo4j + Redis startup.

```bash
chmod +x dev-up.sh
./dev-up.sh
```

What it does:

1. Copies `.env.example` → `.env` (if no `.env` exists)
2. Runs `npm install` (only if `node_modules` is absent)
3. Starts Neo4j + Redis via `docker-compose.yml` and waits for them to be healthy
4. Launches the backend with `npm run dev` (hot-reload on port 3001)
5. Stops containers on exit (Ctrl-C)

**Keep infrastructure running across backend restarts:**

```bash
./dev-up.sh --keep-services
```

**Tear down containers manually:**

```bash
# Docker Compose v2
docker compose down

# Docker Compose v1
docker-compose down
```

**URLs once running:**

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3001 |
| Neo4j browser | http://localhost:7474 |

## Historical Lineage Note

Graph edges (`PERFORMED`, `CHILD_OF`, `PRODUCED`) are written correctly for all new ingests.

Records written before this write path was implemented may remain as disconnected nodes with no edges. This is known historical debt and does not affect new data.

To inspect or repair older records, use the opt-in backfill utility:

```bash
# Inspect only — no writes
npm run backfill:edges

# Inspect scoped to one mission
npm run backfill:edges -- --mission-id TriumvirateSwarm

# Apply repairs (writes MERGE-safe edges)
npm run backfill:edges -- --apply

# Apply scoped to one mission
npm run backfill:edges -- --mission-id TriumvirateSwarm --apply
```

The script is idempotent and reports unresolved records it cannot repair by inference.

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your Neo4j credentials:

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
PORT=3001
MISSION_ID=TriumvirateSwarm
```

## Development

Start the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:3001`.

## Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Production

Start the production server:

```bash
npm start
```

## API Endpoints

### Health Check

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "service": "glyphicspore-backend",
  "timestamp": "2026-04-23T00:00:00.000Z",
  "checks": { "api": "ok", "neo4j": "ok", "redis": "ok" }
}
```

Returns `503` with `"status": "degraded"` if any dependency is unreachable.

### Ingest Event

```
POST /api/event
Content-Type: application/json
```

### Spores — list

```
GET /api/spores?mission_id=<missionId>
```

Returns all Artifacts for a mission aggregated with event count, agent count, and last activity timestamp.

### Spores — detail

```
GET /api/spores/:artifactId?mission_id=<missionId>
```

Returns a single Artifact with its producing Event chain and contributing Agents.

### Spores — lineage graph

```
GET /api/spores/:artifactId/lineage?mission_id=<missionId>
```

Returns `{ nodes, edges }` suitable for direct consumption by graph visualization libraries (Cytoscape, React Flow, etc.).

Node id format: `artifact:<id>` | `event:<sequenceId>` | `agent:<agentId>`

Edge types: `PERFORMED` | `PRODUCED` | `CHILD_OF`

## Graph Schema

Key node types:
- **Agent** — Swarm participants
- **Artifact** — Outputs (files, metrics, decisions)
- **Event** — Partyline events
- **Decision** — Decision points
- **Checkpoint** — Saved states
- **Error** — Error states

Key relationship types:
- **(Agent)-[:PERFORMED]->(Event)** — actor lineage
- **(Event)-[:PRODUCED]->(Artifact)** — provenance
- **(Event)-[:CHILD_OF]->(Event)** — causal sequencing

## Testing

```bash
npm test
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

```bash
docker build -t glyphicspore-backend .
docker run -p 3001:3001 --env-file .env glyphicspore-backend
```

## Documentation

- **TSCP-SPEC Section 3** — Partyline Protocol & Event Schema
- **graph-schema.cypher** — Neo4j schema definition
- **TSL v1 Grammar** — Swarm language specification

## License

Apache 2.0

## Contributing

This project is governed by **TSCP-GOV::TriumvirateSwarm::v1**.

All commits must be tagged: `[GOV: TSCP-GOV::TriumvirateSwarm::v1]`

## Support

For questions or issues, refer to the TriumvirateSwarm documentation or contact the maintainers.
