#!/bin/bash
# Stop local dev environment: API server, worker, frontend, and Redis

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REDIS_CONTAINER="manga-redis"
PID_DIR="$SCRIPT_DIR/.dev-pids"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}Stopping local dev environment...${NC}"

# Kill API server
if [ -f "$PID_DIR/api.pid" ]; then
    PID=$(cat "$PID_DIR/api.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Stopped API server (PID: $PID)"
    fi
    rm -f "$PID_DIR/api.pid"
fi

# Kill worker
if [ -f "$PID_DIR/worker.pid" ]; then
    PID=$(cat "$PID_DIR/worker.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Stopped worker (PID: $PID)"
    fi
    rm -f "$PID_DIR/worker.pid"
fi

# Kill frontend (npm run dev spawns child processes, kill the whole group)
if [ -f "$PID_DIR/front.pid" ]; then
    PID=$(cat "$PID_DIR/front.pid")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Stopped frontend (PID: $PID)"
    fi
    rm -f "$PID_DIR/front.pid"
fi

# Also kill any leftover processes by port in case PID files were missing
lsof -ti:5003 2>/dev/null | xargs kill 2>/dev/null && echo "Killed process on port 5003" || true
lsof -ti:5173 2>/dev/null | xargs kill 2>/dev/null && echo "Killed process on port 5173" || true
lsof -ti:5174 2>/dev/null | xargs kill 2>/dev/null && echo "Killed process on port 5174" || true
lsof -ti:5175 2>/dev/null | xargs kill 2>/dev/null && echo "Killed process on port 5175" || true

# Stop Redis container
if docker ps --format '{{.Names}}' | grep -q "^${REDIS_CONTAINER}$"; then
    docker stop "$REDIS_CONTAINER" >/dev/null
    docker rm "$REDIS_CONTAINER" >/dev/null
    echo "Stopped Redis"
fi

rm -rf "$PID_DIR" 2>/dev/null || true

echo -e "${GREEN}All services stopped${NC}"
