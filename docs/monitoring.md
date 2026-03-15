# Monitoring & Error Tracking

Crash and error monitoring using Sentry, with structured JSON logging and correlation IDs across the API server and GPU workers.

---

## Overview

| Component | What it does |
|-----------|-------------|
| `server/monitoring.py` | Initializes Sentry SDK (shared by API + worker) |
| `server/log_config.py` | JSON structured logging with `correlation_id` context var |
| Sentry SaaS | Error tracking, alerts, performance monitoring |

Both the API server and GPU worker initialize Sentry at startup. When `SENTRY_DSN` is not set, Sentry is disabled and the app runs normally — only structured JSON logging is active.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | `""` (disabled) | Sentry project DSN. Get one from [sentry.io](https://sentry.io) |
| `SENTRY_ENVIRONMENT` | `development` | Environment tag (`development`, `staging`, `production`) |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.2` (API) / `0.1` (worker) | Fraction of requests traced for performance monitoring (0.0–1.0) |

Add these to your `.env` file:

```env
SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.2
```

The `docker-compose.yml` passes these to both `api` and `worker` services automatically.

---

## What Gets Captured

### Errors

- **API server**: All unhandled exceptions in FastAPI endpoints are automatically captured by the Sentry FastAPI integration.
- **GPU worker**: Translation failures in `_process_job()` are explicitly sent via `sentry_sdk.capture_exception(e)`.
- **Heartbeat failures**: Previously silent (`pass`), now logged as warnings.

### Context & Tags

Every error in Sentry includes:

| Tag | Set by | Description |
|-----|--------|-------------|
| `task_id` | API + worker | The Redis task ID, allowing you to trace a request from API to worker |
| `worker_id` | Worker | Which worker processed the job |
| `service` | Both | `"api"` or `"worker"` (set via `server_name`) |

### Performance

When `SENTRY_TRACES_SAMPLE_RATE > 0`, Sentry Performance tracks:
- Request latency per endpoint
- Throughput and error rates
- Slow endpoint identification

---

## Structured Logging

All logs are emitted as JSON to stdout:

```json
{
  "timestamp": "2026-03-15 10:30:45,123",
  "level": "INFO",
  "logger": "worker",
  "message": "[worker-a1b2c3d4] Processing task abc-123",
  "correlation_id": "abc-123"
}
```

The `correlation_id` is set to the `task_id` for each job, making it easy to filter logs for a specific translation request.

---

## Health Check

The `/health` endpoint includes a `sentry_enabled` field:

```bash
curl http://localhost:5003/health
```

```json
{
  "status": "healthy",
  "redis": true,
  "queue_length": 0,
  "active_workers": 1,
  "sentry_enabled": true
}
```

---

## Setup

### 1. Create a Sentry project

1. Sign up at [sentry.io](https://sentry.io) (free tier: 5K errors/month, 10K transactions/month)
2. Create a new **Python** project
3. Copy the DSN

### 2. Add to `.env`

```env
SENTRY_DSN=https://your-key@o0.ingest.sentry.io/your-project-id
SENTRY_ENVIRONMENT=production
```

### 3. Install dependency (if running outside Docker)

```bash
pip install sentry-sdk[fastapi]
```

### 4. Verify

- Start the API server — look for `"Sentry initialized for service=api"` in logs
- Start a worker — look for `"Sentry initialized for service=worker"` in logs
- Trigger an error (e.g., upload a non-image file) — verify it appears in the Sentry dashboard with `task_id` tag

---

## Local Development

With no `SENTRY_DSN` in `.env`, Sentry is completely disabled. You still get:
- JSON structured logs to stdout
- Correlation IDs in log output
- The `/health` endpoint showing `"sentry_enabled": false`

No Sentry SDK network calls are made when the DSN is empty.

---

## Files

| File | Role |
|------|------|
| `server/monitoring.py` | `init_sentry(service)` — reads env vars, initializes SDK |
| `server/log_config.py` | `setup_logging(level)` — JSON formatter + `correlation_id` context var |
| `server/main.py` | Calls `setup_logging()` + `init_sentry("api")` at import time |
| `server/worker.py` | Calls `setup_logging()` + `init_sentry("worker")` in `main()` |
| `server/request_extraction.py` | Sets `task_id` Sentry tag when enqueuing jobs |
