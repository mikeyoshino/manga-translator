"""
Task queue abstraction with dual-mode support.

WORKER_MODE=redis (default) — jobs go to Redis Streams, consumed by GPU workers.
WORKER_MODE=runpod — jobs submitted to RunPod Serverless via HTTP.
"""

import json
import os
from typing import Optional

WORKER_MODE = os.getenv("WORKER_MODE", "redis")


class RedisTaskQueue:
    """Redis Streams-backed task queue (unchanged)."""

    async def size(self) -> int:
        from server.redis_client import get_queue_length
        return await get_queue_length()

    async def enqueue(
        self,
        image_data: bytes,
        config_json: str,
        user_id: str = "",
        task_id: Optional[str] = None,
    ) -> str:
        from server.redis_client import enqueue_task
        return await enqueue_task(image_data, config_json, user_id, task_id)

    async def get_result(self, task_id: str) -> Optional[bytes]:
        from server.redis_client import get_result
        return await get_result(task_id)

    async def active_workers(self) -> int:
        from server.redis_client import active_worker_count
        return await active_worker_count()


class RunPodTaskQueue:
    """RunPod Serverless-backed task queue. Same interface as RedisTaskQueue."""

    async def size(self) -> int:
        # RunPod manages its own queue; report 0 locally
        return 0

    async def enqueue(
        self,
        image_data: bytes,
        config_json: str,
        user_id: str = "",
        task_id: Optional[str] = None,
    ) -> str:
        from server.runpod_adapter import submit_job, image_bytes_to_b64

        image_b64 = image_bytes_to_b64(image_data)
        job_id = await submit_job(image_b64, config_json)
        return job_id

    async def get_result(self, task_id: str) -> Optional[dict]:
        """Poll RunPod for result. Returns TranslationResponse dict (not pickled bytes)."""
        from server.runpod_adapter import poll_job
        return await poll_job(task_id)

    async def active_workers(self) -> int:
        # RunPod auto-scales; not meaningful to count
        return -1


def _create_queue():
    if WORKER_MODE == "runpod":
        return RunPodTaskQueue()
    return RedisTaskQueue()


task_queue = _create_queue()
