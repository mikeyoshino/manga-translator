"""
Worker registry backed by Redis.

Replaces the old in-memory Executors/ExecutorInstance classes.
Workers register themselves via heartbeat keys; the API server
queries active worker count for health checks.
"""

from server.redis_client import (
    active_worker_count,
    remove_stale_workers,
)


class WorkerRegistry:
    """Read-only view of worker state for the API server."""

    async def active_count(self) -> int:
        return await active_worker_count()

    async def cleanup_stale(self):
        await remove_stale_workers()


worker_registry = WorkerRegistry()
