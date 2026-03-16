# Architecture Overview

High-level overview of how the API server, Redis, and GPU workers interact.

---

## System Diagram

```
┌─────────────┐        HTTP / Stream       ┌──────────────────┐
│   Browser    │ ◄───────────────────────►  │   FastAPI API     │
│  (React SPA) │   REST + binary frames     │   server/main.py  │
└─────────────┘                             └────────┬─────────┘
                                                     │
                                              ┌──────▼──────┐
                                              │    Redis     │
                                              │              │
                                              │ ┌──────────┐ │
                                enqueue ────► │ │ Streams   │ │ ◄── xreadgroup (consume)
                                              │ └──────────┘ │
                                              │ ┌──────────┐ │
                             subscribe ◄───── │ │ PubSub   │ │ ◄── publish (progress)
                                              │ └──────────┘ │
                                              │ ┌──────────┐ │
                                              │ │ KV Store │ │ ◄── images, results, heartbeats
                                              │ └──────────┘ │
                                              └──────▲──────┘
                                                     │
                                              ┌──────┴─────────┐
                                              │   GPU Worker    │
                                              │  server/worker  │
                                              │ (MangaTranslator)│
                                              └────────────────┘
```

**Key principle**: The API server is stateless — it has no queue, no translator, no GPU. Workers are standalone processes that pull jobs from Redis independently. Progress is streamed back via Redis PubSub.

---

## Components

### API Server (`server/main.py`)

FastAPI application that handles all client-facing HTTP traffic:

- **Translation endpoints**: `/translate/json`, `/translate/bytes`, `/translate/image`, streaming variants, batch endpoints
- **Project management**: CRUD for projects and images, save/load editor state
- **Auth & payments**: Supabase auth, Omise payment, token balance
- **Health monitoring**: `GET /health` returns Redis status, queue length, active workers

The API server never touches the ML pipeline directly. It enqueues work into Redis and subscribes to results.

### Redis

Single Redis instance serving three roles:

| Role | Mechanism | Keys / Channels |
|------|-----------|-----------------|
| **Job queue** | Streams (`XADD` / `XREADGROUP` / `XACK`) | `tasks:translate` stream, consumer group `workers` |
| **Progress streaming** | PubSub | `progress:{task_id}` channels |
| **Temporary storage** | KV with TTL | `task:{id}:image` (uploaded image), `result:{id}` (pickled result), `worker:{id}:heartbeat` |

All keys expire after 1 hour (`RESULT_TTL = 3600`).

### GPU Worker (`server/worker.py`)

Standalone process that runs the ML translation pipeline:

- Consumes one job at a time from the Redis Stream (thread-locked)
- Runs `MangaTranslator.translate()` with the image and config
- Publishes real-time progress updates via PubSub
- Stores the final result in Redis KV
- Self-registers with a heartbeat (refreshed every 10s, expires after 30s)

Multiple workers can run on different machines/GPUs — they share the same consumer group and Redis distributes jobs automatically.

---

## Request Flow

### Single Image Translation

```
1. Client POST /translate/json  (image + config)
       │
       ▼
2. API: request_extraction.get_ctx()
       │
       ├── Store image bytes in Redis    →  SET task:{id}:image <bytes> EX 3600
       ├── Enqueue job to stream         →  XADD tasks:translate { task_id, config, user_id }
       └── Subscribe to progress         →  SUBSCRIBE progress:{task_id}
       │
       ▼
3. Worker: XREADGROUP (pulls message)
       │
       ├── Download image                →  GET task:{id}:image
       ├── Run MangaTranslator.translate()
       │     │
       │     ├── publish progress        →  PUBLISH progress:{id} [code=1, "detection"]
       │     ├── publish progress        →  PUBLISH progress:{id} [code=1, "ocr"]
       │     ├── publish progress        →  PUBLISH progress:{id} [code=1, "inpainting"]
       │     └── ...
       │
       ├── Store result                  →  SET result:{id} <pickled Context> EX 3600
       ├── Publish result frame          →  PUBLISH progress:{id} [code=0, <pickled Context>]
       └── Acknowledge                   →  XACK tasks:translate workers {msg_id}
       │
       ▼
4. API receives code=0 frame from PubSub
       │
       ├── Unpickle Context object
       └── Return JSON response to client
```

### Streaming Endpoints

Same flow, but the API yields each PubSub frame directly to the client as a `StreamingResponse`. The client receives real-time progress updates (detection → OCR → inpainting → translating → rendering → result).

### Batch Translation

