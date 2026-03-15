# Scalable Infrastructure for 50→1000 Concurrent Users

## Context
The previous server ran everything in a single process — in-memory task queue, in-memory worker registry, one translator instance. This could not scale beyond ~2-3 concurrent translations. The new architecture decouples the API from GPU workers via Redis, so each can scale independently.

---

## Architecture Overview

```
[Browser] → [Load Balancer] → [API Server x2] (stateless, no GPU)
                                     ↓
                                 [Redis]
                                (queue + progress pub/sub)
                                     ↓
                          [GPU Worker x1-16] (pull from Redis, run ML pipeline)
                                     ↓
                            [Supabase Storage] (results)
```

**Key principle**: API servers are stateless (no queue, no worker tracking). Workers pull jobs from Redis independently. Progress is streamed via Redis PubSub.

---

## Phase 1: Redis Queue (implemented)

### New files

| File | Purpose |
|------|---------|
| `server/redis_client.py` | Shared async Redis connection pool, Redis Streams queue (`XADD`/`XREADGROUP`/`XACK`), PubSub progress streaming, worker heartbeat registry |
| `server/worker.py` | Standalone GPU worker — pulls jobs from Redis, runs `MangaTranslator.translate()`, publishes progress via PubSub, stores results |
| `Dockerfile.api` | Lightweight API image (~200MB, no PyTorch) |
| `requirements-api.txt` | Minimal dependencies for the API server |

### Rewritten files

| File | What changed |
|------|-------------|
| `server/myqueue.py` | In-memory `TaskQueue` → `RedisTaskQueue` wrapping Redis Streams |
| `server/instance.py` | In-memory `Executors`/`ExecutorInstance` → `WorkerRegistry` backed by Redis SET + TTL heartbeat keys |
| `server/request_extraction.py` | `get_ctx()` enqueues to Redis and blocks on PubSub result; `while_streaming()` enqueues and streams PubSub frames (same binary protocol — zero frontend changes) |

### Modified files

| File | What changed |
|------|-------------|
| `server/main.py` | Removed `/register` endpoint, `start_translator_client_proc()`, nonce/subprocess logic. Added Redis init on startup/shutdown, `GET /health` endpoint. All translate endpoints unchanged. |
| `requirements.txt` | Added `redis[hiredis]` |
| `docker-compose.yml` | Separate `api`, `worker`, `redis` services with health checks |

### Deleted files

| File | Reason |
|------|--------|
| `server/sent_data_internal.py` | Replaced by Redis communication (was HTTP+pickle between API↔worker) |

### What stays unchanged
- **Frontend** — zero changes, same streaming protocol
- `server/auth.py`, `server/supabase_client.py`, `server/payment.py`, `server/projects.py`
- `manga_translator/manga_translator.py` (ML pipeline)
- `manga_translator/mode/share.py` (kept for CLI backward compat)
- All translate endpoint URLs and API contract

---

## How to Run

### Local development

```bash
# Start Redis
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start API server (stateless, no GPU needed)
python server/main.py --host 0.0.0.0 --port 5003

# Start GPU worker(s) in separate terminals
python -m server.worker --use-gpu --verbose
```

### Docker Compose

```bash
docker-compose up
```

This starts:
- `redis` — Redis 7 Alpine
- `api` — Lightweight FastAPI server (Dockerfile.api)
- `worker` — GPU worker (main Dockerfile)
- `front` — React frontend

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins |
| `TOKEN_COST_PER_IMAGE` | `1` | Tokens deducted per image translation |

---

## Phase 2: Separate Docker Images

### Lightweight API Dockerfile (`Dockerfile.api`)
- Base: `python:3.11-slim` (~200MB vs ~8GB GPU image)
- Only FastAPI + redis + supabase dependencies
- No PyTorch, no ML models

### docker-compose.yml structure
```yaml
services:
  api:
    build: { dockerfile: Dockerfile.api }
    depends_on: [redis]
  worker:
    build: { dockerfile: Dockerfile }
    deploy: { replicas: 2 }  # scale GPU workers
    depends_on: [redis]
  redis:
    image: redis:7-alpine
    volumes: [redis-data:/data]
```

---

## Phase 3: Cloud Deployment

### Recommended Stack (budget-friendly for indie SaaS)

| Component | Provider | Spec | Monthly Cost |
|-----------|----------|------|-------------|
| GPU Worker x1-2 | RunPod serverless | RTX 3090 / A10G | $30-200/mo (pay-per-use) |
| API Server x1-2 | Railway | 2 vCPU, 2GB RAM | $10-20/mo |
| Redis | Upstash (serverless) | Pay-per-command | $0-10/mo |
| Frontend | Vercel | Static | Free-$20/mo |
| Supabase | Existing | Pro plan | $25/mo |
| **Total (50 users)** | | | **~$65-275/mo** |

### Scaling estimates

| Concurrent Users | GPU Workers Needed | Est. Monthly Cost |
|-----------------|-------------------|-------------------|
| 50 | 1-2 | $100-300 |
| 100 | 2-4 | $250-600 |
| 500 | 4-8 | $500-1,500 |
| 1,000 | 8-16 | $1,000-2,500 |

### Autoscaling strategy
- Monitor Redis queue depth (`XLEN tasks:translate`)
- Queue > 5 for > 60s → spin up worker via RunPod API
- Queue empty for > 10min → shut down extra workers (keep minimum 1)
- Simple Python cron script — no Kubernetes needed

---

## Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "redis": true,
  "queue_length": 3,
  "active_workers": 2
}
```

---

## Verification Checklist

1. `docker-compose up` locally → 1 API + 1 worker + 1 Redis
2. Upload image via frontend → job appears in Redis Stream → worker picks it up → progress streams back → result displayed
3. Kill worker mid-translation → unacked message → restart worker → job resumes
4. Run 2 workers → verify both consume from same queue fairly
5. `GET /health` returns Redis status
6. Token deduction still works atomically via Supabase RPC
7. All existing frontend flows (project translate, direct translate) work identically
