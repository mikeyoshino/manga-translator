"""
RunPod Serverless handler — runs on the GPU worker.

Entrypoint for Dockerfile.runpod. Loads MangaTranslator at module level
(models persist across warm invocations). Receives image + config,
runs the full translation pipeline, returns TranslationResponse JSON.

Smart routing: if no explicit translator_chain is set, the handler
automatically picks the best translator(s) for the target language.
JPN↔ENG uses Sugoi (offline, best quality). Other targets get a two-hop
chain: sugoi:ENG → chatgpt:<target>.
"""

import asyncio
import base64
import io
import json
import logging
import os
import sys
import traceback

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("runpod_handler")

import runpod
from PIL import Image

from manga_translator import Config, MangaTranslator
from server.to_json import to_translation
from server.smart_routing import apply_smart_routing

# --- Load translator once at cold start ---
logger.info("Initializing MangaTranslator (cold start)...")
translator = MangaTranslator({"use_gpu": True, "verbose": True})
logger.info("MangaTranslator ready.")


async def _handle_translate(inp: dict) -> dict:
    """Handle a translation job (existing logic)."""
    image_b64 = inp["image_b64"]
    config_json = inp.get("config_json", "{}")

    # Decode image
    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data))
    config = Config.model_validate_json(config_json)

    # Apply smart translator routing
    config = apply_smart_routing(config)

    # Run translation
    ctx = await translator.translate(image=image, config=config)

    # Convert to JSON-serializable response
    response = to_translation(ctx)
    return json.loads(response.model_dump_json())


async def _handle_inpaint(inp: dict) -> dict:
    """Handle an inpaint-only job. Only loads the inpainter model."""
    import cv2
    import numpy as np
    from manga_translator.inpainting import dispatch as dispatch_inpainting
    from manga_translator.config import Inpainter, InpainterConfig

    image_b64 = inp["image_b64"]
    mask_b64 = inp["mask_b64"]
    inpainting_size = inp.get("inpainting_size", 2048)

    # Decode image
    image_data = base64.b64decode(image_b64)
    img_arr = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
    if img_arr is None:
        return {"error": "Invalid image"}
    img_rgb = cv2.cvtColor(img_arr, cv2.COLOR_BGR2RGB)

    # Decode mask
    mask_data = base64.b64decode(mask_b64)
    mask_arr = cv2.imdecode(np.frombuffer(mask_data, np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask_arr is None:
        return {"error": "Invalid mask"}

    if mask_arr.shape[:2] != img_rgb.shape[:2]:
        mask_arr = cv2.resize(mask_arr, (img_rgb.shape[1], img_rgb.shape[0]), interpolation=cv2.INTER_NEAREST)

    logger.info("Inpaint job: image=%s mask=%s size=%d", img_rgb.shape, mask_arr.shape, inpainting_size)

    result = await dispatch_inpainting(
        Inpainter.lama_large, img_rgb, mask_arr, InpainterConfig(), inpainting_size, "cuda"
    )

    # Encode result as base64 PNG
    result_bgr = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
    _, png_data = cv2.imencode(".png", result_bgr)
    result_b64 = base64.b64encode(png_data.tobytes()).decode("utf-8")

    return {"image_b64": result_b64}


async def handler(event: dict) -> dict:
    """
    RunPod async handler function with mode dispatch.

    Modes:
        "translate" (default) — full translation pipeline
        "inpaint" — inpaint-only (Magic Remover)
    """
    try:
        inp = event["input"]
        mode = inp.get("mode", "translate")

        if mode == "inpaint":
            return await _handle_inpaint(inp)
        else:
            return await _handle_translate(inp)

    except Exception as e:
        logger.error("Handler error: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
