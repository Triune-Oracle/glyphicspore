#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting GlyphicSpore local setup..."

# ---------- env ----------
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "  Creating .env from .env.example..."
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "  .env created — edit NEO4J_PASSWORD / REDIS_PASSWORD if your setup differs."
fi

# ---------- node dependencies ----------
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "  Installing npm dependencies..."
  cd "$ROOT_DIR"
  npm install
fi

# ---------- infrastructure (Neo4j + Redis) ----------
DOCKER_COMPOSE_CMD=""
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  DOCKER_COMPOSE_CMD="docker-compose"
fi

if [ -n "$DOCKER_COMPOSE_CMD" ]; then
  echo "  Starting Neo4j + Redis via Docker Compose..."
  $DOCKER_COMPOSE_CMD -f "$ROOT_DIR/docker-compose.yml" up -d
  echo "  Waiting 8 s for services to initialise..."
  sleep 8
else
  echo
  echo "  WARNING: Docker not found."
  echo "  Ensure Neo4j  is reachable at bolt://localhost:7687"
  echo "  Ensure Redis  is reachable at localhost:6379"
  echo "  before the server starts."
  echo
fi

# ---------- dev server ----------
cleanup() {
  echo
  echo "Shutting down..."
  if [ -n "$DOCKER_COMPOSE_CMD" ]; then
    $DOCKER_COMPOSE_CMD -f "$ROOT_DIR/docker-compose.yml" stop
  fi
}
trap cleanup EXIT INT TERM

echo "  Launching GlyphicSpore backend (port 3001)..."
cd "$ROOT_DIR"
npm run dev