Each image gets its own task_id and is enqueued separately. The API subscribes to all progress channels and collects results sequentially.

---

## Binary Frame Protocol

All progress/result communication uses a compact binary format:

```
┌──────────┬───────────────┬─────────────────┐
│ 1 byte   │ 4 bytes       │ N bytes         │
│ status   │ payload len   │ payload         │
│ code     │ (big-endian)  │                 │
└──────────┴───────────────┴─────────────────┘
```

| Code | Meaning | Payload |
|------|---------|---------|
| `0` | Result | Pickled `Context` object |
| `1` | Progress | Status string (`"detection"`, `"ocr"`, etc.) |
| `2` | Error | Error message string |
| `3` | Queue position | Position number string |
| `4` | Waiting | Empty (worker not yet available) |

This protocol is the same whether communication goes through Redis PubSub or directly via HTTP streaming — the frontend doesn't need to know the difference.

---

## Worker Registry

Workers manage their own lifecycle via Redis:

```
Register:    SADD workers:active {worker_id}
             SETEX worker:{id}:heartbeat 30 "alive"

Heartbeat:   SETEX worker:{id}:heartbeat 30 "alive"    (every 10s)

Unregister:  SREM workers:active {worker_id}
             DEL worker:{id}:heartbeat

Health check: for each member in workers:active
                EXISTS worker:{id}:heartbeat → alive or stale
```

The API server queries `active_worker_count()` for the `/health` endpoint. Stale workers (heartbeat expired) are cleaned up automatically.

---

## RunPod Serverless Mode

When `WORKER_MODE=runpod` (production), the API server bypasses Redis and submits jobs directly to RunPod's HTTP API:

```
┌─────────────┐        HTTP         ┌──────────────────┐       HTTP        ┌──────────────────────┐
│   Browser    │ ◄────────────────► │   FastAPI API     │ ◄──────────────► │   RunPod Serverless   │
│  (React SPA) │                    │   (Contabo VPS)   │                  │   runpod_handler.py   │
└─────────────┘                    └──────────────────┘                   └──────────────────────┘
                                     │                                      │
                                     │ submit_job() ──────────────────────► │ handler(event)
                                     │   POST /v2/{endpoint}/run            │   ├── Deserialize Config
                                     │                                      │   ├── Smart routing
                                     │ poll_job() ◄──────────────────────── │   │   (auto-select translator)
                                     │   GET /v2/{endpoint}/status/{id}     │   ├── MangaTranslator.translate()
                                     │                                      │   └── Return TranslationResponse
```

**Key differences from Redis mode:**
- No Redis needed — RunPod manages its own job queue
- No real-time progress streaming — API sends a "Processing on GPU..." frame, then polls until complete
- Smart routing (`server/smart_routing.py`) auto-selects the best translator chain based on `target_lang`
- Workers are managed by RunPod (auto-scale to 0, cold start on demand)

See [gpu-serverless.md](./gpu-serverless.md) for the full RunPod request flow, smart routing table, and setup details.

---

## Key Files

| File | Role |
|------|------|
| `server/main.py` | FastAPI endpoints — translation, projects, auth, payments |
| `server/request_extraction.py` | Enqueue → subscribe → return result orchestration (dual-mode) |
| `server/redis_client.py` | All Redis operations (streams, pubsub, KV, worker registry) |
| `server/myqueue.py` | Queue abstraction — `RedisTaskQueue` or `RunPodTaskQueue` based on `WORKER_MODE` |
| `server/worker.py` | Standalone GPU worker process (Redis mode) |
| `server/runpod_handler.py` | RunPod serverless entrypoint (RunPod mode) |
| `server/smart_routing.py` | Auto-selects optimal translator chain for target language |
| `server/runpod_adapter.py` | API-side HTTP client for RunPod (submit, poll, health) |
| `server/instance.py` | Worker registry queries for health checks |

---

## Why Redis (not RabbitMQ)?

Redis is already required for PubSub (progress streaming) and KV (temporary image/result storage). Using Redis Streams for the job queue avoids adding another service. The workload is GPU-bound — queue throughput is never the bottleneck, so RabbitMQ's advanced routing and delivery guarantees aren't needed. One service handles queue + pubsub + cache.

---

## Scaling

- **API servers**: Stateless — add more behind a load balancer
- **GPU workers**: Add more workers to the same Redis consumer group — jobs distribute automatically
- **Redis**: Single instance is sufficient for hundreds of concurrent users; upgrade to Redis Cluster if needed

See [scalable-infrastructure.md](./scalable-infrastructure.md) for deployment costs and autoscaling strategy.
