"""
Task queue abstraction and request extraction.

Supports dual mode:
- Redis (default): enqueue to Redis Streams, stream progress via PubSub
- RunPod: submit to RunPod Serverless via HTTP
"""

import asyncio
import builtins
import io
import os
import pickle
import re
from base64 import b64decode
from typing import Union, Optional

import requests
from PIL import Image
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse

from manga_shared.config import Config

WORKER_MODE = os.getenv("WORKER_MODE", "redis")


# ---------------------------------------------------------------------------
# Task Queue classes
# ---------------------------------------------------------------------------

class RedisTaskQueue:
    async def size(self) -> int:
        from manga_shared.redis_protocol import get_queue_length
        return await get_queue_length()

    async def enqueue(self, image_data: bytes, config_json: str,
                      user_id: str = "", task_id: Optional[str] = None) -> str:
        from manga_shared.redis_protocol import enqueue_task
        return await enqueue_task(image_data, config_json, user_id, task_id)

    async def get_result(self, task_id: str) -> Optional[bytes]:
        from manga_shared.redis_protocol import get_result
        return await get_result(task_id)

    async def active_workers(self) -> int:
        from manga_shared.redis_protocol import active_worker_count
        return await active_worker_count()


class RunPodTaskQueue:
    async def size(self) -> int:
        return 0

    async def enqueue(self, image_data: bytes, config_json: str,
                      user_id: str = "", task_id: Optional[str] = None) -> str:
        from api.adapters.runpod import submit_job, image_bytes_to_b64
        image_b64 = image_bytes_to_b64(image_data)
        job_id = await submit_job(image_b64, config_json)
        return job_id

    async def get_result(self, task_id: str) -> Optional[dict]:
        from api.adapters.runpod import poll_job
        return await poll_job(task_id)

    async def active_workers(self) -> int:
        return -1


def _create_queue():
    if WORKER_MODE == "runpod":
        return RunPodTaskQueue()
    return RedisTaskQueue()


task_queue = _create_queue()


# ---------------------------------------------------------------------------
# Image conversion helpers
# ---------------------------------------------------------------------------

async def to_pil_image(image: Union[str, bytes]) -> Image.Image:
    try:
        if isinstance(image, builtins.bytes):
            return Image.open(io.BytesIO(image))
        else:
            if re.match(r'^data:image/.+;base64,', image):
                value = image.split(',', 1)[1]
                image_data = b64decode(value)
                return Image.open(io.BytesIO(image_data))
            else:
                response = requests.get(image)
                return Image.open(io.BytesIO(response.content))
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


def _image_to_bytes(image: Union[str, bytes, Image.Image]) -> bytes:
    if isinstance(image, builtins.bytes):
        return image
    if isinstance(image, Image.Image):
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        return buf.getvalue()
    if isinstance(image, str):
        if re.match(r'^data:image/.+;base64,', image):
            value = image.split(',', 1)[1]
            return b64decode(value)
        else:
            return requests.get(image).content
    raise ValueError(f"Unsupported image type: {type(image)}")


# ---------------------------------------------------------------------------
# RunPod mode helpers
# ---------------------------------------------------------------------------

async def _runpod_translate(image_bytes: bytes, config: Config) -> dict:
    from api.adapters.runpod import submit_job, poll_job, image_bytes_to_b64
    image_b64 = image_bytes_to_b64(image_bytes)
    config_json = config.model_dump_json()
    job_id = await submit_job(image_b64, config_json)
    return await poll_job(job_id)


# ---------------------------------------------------------------------------
# get_ctx — main request handler
# ---------------------------------------------------------------------------

async def get_ctx(req: Request, config: Config, image: str | bytes):
    if WORKER_MODE == "runpod":
        return await _runpod_get_ctx(req, config, image)

    from manga_shared.redis_protocol import subscribe_progress

    image_bytes = _image_to_bytes(image)
    config_json = config.model_dump_json()
    task_id = await task_queue.enqueue(image_bytes, config_json)

    import sentry_sdk
    sentry_sdk.set_tag("task_id", task_id)

    result_data = None
    async for frame in subscribe_progress(task_id):
        code = frame[0]
        payload = frame[5:]
        if code == 0:
            result_data = payload
            break
        elif code == 2:
            raise HTTPException(500, detail=payload.decode("utf-8", errors="replace"))

    if result_data is None:
        result_data = await task_queue.get_result(task_id)
    if result_data is None:
        raise HTTPException(500, detail="Translation failed: no result received")

    return pickle.loads(result_data)


