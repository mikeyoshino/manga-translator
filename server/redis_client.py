"""
Re-exports Redis protocol from manga_shared for backward compatibility.

All definitions now live in packages/shared/manga_shared/redis_protocol.py.
"""

from manga_shared.redis_protocol import (  # noqa: F401
    # Connection
    REDIS_URL,
    get_redis,
    close_pool,
    ping,
    # Constants
    STREAM_KEY,
    GROUP_NAME,
    PROGRESS_CHANNEL_PREFIX,
    RESULT_KEY_PREFIX,
    WORKER_KEY_PREFIX,
    WORKER_SET_KEY,
    RESULT_TTL,
    # Job queue
    ensure_consumer_group,
    enqueue_task,
    get_queue_length,
    # Progress
    publish_progress,
    subscribe_progress,
    # Results
    store_result,
    get_result,
    get_task_image,
    # Worker registry
    register_worker,
    heartbeat,
    unregister_worker,
    active_worker_count,
    remove_stale_workers,
)
