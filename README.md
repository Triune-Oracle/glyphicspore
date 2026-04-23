# GlyphicSpore

**Neo4j graph visualization layer for TriumvirateSwarm**

Part of the TSCP (Triune Swarm Coordination Protocol) ecosystem.

## Overview

GlyphicSpore transforms Partyline events into a queryable Neo4j graph and exposes a lineage viewer UI.

- **Event Ingestion** — Accepts Partyline events via REST API
- **Graph Mutation** — Writes actor, provenance, and causal edges on every ingest
- **Lineage Viewer** — React frontend renders artifact provenance as an interactive node graph

## Architecture

```
Partyline (Redis Streams)
    ↓
Event Ingestion API (POST /api/event)   [backend, port 3001]
    ↓
Neo4j Graph  (Agent, Artifact, Event, Decision, Checkpoint, Error)
    ↓
Lineage API  (GET /api/spores/:artifactId/lineage)
    ↓
Lineage Viewer UI  [frontend, port 3000]
```

## Prerequisites

- **Node.js** 18+
- **Neo4j** 5.0+
- **Redis**
- **Docker** (for one-command local setup)

## Local Development (one command)

```bash
chmod +x dev-up.sh
./dev-up.sh
```

What it does:

1. Copies `.env.example` → `.env` (if absent)
2. Installs backend and frontend npm dependencies
3. Starts Neo4j + Redis via `docker-compose.yml`, waits for healthchecks
4. Launches the frontend (`npm run dev` in `frontend/`) on port 3000
5. Launches the backend (`npm run dev`) on port 3001
6. Stops both servers and containers on Ctrl-C

**Keep infrastructure running across restarts:**

```bash
./dev-up.sh --keep-services
```

**Tear down containers manually:**

```bash
docker compose down      # Compose v2
docker-compose down      # Compose v1
```

**URLs once running:**

| Service | URL |
|---------|-----|
| Lineage viewer (frontend) | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Neo4j browser | http://localhost:7474 |

## Historical Lineage Note

Graph edges (`PERFORMED`, `CHILD_OF`, `PRODUCED`) are written correctly for all new ingests.

Records written before this write path was implemented may remain as disconnected nodes. Use the opt-in backfill utility to repair them:

```bash
npm run backfill:edges                              # dry-run (default)
npm run backfill:edges -- --mission-id X            # dry-run, scoped
npm run backfill:edges -- --apply                   # live writes
npm run backfill:edges -- --mission-id X --apply    # live writes, scoped
```

Idempotent. Reports unresolved records it cannot repair by inference.

## Frontend

The lineage viewer lives in `frontend/` (Vite + React + React Flow).

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

Requires the backend running on port 3001. The Vite dev server proxies `/api/*` to `http://localhost:3001` automatically — no CORS configuration needed.

To use: enter an artifact ID and mission ID, click **Fetch lineage**. The graph renders artifact ← event chain ← agents with typed node colours and edge labels.

## Backend

```bash
npm install
npm run dev     # http://localhost:3001
```

## Installation

```bash
# Backend
npm install

# Frontend
cd frontend && npm install
```

## Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
PORT=3001
MISSION_ID=TriumvirateSwarm
```

## API Endpoints

### Health

```
GET /api/health
```

Live dependency check. Returns `503` with per-check breakdown if any dependency is unreachable.

### Ingest Event

```
POST /api/event
```

### Spores — list

```
GET /api/spores?mission_id=<missionId>
```

### Spores — detail

```
GET /api/spores/:artifactId?mission_id=<missionId>
```

### Spores — lineage graph

```
GET /api/spores/:artifactId/lineage?mission_id=<missionId>
```

Returns `{ nodes, edges }` for graph visualization.

Node id format: `artifact:<id>` | `event:<sequenceId>` | `agent:<agentId>`

Edge types: `PERFORMED` | `PRODUCED` | `CHILD_OF`

## Graph Schema

Node labels: `Agent`, `Artifact`, `Event`, `Decision`, `Checkpoint`, `Error`

Relationships:
- `(Agent)-[:PERFORMED]->(Event)` — actor lineage
- `(Event)-[:PRODUCED]->(Artifact)` — provenance
- `(Event)-[:CHILD_OF]->(Event)` — causal sequencing

## Testing

```bash
npm test
```

## Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

## Documentation

- **TSCP-SPEC Section 3** — Partyline Protocol & Event Schema
- **graph-schema.cypher** — Neo4j schema definition

## License

Apache 2.0

## Contributing

This project is governed by **TSCP-GOV::TriumvirateSwarm::v1**.

All commits must be tagged: `[GOV: TSCP-GOV::TriumvirateSwarm::v1]`
