"""
Standalone GPU worker that pulls translation jobs from Redis.

Usage:
    python -m worker.main [--redis-url redis://localhost:6379/0] [--verbose] [--use-gpu]
"""

import asyncio
import io
import json
import os
import pickle
import signal
import sys
import uuid
from threading import Lock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from dotenv import load_dotenv
load_dotenv()

from manga_shared.monitoring import init_sentry
from manga_shared.log_config import setup_logging, correlation_id
import sentry_sdk

import redis.asyncio as aioredis
from PIL import Image

from manga_translator import Config, Context, MangaTranslator
from manga_shared.redis_protocol import (
    STREAM_KEY,
    GROUP_NAME,
    RESULT_TTL,
    get_redis,
    ensure_consumer_group,
    publish_progress,
    store_result,
    get_task_image,
    register_worker,
    heartbeat,
    unregister_worker,
)

import logging

logger = logging.getLogger("worker")


class TranslationWorker:
    def __init__(self, params: dict):
        self.worker_id = f"worker-{uuid.uuid4().hex[:8]}"
        self.translator = MangaTranslator(params)
        self.lock = Lock()
        self._running = True
        self._current_task_id: str | None = None

        async def _progress_hook(state: str, finished: bool):
            if self._current_task_id:
                await publish_progress(
                    self._current_task_id, 1, state.encode("utf-8"),
                )

        self.translator.add_progress_hook(_progress_hook)

    async def run(self):
        await ensure_consumer_group()
        await register_worker(self.worker_id)

        logger.info(f"Worker {self.worker_id} started, listening on stream '{STREAM_KEY}'")

        r = get_redis()
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        try:
            while self._running:
                try:
                    messages = await r.xreadgroup(
                        GROUP_NAME, self.worker_id,
                        {STREAM_KEY: ">"}, count=1, block=5000,
                    )
                except aioredis.ResponseError as e:
                    if "NOGROUP" in str(e):
                        await ensure_consumer_group()
                        continue
                    raise

                if not messages:
                    continue

                for stream_name, entries in messages:
                    for msg_id, fields in entries:
                        await self._process_job(r, msg_id, fields)

        except asyncio.CancelledError:
            pass
        finally:
            heartbeat_task.cancel()
            await unregister_worker(self.worker_id)
            logger.info(f"Worker {self.worker_id} stopped")

    async def _process_job(self, r: aioredis.Redis, msg_id: bytes, fields: dict):
        import time as _time

        task_id = fields[b"task_id"].decode()
        config_json = fields[b"config"].decode()
        correlation_id.set(task_id)

        config = Config.model_validate_json(config_json)

        sentry_sdk.set_tag("task_id", task_id)
        sentry_sdk.set_tag("worker_id", self.worker_id)
        sentry_sdk.set_tag("translator", str(config.translator.id if hasattr(config.translator, 'id') else config.translator))
        sentry_sdk.set_tag("detector", str(config.detector))

        logger.info(f"[{self.worker_id}] Processing task {task_id}")

        self._current_task_id = task_id
        job_start = _time.monotonic()

        try:
            sentry_sdk.add_breadcrumb(category="worker", message="Downloading image from Redis", level="info")
            image_data = await get_task_image(task_id)
            if image_data is None:
                await publish_progress(task_id, 2, b"Image data expired or not found")
                await r.xack(STREAM_KEY, GROUP_NAME, msg_id)
                return

            sentry_sdk.add_breadcrumb(category="worker", message="Image downloaded, starting translation", level="info")
            image = Image.open(io.BytesIO(image_data))

            self.lock.acquire()
            try:
                ctx = await self.translator.translate(image=image, config=config)
            finally:
                self.lock.release()

            sentry_sdk.add_breadcrumb(category="worker", message="Translation completed, storing result", level="info")

            result_bytes = pickle.dumps(ctx)
            await store_result(task_id, result_bytes)
            await publish_progress(task_id, 0, result_bytes)

            duration_ms = round((_time.monotonic() - job_start) * 1000, 1)
            logger.info(f"[{self.worker_id}] Task {task_id} completed in {duration_ms}ms")

        except Exception as e:
            duration_ms = round((_time.monotonic() - job_start) * 1000, 1)
            sentry_sdk.capture_exception(e)
            error_msg = f"Translation failed: {e}"
            logger.error(f"[{self.worker_id}] Task {task_id} error after {duration_ms}ms: {error_msg}")
            await publish_progress(task_id, 2, error_msg.encode("utf-8"))

        finally:
            self._current_task_id = None
            await r.xack(STREAM_KEY, GROUP_NAME, msg_id)

    async def _heartbeat_loop(self):
        while self._running:
            try:
                await heartbeat(self.worker_id)
            except Exception as e:
                logger.warning("Heartbeat failed: %s", e)
            await asyncio.sleep(10)

    def stop(self):
        self._running = False


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Manga translation GPU worker")
    parser.add_argument("--redis-url", default=None, help="Redis URL override")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--use-gpu", action="store_true")
    parser.add_argument("--use-gpu-limited", action="store_true")
    parser.add_argument("--ignore-errors", action="store_true")
    parser.add_argument("--models-ttl", type=int, default=0)
    parser.add_argument("--pre-dict", default=None)
    parser.add_argument("--post-dict", default=None)
    args = parser.parse_args()

    if args.redis_url:
        os.environ["REDIS_URL"] = args.redis_url
        import manga_shared.redis_protocol as rp
        rp._pool = None

    setup_logging(level=logging.DEBUG if args.verbose else logging.INFO)
    init_sentry(service="worker")

    params = {
        "use_gpu": args.use_gpu,
        "use_gpu_limited": args.use_gpu_limited,
        "ignore_errors": args.ignore_errors,
        "verbose": args.verbose,
        "models_ttl": args.models_ttl,
        "pre_dict": args.pre_dict,
        "post_dict": args.post_dict,
    }

    worker = TranslationWorker(params)

    def _signal_handler(sig, frame):
        logger.info("Received shutdown signal")
        worker.stop()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    asyncio.run(worker.run())


if __name__ == "__main__":
    main()
