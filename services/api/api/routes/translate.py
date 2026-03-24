"""Translation endpoints: /translate/*, /inpaint, /queue-size"""

import io
import os

import sentry_sdk
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse

from manga_shared.config import Config

from api.services.auth import AuthUser, get_current_user
from api.services.token_guard import deduct_or_raise
from api.services.feature_guard import Feature, require_feature
from api.adapters.redis_queue import task_queue
from api.models.requests import TranslateRequest, BatchTranslateRequest
from api.models.responses import to_translation, TranslationResponse

router = APIRouter(tags=["api"])

TOKEN_COST_PER_IMAGE = int(os.getenv("TOKEN_COST_PER_IMAGE", "1"))


# ---------------------------------------------------------------------------
# Transform helpers
# ---------------------------------------------------------------------------

def transform_to_image(ctx):
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    return img_byte_arr.getvalue()

def transform_to_json(ctx):
    return to_translation(ctx).model_dump_json().encode("utf-8")

def transform_to_bytes(ctx):
    return to_translation(ctx).to_bytes()


def _ctx_to_response(ctx_or_dict) -> TranslationResponse:
    if isinstance(ctx_or_dict, dict):
        return TranslationResponse.model_validate(ctx_or_dict)
    return to_translation(ctx_or_dict)


# ---------------------------------------------------------------------------
# Request extraction (moved inline from server/request_extraction.py)
# ---------------------------------------------------------------------------

from api.adapters.redis_queue import get_ctx, while_streaming, get_batch_ctx


# ---------------------------------------------------------------------------
# JSON / bytes / image endpoints (no auth)
# ---------------------------------------------------------------------------

@router.post("/translate/json", response_model=TranslationResponse)
async def json_endpoint(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return _ctx_to_response(ctx)

@router.post("/translate/bytes", response_class=StreamingResponse)
async def bytes_endpoint(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return StreamingResponse(content=_ctx_to_response(ctx).to_bytes())

@router.post("/translate/image", response_class=StreamingResponse)
async def image_endpoint(req: Request, data: TranslateRequest) -> StreamingResponse:
    ctx = await get_ctx(req, data.config, data.image)
    if isinstance(ctx, dict):
        resp = TranslationResponse.model_validate(ctx)
        if resp.rendered_image:
            import base64 as b64mod
            img_data = b64mod.b64decode(resp.rendered_image.split(",", 1)[1])
            return StreamingResponse(io.BytesIO(img_data), media_type="image/png")
        raise HTTPException(500, detail="No rendered image in RunPod response")
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)
    return StreamingResponse(img_byte_arr, media_type="image/png")

@router.post("/translate/json/stream", response_class=StreamingResponse)
async def stream_json(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_json, data.config, data.image)

@router.post("/translate/bytes/stream", response_class=StreamingResponse)
async def stream_bytes(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_bytes, data.config, data.image)

@router.post("/translate/image/stream", response_class=StreamingResponse)
async def stream_image(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_image, data.config, data.image)


# --- Form-based endpoints (with auth + token deduction) ---

@router.post("/translate/with-form/json", response_model=TranslationResponse)
async def json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/json", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    try:
        ctx = await get_ctx(req, conf, img)
        return _ctx_to_response(ctx)
    except Exception as e:
        if charge:
            charge.refund(reason=str(e))
        sentry_sdk.capture_exception(e)
        raise

@router.post("/translate/with-form/bytes", response_class=StreamingResponse)
async def bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/bytes", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    try:
        ctx = await get_ctx(req, conf, img)
        return StreamingResponse(content=_ctx_to_response(ctx).to_bytes())
    except Exception as e:
        if charge:
            charge.refund(reason=str(e))
        sentry_sdk.capture_exception(e)
        raise

@router.post("/translate/with-form/image", response_class=StreamingResponse)
async def image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/image", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    try:
        ctx = await get_ctx(req, conf, img)
        if isinstance(ctx, dict):
            resp = TranslationResponse.model_validate(ctx)
            if resp.rendered_image:
                import base64 as b64mod
                img_data = b64mod.b64decode(resp.rendered_image.split(",", 1)[1])
                return StreamingResponse(io.BytesIO(img_data), media_type="image/png")
            raise HTTPException(500, detail="No rendered image in RunPod response")
        img_byte_arr = io.BytesIO()
        ctx.result.save(img_byte_arr, format="PNG")
        img_byte_arr.seek(0)
        return StreamingResponse(img_byte_arr, media_type="image/png")
    except Exception as e:
        if charge:
            charge.refund(reason=str(e))
        sentry_sdk.capture_exception(e)
        raise

@router.post("/translate/with-form/json/stream", response_class=StreamingResponse)
async def stream_json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/json/stream", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    conf._is_web_frontend = True
    return await while_streaming(req, transform_to_json, conf, img,
                                 on_error=charge.refund if charge else None)

@router.post("/translate/with-form/bytes/stream", response_class=StreamingResponse)
async def stream_bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/bytes/stream", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    return await while_streaming(req, transform_to_bytes, conf, img,
                                 on_error=charge.refund if charge else None)

