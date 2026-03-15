"""
Redis client module for the scalable translation infrastructure.

Provides:
- Shared async Redis connection pool
- Job queue via Redis Streams (XADD/XREADGROUP/XACK)
- Real-time progress streaming via Redis PubSub
- Worker registry with heartbeat TTL
"""

import json
import os
import time
import uuid
from typing import AsyncIterator, Optional

import redis.asyncio as aioredis

# ---------------------------------------------------------------------------
# Connection pool
# ---------------------------------------------------------------------------

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

_pool: Optional[aioredis.ConnectionPool] = None


def _get_pool() -> aioredis.ConnectionPool:
    global _pool
    if _pool is None:
        _pool = aioredis.ConnectionPool.from_url(REDIS_URL, decode_responses=False)
    return _pool


def get_redis() -> aioredis.Redis:
    """Return an async Redis client backed by the shared pool."""
    return aioredis.Redis(connection_pool=_get_pool())


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


async def ping() -> bool:
    """Health check — returns True if Redis is reachable."""
    try:
        r = get_redis()
        return await r.ping()
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

STREAM_KEY = "tasks:translate"
GROUP_NAME = "workers"
PROGRESS_CHANNEL_PREFIX = "progress:"
RESULT_KEY_PREFIX = "result:"
WORKER_KEY_PREFIX = "worker:"
WORKER_SET_KEY = "workers:active"

# Result expiry — 1 hour
RESULT_TTL = 3600


# ---------------------------------------------------------------------------
# Job queue helpers (API side)
# ---------------------------------------------------------------------------

async def ensure_consumer_group():
    """Create the consumer group if it doesn't exist yet."""
    r = get_redis()
    try:
        await r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
    except aioredis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            raise


async def enqueue_task(
    image_data: bytes,
    config_json: str,
    user_id: str = "",
    task_id: Optional[str] = None,
) -> str:
    """
    Add a translation job to the Redis Stream.

    Returns the task_id (UUID).
    """
    if task_id is None:
        task_id = uuid.uuid4().hex

    r = get_redis()

    # Store the (potentially large) image in a separate key so the stream
    # message stays small.
    image_key = f"task:{task_id}:image"
    await r.set(image_key, image_data, ex=RESULT_TTL)

    payload = {
        "task_id": task_id,
        "config": config_json,
        "user_id": user_id,
        "created_at": str(time.time()),
    }

    await r.xadd(STREAM_KEY, {k: v.encode() if isinstance(v, str) else v for k, v in payload.items()})
    return task_id


async def get_queue_length() -> int:
    """Return the number of pending messages in the stream."""
    r = get_redis()
    try:
        return await r.xlen(STREAM_KEY)
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Progress pub/sub helpers
# ---------------------------------------------------------------------------

async def publish_progress(task_id: str, code: int, data: bytes):
    """
    Publish a progress/result/error frame on the task's PubSub channel.

    Frame format (matches existing binary protocol):
      1 byte  — status code (0=result, 1=progress, 2=error, 3=queue pos, 4=waiting)
      4 bytes — payload length (big-endian)
      N bytes — payload
    """
    r = get_redis()
    frame = code.to_bytes(1, "big") + len(data).to_bytes(4, "big") + data
    await r.publish(f"{PROGRESS_CHANNEL_PREFIX}{task_id}", frame)


async def subscribe_progress(task_id: str) -> AsyncIterator[bytes]:
    """
    Yield raw binary frames from the task's PubSub channel.

    Stops after receiving a result (code 0) or error (code 2) frame.
    """
    r = get_redis()
    pubsub = r.pubsub()
    channel = f"{PROGRESS_CHANNEL_PREFIX}{task_id}"
    await pubsub.subscribe(channel)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            frame: bytes = message["data"]
            yield frame
            # code 0 = result, code 2 = error → stop
            if len(frame) >= 1 and frame[0] in (0, 2):
                break
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


# ---------------------------------------------------------------------------
# Result helpers
# ---------------------------------------------------------------------------

async def store_result(task_id: str, data: bytes):
    """Store the final result bytes (pickled Context) for retrieval."""
    r = get_redis()
    await r.set(f"{RESULT_KEY_PREFIX}{task_id}", data, ex=RESULT_TTL)


async def get_result(task_id: str) -> Optional[bytes]:
    """Retrieve stored result bytes."""
    r = get_redis()
    return await r.get(f"{RESULT_KEY_PREFIX}{task_id}")


async def get_task_image(task_id: str) -> Optional[bytes]:
    """Retrieve the image bytes uploaded for a task."""
    r = get_redis()
    return await r.get(f"task:{task_id}:image")


# ---------------------------------------------------------------------------
# Worker registry helpers
# ---------------------------------------------------------------------------

async def register_worker(worker_id: str):
    r = get_redis()
    await r.sadd(WORKER_SET_KEY, worker_id)
    await r.setex(f"{WORKER_KEY_PREFIX}{worker_id}:heartbeat", 30, b"alive")


async def heartbeat(worker_id: str):
    r = get_redis()
    await r.setex(f"{WORKER_KEY_PREFIX}{worker_id}:heartbeat", 30, b"alive")


async def unregister_worker(worker_id: str):
    r = get_redis()
    await r.srem(WORKER_SET_KEY, worker_id)
    await r.delete(f"{WORKER_KEY_PREFIX}{worker_id}:heartbeat")


async def active_worker_count() -> int:
    """Count workers whose heartbeat key still exists."""
    r = get_redis()
    members = await r.smembers(WORKER_SET_KEY)
    count = 0
    for wid in members:
        if await r.exists(f"{WORKER_KEY_PREFIX}{wid.decode() if isinstance(wid, bytes) else wid}:heartbeat"):
            count += 1
    return count


async def remove_stale_workers():
    """Remove workers whose heartbeat has expired."""
    r = get_redis()
    members = await r.smembers(WORKER_SET_KEY)
    for wid in members:
        wid_str = wid.decode() if isinstance(wid, bytes) else wid
        if not await r.exists(f"{WORKER_KEY_PREFIX}{wid_str}:heartbeat"):
            await r.srem(WORKER_SET_KEY, wid)
