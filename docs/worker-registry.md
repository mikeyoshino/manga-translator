# Worker Registry & Heartbeat System

How GPU workers register, stay alive, and scale horizontally — and how the API server monitors them.

---

## Key Insight

**The API server doesn't need to know about individual workers.** It drops jobs into a Redis Stream and workers pick them up. The registry exists only for health monitoring.

---

## How It Works

### Worker Lifecycle (`server/worker.py`)

```
Start up
  │
  ├── Generate unique ID: "worker-{uuid}"
  ├── SADD workers:active "worker-c7b1fdbb"
  ├── SETEX worker:worker-c7b1fdbb:heartbeat 30 "alive"
  │
  ▼
Main loop
  │
  ├── XREADGROUP tasks:translate workers "worker-c7b1fdbb"  (block, wait for job)
  ├── Process job (one at a time, thread-locked)
  ├── XACK tasks:translate workers {msg_id}
  │
  ├── Every 10s: SETEX worker:worker-c7b1fdbb:heartbeat 30 "alive"
  │
  ▼
Shutdown (graceful)
  │
  ├── SREM workers:active "worker-c7b1fdbb"
  └── DEL worker:worker-c7b1fdbb:heartbeat
```

### API Server Side (`server/instance.py`)

The API server only **reads** the registry — it never writes to it:

- `active_worker_count()` — iterates the `workers:active` set, checks if each member's heartbeat key still exists
- `remove_stale_workers()` — removes workers whose heartbeat TTL has expired
- Exposed via `GET /health`:

```json
{
  "status": "healthy",
  "redis": true,
  "queue_length": 3,
  "active_workers": 2
}
```

### Redis Keys

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `workers:active` | Set | None | Set of all registered worker IDs |
| `worker:{id}:heartbeat` | String | 30s | Presence indicator — if key exists, worker is alive |

---

## What Happens When a Worker Dies

If a worker crashes without graceful shutdown:

1. Its heartbeat key expires after **30 seconds** (Redis TTL)
2. Next `active_worker_count()` call won't count it
3. `remove_stale_workers()` removes it from the `workers:active` set
4. Any **unacknowledged message** (no `XACK`) stays in the stream — another worker can claim it via Redis Streams' pending entry list

No jobs are lost. No manual intervention needed.

---

## Adding More Workers

### Locally

Just start another process. Each generates its own unique ID automatically:

```bash
# Terminal 1 (already running)
python -m server.worker --use-gpu --verbose

# Terminal 2
python -m server.worker --use-gpu --verbose

# Terminal 3
python -m server.worker --use-gpu --verbose
```

### With Docker Compose

```bash
docker-compose up --scale worker=4
```

### Why It Works Automatically

1. **Unique ID** — Each worker generates `worker-{uuid}` on startup, no config needed
2. **Redis Streams consumer groups** — When multiple consumers call `XREADGROUP` on the same group (`workers`), Redis distributes each message to exactly one consumer. No routing config needed.
3. **API server doesn't route jobs** — It does `XADD` (fire and forget). Doesn't care how many workers exist or which one picks up the job.
4. **Progress still works** — Each job has a unique `task_id`. The worker publishes to `progress:{task_id}`. The API is already subscribed to that specific channel, so it receives the result regardless of which worker processed it.

```
API Server                    Redis                         Workers
    │                           │
    │── XADD job_1 ───────────►│                              │
    │── SUBSCRIBE progress:1 ──►│                              │
    │                           │── deliver job_1 ──────────► Worker A
    │                           │                              │
    │── XADD job_2 ───────────►│                              │
    │── SUBSCRIBE progress:2 ──►│                              │
    │                           │── deliver job_2 ──────────► Worker B
    │                           │                              │
    │                           │◄── PUBLISH progress:1 ───── Worker A
    │◄── receive progress:1 ───│                              │
    │                           │◄── PUBLISH progress:2 ───── Worker B
    │◄── receive progress:2 ───│                              │
```

---

## Monitoring

### Health endpoint

```
GET /health
```

```json
{
  "status": "healthy",
  "redis": true,
  "queue_length": 12,
  "active_workers": 4
}
```

### Useful Redis CLI commands

```bash
# How many workers are registered
redis-cli SMEMBERS workers:active

# Check if a specific worker is alive
redis-cli EXISTS worker:worker-c7b1fdbb:heartbeat

# How many jobs are in the queue
redis-cli XLEN tasks:translate

# See pending (unacknowledged) messages
redis-cli XPENDING tasks:translate workers
```

---

## Scaling Guidelines

| Queue Depth | Action |
|-------------|--------|
| Consistently 0 | Workers are idle — can scale down |
| 1–5 pending | Normal operation |
| 5+ for > 60s | Add more workers |
| 20+ | Backlogged — scale up aggressively or reject new jobs |

See [scalable-infrastructure.md](./scalable-infrastructure.md) for autoscaling strategy and cloud deployment costs.