@router.post("/translate/with-form/image/stream", response_class=StreamingResponse)
async def stream_image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/image/stream", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    conf._web_frontend_optimized = False
    return await while_streaming(req, transform_to_image, conf, img,
                                 on_error=charge.refund if charge else None)

@router.post("/translate/with-form/image/stream/web", response_class=StreamingResponse)
async def stream_image_form_web(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "translate/image/stream/web", user.is_admin)
    img = await image.read()
    conf = Config.model_validate_json(config)
    conf._web_frontend_optimized = True
    return await while_streaming(req, transform_to_image, conf, img,
                                 on_error=charge.refund if charge else None)

@router.post("/inpaint", response_class=StreamingResponse)
async def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    inpainting_size: int = Form(2048),
    user: AuthUser = Depends(get_current_user),
    _feature: AuthUser = Depends(require_feature(Feature.MAGIC_REMOVER)),
) -> StreamingResponse:
    """Run AI inpainting: route to RunPod GPU worker."""
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "inpaint", user.is_admin)

    import base64
    import logging
    from api.adapters.runpod import submit_inpaint_job, poll_job

    logger = logging.getLogger(__name__)

    img_bytes = await image.read()
    mask_bytes = await mask.read()

    image_b64 = base64.b64encode(img_bytes).decode("utf-8")
    mask_b64 = base64.b64encode(mask_bytes).decode("utf-8")

    logger.info("Inpaint request: image=%d bytes, mask=%d bytes, size=%d — routing to RunPod",
                len(img_bytes), len(mask_bytes), inpainting_size)

    try:
        job_id = await submit_inpaint_job(image_b64, mask_b64, inpainting_size)
        result = await poll_job(job_id)
    except Exception as e:
        if charge:
            charge.refund(reason=str(e))
        logger.error("Inpaint failed: %s", e, exc_info=True)
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Inpainting failed: {e}")

    result_bytes = base64.b64decode(result["image_b64"])
    return StreamingResponse(io.BytesIO(result_bytes), media_type="image/png")


@router.post("/queue-size", response_model=int)
async def queue_size() -> int:
    return await task_queue.size()


# ---------------------------------------------------------------------------
# Batch endpoints
# ---------------------------------------------------------------------------

@router.post("/translate/batch/json", response_model=list[TranslationResponse])
async def batch_json(req: Request, data: BatchTranslateRequest):
    results = await get_batch_ctx(req, data.config, data.images, data.batch_size)
    return [_ctx_to_response(ctx) for ctx in results]

@router.post("/translate/batch/images")
async def batch_images(req: Request, data: BatchTranslateRequest):
    import zipfile
    import tempfile

    results = await get_batch_ctx(req, data.config, data.images, data.batch_size)

    with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
        with zipfile.ZipFile(tmp_file, 'w') as zip_file:
            for i, ctx in enumerate(results):
                if isinstance(ctx, dict):
                    resp = TranslationResponse.model_validate(ctx)
                    if resp.rendered_image:
                        import base64 as b64mod
                        img_data = b64mod.b64decode(resp.rendered_image.split(",", 1)[1])
                        zip_file.writestr(f"translated_{i+1}.png", img_data)
                elif ctx.result:
                    img_byte_arr = io.BytesIO()
                    ctx.result.save(img_byte_arr, format="PNG")
                    zip_file.writestr(f"translated_{i+1}.png", img_byte_arr.getvalue())

        with open(tmp_file.name, 'rb') as f:
            zip_data = f.read()
        os.unlink(tmp_file.name)

        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=translated_images.zip"},
        )
