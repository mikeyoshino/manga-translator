"""
Request extraction and streaming for the translation API.

Supports dual mode:
- Redis (default): enqueue to Redis Streams, stream progress via PubSub
- RunPod: submit to RunPod Serverless, poll for result (no real-time streaming)
"""

import asyncio
import builtins
import io
import pickle
import re
from base64 import b64decode
from typing import Union

import requests
from PIL import Image
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from manga_translator.config import Config
from server.myqueue import task_queue, WORKER_MODE


class TranslateRequest(BaseModel):
    """This request can be a multipart or a json request"""
    image: bytes | str
    """can be a url, base64 encoded image or a multipart image"""
    config: Config = Config()
    """in case it is a multipart this needs to be a string(json.stringify)"""


class BatchTranslateRequest(BaseModel):
    """Batch translation request"""
    images: list[bytes | str]
    """List of images, can be URLs, base64 encoded strings, or binary data"""
    config: Config = Config()
    """Translation configuration"""
    batch_size: int = 4
    """Batch size, default is 4"""


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
    """Convert various image formats to raw PNG bytes for Redis storage."""
    if isinstance(image, builtins.bytes):
        return image
    if isinstance(image, Image.Image):
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        return buf.getvalue()
    # str — could be base64 or URL; decode first
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
    """Submit to RunPod and poll for result. Returns TranslationResponse dict."""
    from server.runpod_adapter import submit_job, poll_job, image_bytes_to_b64

    image_b64 = image_bytes_to_b64(image_bytes)
    config_json = config.model_dump_json()
    job_id = await submit_job(image_b64, config_json)
    return await poll_job(job_id)


# ---------------------------------------------------------------------------
# Redis mode (original)
# ---------------------------------------------------------------------------

async def get_ctx(req: Request, config: Config, image: str | bytes):
    """Enqueue job, wait for result, return deserialized Context."""
    if WORKER_MODE == "runpod":
        return await _runpod_get_ctx(req, config, image)

    from server.redis_client import subscribe_progress

    image_bytes = _image_to_bytes(image)
    config_json = config.model_dump_json()

    task_id = await task_queue.enqueue(image_bytes, config_json)
    import sentry_sdk
    sentry_sdk.set_tag("task_id", task_id)

    # Subscribe to progress and wait for the result frame
    result_data = None
    async for frame in subscribe_progress(task_id):
        code = frame[0]
        payload = frame[5:]  # skip 1-byte code + 4-byte length
        if code == 0:
            result_data = payload
            break
        elif code == 2:
            raise HTTPException(500, detail=payload.decode("utf-8", errors="replace"))

    if result_data is None:
        # Fallback: try fetching stored result
        result_data = await task_queue.get_result(task_id)

    if result_data is None:
        raise HTTPException(500, detail="Translation failed: no result received")

    return pickle.loads(result_data)


async def _runpod_get_ctx(req: Request, config: Config, image: str | bytes):
    """RunPod mode: submit + poll, return TranslationResponse dict (not Context)."""
    image_bytes = _image_to_bytes(image)
    import sentry_sdk
    sentry_sdk.set_tag("worker_mode", "runpod")

    result = await _runpod_translate(image_bytes, config)

    if "error" in result:
        raise HTTPException(500, detail=result["error"])

    return result


async def while_streaming(req: Request, transform, config: Config, image: bytes | str, on_error=None):
    """Enqueue job and stream progress frames back to the client."""
    if WORKER_MODE == "runpod":
        return await _runpod_while_streaming(req, transform, config, image, on_error=on_error)

    from server.redis_client import subscribe_progress

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
                    # Result frame — transform the pickled Context
                    ctx = pickle.loads(payload)
                    result_bytes = transform(ctx)
                    out = b'\x00' + len(result_bytes).to_bytes(4, 'big') + result_bytes
                    yield out
                    break
                elif code == 2:
                    # Error frame — trigger refund callback, then forward
                    if on_error:
                        on_error(payload.decode("utf-8", errors="replace"))
                    yield frame
                    break
                else:
                    # Progress / queue position / waiting — forward as-is
                    yield frame
        except Exception as e:
            if on_error:
                on_error(str(e))
            raise

    return StreamingResponse(_generate(), media_type="application/octet-stream")


async def _runpod_while_streaming(req: Request, transform, config: Config, image: bytes | str, on_error=None):
    """
    RunPod mode streaming: emit a "processing" progress frame,
    poll RunPod for the result, then emit the result frame.
    """
    image_bytes = _image_to_bytes(image)

    async def _generate():
        # Emit a progress frame so the client knows we're working
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

            # RunPod returns TranslationResponse dict — encode it as the transform expects
            from server.to_json import TranslationResponse
            response = TranslationResponse.model_validate(result)
            result_bytes = response.model_dump_json().encode("utf-8")
            yield b'\x00' + len(result_bytes).to_bytes(4, 'big') + result_bytes

        except Exception as e:
            if on_error:
                on_error(str(e))
            error_msg = f"RunPod error: {e}".encode("utf-8")
            yield b'\x02' + len(error_msg).to_bytes(4, 'big') + error_msg

    return StreamingResponse(_generate(), media_type="application/octet-stream")


async def get_batch_ctx(req: Request, config: Config, images: list[str | bytes], batch_size: int = 4):
    """Enqueue each image as a separate job, collect all results."""
    if WORKER_MODE == "runpod":
        return await _runpod_get_batch_ctx(req, config, images, batch_size)

    from server.redis_client import subscribe_progress

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
    """RunPod mode: submit all images concurrently, poll for results."""
    from server.runpod_adapter import submit_job, poll_job, image_bytes_to_b64

    config_json = config.model_dump_json()

    # Submit all jobs
    job_ids = []
    for img in images:
        image_bytes = _image_to_bytes(img)
        image_b64 = image_bytes_to_b64(image_bytes)
        job_id = await submit_job(image_b64, config_json)
        job_ids.append(job_id)

    # Poll all results concurrently
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
