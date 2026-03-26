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
  "success": true,
  "status": "healthy",
  "service": "glyphicspore-backend",
  "timestamp": "2026-03-26T10:15:42.123Z"
}
```

### Ingest Event

```
POST /api/event
Content-Type: application/json

{
  "agent_id": "manus",
  "event_type": "action",
  "mission_id": "TriumvirateSwarm",
  "context_delta": {
    "actor": "manus",
    "action": "build.compile",
    "target": "@repo"
  },
  "artifacts": [
    {
      "artifact_id": "@repo",
      "type": "artifact",
      "reference": "github.com/swarm-command/repo"
    }
  ],
  "references_gov": "TSCP-GOV::TriumvirateSwarm::v1"
}
```

Response:
```json
{
  "success": true,
  "event": {
    "timestamp": "2026-03-26T10:15:42.123Z",
    "sequence_id": 42,
    "agent_id": "manus",
    "event_type": "action",
    "mission_id": "TriumvirateSwarm",
    "context_delta": { ... },
    "artifacts": [ ... ],
    "references_gov": "TSCP-GOV::TriumvirateSwarm::v1"
  },
  "message": "Event 42 ingested successfully"
}
```

### Get Event (TODO)

```
GET /api/event/:sequenceId
```

### Get Mission Events (TODO)

```
GET /api/events/mission/:missionId
```

## Graph Schema

The Neo4j schema is defined in `graph-schema.cypher` (from `triune-oracle/glyphicspore`).

Key node types:
- **Agent** — Swarm participants
- **Artifact** — Outputs (files, metrics, decisions)
- **Event** — Partyline events
- **Pattern** — Emergent shorthand patterns
- **Decision** — Decision points
- **Checkpoint** — Saved states
- **Error** — Error states

## Testing

Run tests:

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

Build and run:

```bash
docker build -t glyphicspore-backend .
docker run -p 3001:3001 --env-file .env glyphicspore-backend
```

### Kubernetes

See `k8s/` directory for Helm charts and manifests.

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
