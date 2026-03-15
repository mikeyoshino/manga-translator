"""
Redis-backed task queue using Redis Streams.

Replaces the old in-memory TaskQueue. The API server enqueues tasks into Redis;
standalone GPU workers consume them.
"""

import json
from typing import Optional

from server.redis_client import (
    enqueue_task,
    get_queue_length,
    get_result,
    subscribe_progress,
    active_worker_count,
)


class RedisTaskQueue:
    """Thin wrapper that mirrors the old TaskQueue interface where needed."""

    async def size(self) -> int:
        return await get_queue_length()

    async def enqueue(
        self,
        image_data: bytes,
        config_json: str,
        user_id: str = "",
        task_id: Optional[str] = None,
    ) -> str:
        """Enqueue a translation job. Returns task_id."""
        return await enqueue_task(image_data, config_json, user_id, task_id)

    async def get_result(self, task_id: str) -> Optional[bytes]:
        """Retrieve a stored result (pickled Context)."""
        return await get_result(task_id)

    async def active_workers(self) -> int:
        return await active_worker_count()


task_queue = RedisTaskQueue()