async def _runpod_get_ctx(req: Request, config: Config, image: str | bytes):
    image_bytes = _image_to_bytes(image)
    import sentry_sdk
    sentry_sdk.set_tag("worker_mode", "runpod")
    result = await _runpod_translate(image_bytes, config)
    if "error" in result:
        raise HTTPException(500, detail=result["error"])
    return result


# ---------------------------------------------------------------------------
# while_streaming — streaming handler
# ---------------------------------------------------------------------------

async def while_streaming(req: Request, transform, config: Config, image: bytes | str, on_error=None):
    if WORKER_MODE == "runpod":
        return await _runpod_while_streaming(req, transform, config, image, on_error=on_error)

    from manga_shared.redis_protocol import subscribe_progress

    image_bytes = _image_to_bytes(image)
    config_json = config.model_dump_json()
    task_id = await task_queue.enqueue(image_bytes, config_json)

    import sentry_sdk
    sentry_sdk.set_tag("task_id", task_id)

    async def _generate():
        try:
            async for frame in subscribe_progress(task_id):
                code = frame[0]
                payload = frame[5:]
                if code == 0:
                    ctx = pickle.loads(payload)
                    result_bytes = transform(ctx)
                    out = b'\x00' + len(result_bytes).to_bytes(4, 'big') + result_bytes
                    yield out
                    break
                elif code == 2:
                    if on_error:
                        on_error(payload.decode("utf-8", errors="replace"))
                    yield frame
                    break
                else:
                    yield frame
        except Exception as e:
            if on_error:
                on_error(str(e))
            raise

    return StreamingResponse(_generate(), media_type="application/octet-stream")


async def _runpod_while_streaming(req: Request, transform, config: Config, image: bytes | str, on_error=None):
    image_bytes = _image_to_bytes(image)

    async def _generate():
        progress_msg = b"Processing on GPU..."
        yield b'\x01' + len(progress_msg).to_bytes(4, 'big') + progress_msg

        try:
            result = await _runpod_translate(image_bytes, config)
            if "error" in result:
                if on_error:
                    on_error(result["error"])
                error_msg = result["error"].encode("utf-8")
                yield b'\x02' + len(error_msg).to_bytes(4, 'big') + error_msg
                return

            from api.models.responses import TranslationResponse
            response = TranslationResponse.model_validate(result)
            result_bytes = response.model_dump_json().encode("utf-8")
            yield b'\x00' + len(result_bytes).to_bytes(4, 'big') + result_bytes

        except Exception as e:
            if on_error:
                on_error(str(e))
            error_msg = f"RunPod error: {e}".encode("utf-8")
            yield b'\x02' + len(error_msg).to_bytes(4, 'big') + error_msg

    return StreamingResponse(_generate(), media_type="application/octet-stream")


# ---------------------------------------------------------------------------
# Batch
# ---------------------------------------------------------------------------

async def get_batch_ctx(req: Request, config: Config, images: list[str | bytes], batch_size: int = 4):
    if WORKER_MODE == "runpod":
        return await _runpod_get_batch_ctx(req, config, images, batch_size)

    from manga_shared.redis_protocol import subscribe_progress

    config_json = config.model_dump_json()
    tasks = []
    for img in images:
        image_bytes = _image_to_bytes(img)
        task_id = await task_queue.enqueue(image_bytes, config_json)
        tasks.append(task_id)

    results = []
    for task_id in tasks:
        result_data = None
        async for frame in subscribe_progress(task_id):
            code = frame[0]
            payload = frame[5:]
            if code == 0:
                result_data = payload
                break
            elif code == 2:
                raise HTTPException(500, detail=payload.decode("utf-8", errors="replace"))
        if result_data is None:
            result_data = await task_queue.get_result(task_id)
        if result_data is None:
            raise HTTPException(500, detail=f"Translation failed for task {task_id}")
        results.append(pickle.loads(result_data))

    return results


async def _runpod_get_batch_ctx(req: Request, config: Config, images: list[str | bytes], batch_size: int = 4):
    from api.adapters.runpod import submit_job, poll_job, image_bytes_to_b64
    config_json = config.model_dump_json()

    job_ids = []
    for img in images:
        image_bytes = _image_to_bytes(img)
        image_b64 = image_bytes_to_b64(image_bytes)
        job_id = await submit_job(image_b64, config_json)
        job_ids.append(job_id)

    results = await asyncio.gather(
        *[poll_job(jid) for jid in job_ids],
        return_exceptions=True,
    )

    validated = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            raise HTTPException(500, detail=f"Translation failed for job {job_ids[i]}: {result}")
        if "error" in result:
            raise HTTPException(500, detail=result["error"])
        validated.append(result)

    return validated
