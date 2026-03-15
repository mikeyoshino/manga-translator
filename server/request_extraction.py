"""
Request extraction and streaming for the translation API.

Converts incoming images to bytes, enqueues jobs to Redis, and streams
progress back to the client using the same binary protocol as before
(1 byte status + 4 byte length + N bytes data).
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

from manga_translator import Config
from server.myqueue import task_queue
from server.redis_client import subscribe_progress


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


async def get_ctx(req: Request, config: Config, image: str | bytes):
    """Enqueue job, wait for result, return deserialized Context."""
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


async def while_streaming(req: Request, transform, config: Config, image: bytes | str):
    """Enqueue job and stream progress frames back to the client."""
    image_bytes = _image_to_bytes(image)
    config_json = config.model_dump_json()

    task_id = await task_queue.enqueue(image_bytes, config_json)
    import sentry_sdk
    sentry_sdk.set_tag("task_id", task_id)

    async def _generate():
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
                # Error frame — forward as-is
                yield frame
                break
            else:
                # Progress / queue position / waiting — forward as-is
                yield frame

    return StreamingResponse(_generate(), media_type="application/octet-stream")


async def get_batch_ctx(req: Request, config: Config, images: list[str | bytes], batch_size: int = 4):
    """Enqueue each image as a separate job, collect all results."""
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
