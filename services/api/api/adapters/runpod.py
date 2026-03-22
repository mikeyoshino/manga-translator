"""
API-side HTTP client for RunPod Serverless GPU workers.

Submits translation jobs to a RunPod endpoint and polls for results.
Used when WORKER_MODE=runpod (production on Contabo VPS without GPU).
"""

import asyncio
import base64
import logging
import os

import httpx

logger = logging.getLogger("api.adapters.runpod")

RUNPOD_API_KEY = os.getenv("RUNPOD_API_KEY", "")
RUNPOD_ENDPOINT_ID = os.getenv("RUNPOD_ENDPOINT_ID", "")
RUNPOD_BASE_URL = f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}"
RUNPOD_TIMEOUT = int(os.getenv("RUNPOD_TIMEOUT", "300"))


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(RUNPOD_TIMEOUT))


async def submit_job(image_b64: str, config_json: str) -> str:
    payload = {"input": {"image_b64": image_b64, "config_json": config_json}}
    async with _client() as client:
        resp = await client.post(f"{RUNPOD_BASE_URL}/run", headers=_headers(), json=payload)
        resp.raise_for_status()
        data = resp.json()
        job_id = data["id"]
        logger.info("Submitted RunPod job %s", job_id)
        return job_id


async def submit_inpaint_job(image_b64: str, mask_b64: str, inpainting_size: int = 2048) -> str:
    payload = {
        "input": {
            "action": "inpaint",
            "image_b64": image_b64,
            "mask_b64": mask_b64,
            "inpainting_size": inpainting_size,
        }
    }
    async with _client() as client:
        resp = await client.post(f"{RUNPOD_BASE_URL}/run", headers=_headers(), json=payload)
        resp.raise_for_status()
        data = resp.json()
        job_id = data["id"]
        logger.info("Submitted RunPod inpaint job %s", job_id)
        return job_id


async def poll_job(job_id: str, timeout: float = 600) -> dict:
    delay = 1.0
    max_delay = 5.0
    elapsed = 0.0

    async with _client() as client:
        while elapsed < timeout:
            resp = await client.get(f"{RUNPOD_BASE_URL}/status/{job_id}", headers=_headers())
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")

            if status == "COMPLETED":
                logger.info("RunPod job %s completed", job_id)
                return data["output"]
            elif status in ("FAILED", "CANCELLED", "TIMED_OUT"):
                error = data.get("error", status)
                raise RuntimeError(f"RunPod job {job_id} failed: {error}")

            await asyncio.sleep(delay)
            elapsed += delay
            delay = min(delay * 1.5, max_delay)

    raise TimeoutError(f"RunPod job {job_id} timed out after {timeout}s")


async def check_health() -> dict:
    async with _client() as client:
        try:
            resp = await client.get(f"{RUNPOD_BASE_URL}/health", headers=_headers())
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            return {"status": "error", "detail": str(e)}


def image_bytes_to_b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")
