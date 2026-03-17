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
import shutil
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

# --- Network Volume setup ---
VOLUME_PATH = "/runpod-volume"
VOLUME_MODELS = os.path.join(VOLUME_PATH, "models")
APP_MODELS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))

if os.path.isdir(VOLUME_PATH):
    os.makedirs(VOLUME_MODELS, exist_ok=True)
    if os.path.islink(APP_MODELS):
        os.unlink(APP_MODELS)
    elif os.path.isdir(APP_MODELS):
        shutil.rmtree(APP_MODELS)
    os.symlink(VOLUME_MODELS, APP_MODELS)
    logger.info("Using network volume for models: %s -> %s", APP_MODELS, VOLUME_MODELS)
else:
    logger.info("No network volume found, using local models at %s", APP_MODELS)


async def _ensure_models():
    """Download any missing models to the volume (no-op if already cached)."""
    from manga_translator.utils import ModelWrapper
    from manga_translator.detection import DETECTORS
    from manga_translator.ocr import OCRS
    from manga_translator.inpainting import INPAINTERS

    for name, cls in {**DETECTORS, **OCRS, **INPAINTERS}.items():
        if issubclass(cls, ModelWrapper):
            try:
                inst = cls()
                if not inst.is_downloaded():
                    logger.info("Downloading model: %s", name)
                    await inst.download()
                else:
                    logger.info("Model already cached: %s", name)
            except Exception as e:
                logger.warning("Failed to download model %s: %s", name, e)


logger.info("Ensuring models are available...")
asyncio.run(_ensure_models())
logger.info("All models ready.")

# --- Load translator once at cold start ---
logger.info("Initializing MangaTranslator (cold start)...")
translator = MangaTranslator({"use_gpu": True, "verbose": True})
logger.info("MangaTranslator ready.")


async def handle_translate(inp: dict) -> dict:
    """Run the full translation pipeline."""
    image_b64 = inp["image_b64"]
    config_json = inp.get("config_json", "{}")

    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data))
    config = Config.model_validate_json(config_json)

    config = apply_smart_routing(config)

    ctx = await translator.translate(image=image, config=config)

    response = to_translation(ctx)
    return json.loads(response.model_dump_json())


async def handle_inpaint(inp: dict) -> dict:
    """Run AI inpainting on the GPU worker."""
    import cv2
    import numpy as np
    from manga_translator.inpainting import dispatch as dispatch_inpainting
    from manga_translator.config import Inpainter, InpainterConfig

    image_b64 = inp["image_b64"]
    mask_b64 = inp["mask_b64"]
    inpainting_size = inp.get("inpainting_size", 2048)

    img_data = base64.b64decode(image_b64)
    img_arr = cv2.imdecode(np.frombuffer(img_data, np.uint8), cv2.IMREAD_COLOR)
    img_rgb = cv2.cvtColor(img_arr, cv2.COLOR_BGR2RGB)

    mask_data = base64.b64decode(mask_b64)
    mask_arr = cv2.imdecode(np.frombuffer(mask_data, np.uint8), cv2.IMREAD_GRAYSCALE)

    if mask_arr.shape[:2] != img_rgb.shape[:2]:
        mask_arr = cv2.resize(mask_arr, (img_rgb.shape[1], img_rgb.shape[0]), interpolation=cv2.INTER_NEAREST)

    import torch
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info("Inpaint: image=%s mask=%s size=%d device=%s",
                img_rgb.shape, mask_arr.shape, inpainting_size, device)

    result = await dispatch_inpainting(
        Inpainter.lama_large, img_rgb, mask_arr, InpainterConfig(), inpainting_size, device
    )

    result_bgr = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
    _, png_data = cv2.imencode(".png", result_bgr)
    return {"image_b64": base64.b64encode(png_data.tobytes()).decode("utf-8")}


async def handler(event: dict) -> dict:
    """
    RunPod async handler function.

    Dispatches on event["input"]["action"]:
      - "translate" (default): full translation pipeline
      - "inpaint": AI inpainting on GPU
    """
    try:
        inp = event["input"]
        action = inp.get("action", "translate")

        if action == "inpaint":
            return await handle_inpaint(inp)
        else:
            return await handle_translate(inp)

    except Exception as e:
        logger.error("Handler error: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
