"""
RunPod Serverless handler — runs on the GPU worker.

Entrypoint for Dockerfile.runpod. Loads MangaTranslator at module level
(models persist across warm invocations). Receives image + config,
runs the full translation pipeline, returns TranslationResponse JSON.
"""

import asyncio
import base64
import io
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

# --- Load translator once at cold start ---
logger.info("Initializing MangaTranslator (cold start)...")
translator = MangaTranslator({"use_gpu": True, "verbose": True})
logger.info("MangaTranslator ready.")


async def handler(event: dict) -> dict:
    """
    RunPod async handler function.

    Input:
        event["input"]["image_b64"] — base64-encoded image
        event["input"]["config_json"] — JSON string of Config

    Returns:
        TranslationResponse.model_dump() dict
    """
    try:
        inp = event["input"]
        image_b64 = inp["image_b64"]
        config_json = inp.get("config_json", "{}")

        # Decode image
        image_data = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_data))
        config = Config.model_validate_json(config_json)

        # Run translation
        ctx = await translator.translate(image=image, config=config)

        # Convert to JSON-serializable response
        response = to_translation(ctx)
        return json.loads(response.model_dump_json())

    except Exception as e:
        logger.error("Handler error: %s\n%s", e, traceback.format_exc())
        return {"error": str(e)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
