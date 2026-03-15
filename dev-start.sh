#!/bin/bash
# Start local dev environment: Redis + API server + 1 GPU worker + Frontend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDIS_CONTAINER="manga-redis"
PID_DIR="$SCRIPT_DIR/.dev-pids"
FRONT_DIR="$SCRIPT_DIR/front"
PYTHON="$SCRIPT_DIR/.venv/bin/python"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting local dev environment...${NC}"

# ---- Kill anything on our ports first ----
echo "Cleaning up stale processes..."
lsof -ti:5003 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5174 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5175 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5176 2>/dev/null | xargs kill -9 2>/dev/null || true

# Kill old PIDs if they exist
for pidfile in "$PID_DIR"/*.pid; do
    [ -f "$pidfile" ] || continue
    PID=$(cat "$pidfile")
    kill -9 "$PID" 2>/dev/null || true
    rm -f "$pidfile"
done

mkdir -p "$PID_DIR"

# 1. Start Redis (skip if already running)
if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    echo -e "${YELLOW}Redis already running${NC}"
else
    docker rm -f "$REDIS_CONTAINER" 2>/dev/null || true
    docker run -d --name "$REDIS_CONTAINER" -p 6379:6379 redis:7-alpine
    echo -e "${GREEN}Redis started${NC}"
fi

# Wait for Redis to be ready
echo "Waiting for Redis..."
until docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; do
    sleep 0.5
done
echo -e "${GREEN}Redis ready${NC}"

# 2. Start API server
echo "Starting API server on port 5003..."
$PYTHON "$SCRIPT_DIR/server/main.py" --host 0.0.0.0 --port 5003 &
echo $! > "$PID_DIR/api.pid"
echo -e "${GREEN}API server started (PID: $(cat "$PID_DIR/api.pid"))${NC}"

# 3. Start GPU worker
echo "Starting GPU worker..."
cd "$SCRIPT_DIR" && $PYTHON -m server.worker --use-gpu --verbose &
echo $! > "$PID_DIR/worker.pid"
echo -e "${GREEN}Worker started (PID: $(cat "$PID_DIR/worker.pid"))${NC}"

# 4. Start Frontend dev server
echo "Starting frontend dev server..."
cd "$FRONT_DIR" && npm run dev &
echo $! > "$PID_DIR/front.pid"
echo -e "${GREEN}Frontend started (PID: $(cat "$PID_DIR/front.pid"))${NC}"

cd "$SCRIPT_DIR"

echo ""
echo -e "${GREEN}All services running:${NC}"
echo "  Redis:      localhost:6379"
echo "  API:        http://localhost:5003"
echo "  Health:     http://localhost:5003/health"
echo "  Frontend:   http://localhost:5173"
echo ""
echo "To stop: ./dev-stop.sh"

# Wait for all background processes
wait
