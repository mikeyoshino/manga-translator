"""Health check endpoint."""

import os

from fastapi import APIRouter

router = APIRouter(tags=["api"])

WORKER_MODE = os.getenv("WORKER_MODE", "redis")


@router.get("/health")
async def health():
    result = {
        "status": "healthy",
        "worker_mode": WORKER_MODE,
        "sentry_enabled": bool(os.getenv("SENTRY_DSN", "")),
    }

    if WORKER_MODE == "runpod":
        from api.adapters.runpod import check_health
        runpod_health = await check_health()
        result["runpod"] = runpod_health
    else:
        from manga_shared.redis_protocol import ping, get_queue_length, active_worker_count
        redis_ok = await ping()
        queue_len = await get_queue_length() if redis_ok else -1
        workers = await active_worker_count() if redis_ok else 0
        if not redis_ok:
            result["status"] = "degraded"
        result["redis"] = redis_ok
        result["queue_length"] = queue_len
        result["active_workers"] = workers

    return result
