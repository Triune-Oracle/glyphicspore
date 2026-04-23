#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Parse flags
KEEP_SERVICES=false
for arg in "$@"; do
  case "$arg" in
    --keep-services) KEEP_SERVICES=true ;;
    --help)
      echo "Usage: ./dev-up.sh [--keep-services]"
      echo "  --keep-services  Leave Neo4j/Redis containers running when servers exit."
      exit 0
      ;;
  esac
done

echo "Starting GlyphicSpore local setup..."

# ---------- env ----------
if [ ! -f "$ROOT_DIR/.env" ]; then
  echo "  Creating .env from .env.example..."
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "  .env created — edit NEO4J_PASSWORD / REDIS_PASSWORD if your setup differs."
fi

# ---------- backend dependencies ----------
if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "  Installing backend dependencies..."
  cd "$ROOT_DIR"
  npm install
fi

# ---------- frontend dependencies ----------
if [ -d "$FRONTEND_DIR" ] && [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "  Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm install
fi

# ---------- infrastructure (Neo4j + Redis) ----------
DOCKER_COMPOSE_CMD=""
DOCKER_COMPOSE_SUPPORTS_WAIT=false

if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
  DOCKER_COMPOSE_SUPPORTS_WAIT=true
elif command -v docker-compose &>/dev/null; then
  DOCKER_COMPOSE_CMD="docker-compose"
fi

# Poll a TCP port until open or timeout
wait_for_port() {
  local host="$1" port="$2" label="$3"
  local max=30 i=0
  echo -n "  Waiting for $label"
  until nc -z "$host" "$port" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -ge "$max" ]; then
      echo " timed out after $((max * 2)) s. Check docker logs."
      return 1
    fi
    echo -n "."
    sleep 2
  done
  echo " ready."
}

if [ -n "$DOCKER_COMPOSE_CMD" ]; then
  echo "  Starting Neo4j + Redis via Docker Compose..."
  if [ "$DOCKER_COMPOSE_SUPPORTS_WAIT" = true ]; then
    $DOCKER_COMPOSE_CMD -f "$ROOT_DIR/docker-compose.yml" up -d --wait
    echo "  All services healthy."
  else
    $DOCKER_COMPOSE_CMD -f "$ROOT_DIR/docker-compose.yml" up -d
    wait_for_port localhost 6379 "Redis (port 6379)"
    wait_for_port localhost 7474 "Neo4j  (port 7474)"
  fi
else
  echo
  echo "  WARNING: Docker not found."
  echo "  Ensure Neo4j  is reachable at bolt://localhost:7687"
  echo "  Ensure Redis  is reachable at localhost:6379"
  echo
fi

# ---------- cleanup ----------
FRONTEND_PID=""

cleanup() {
  echo
  if [ -n "$FRONTEND_PID" ]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ "$KEEP_SERVICES" = false ] && [ -n "$DOCKER_COMPOSE_CMD" ]; then
    echo "  Stopping infrastructure containers..."
    $DOCKER_COMPOSE_CMD -f "$ROOT_DIR/docker-compose.yml" stop
  else
    echo "  Infrastructure containers left running (--keep-services active)."
    echo "  Stop manually with: docker compose -f docker-compose.yml down"
  fi
}
trap cleanup EXIT INT TERM

# ---------- frontend ----------
if [ -d "$FRONTEND_DIR" ]; then
  echo "  Launching frontend (port 3000)..."
  cd "$FRONTEND_DIR"
  npm run dev &
  FRONTEND_PID=$!
fi

# ---------- backend ----------
echo
echo "  GlyphicSpore starting."
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:3001"
echo "  Neo4j:      http://localhost:7474"
echo
cd "$ROOT_DIR"
npm run dev
