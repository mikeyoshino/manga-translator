import io
import os
import shutil
import sys
from pathlib import Path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv()

from server.monitoring import init_sentry
from server.log_config import setup_logging
setup_logging()
init_sentry(service="api")

from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from manga_translator.config import Config
from server.myqueue import task_queue, WORKER_MODE
from server.instance import worker_registry
from server.request_extraction import get_ctx, while_streaming, TranslateRequest, BatchTranslateRequest, get_batch_ctx
from server.to_json import to_translation, TranslationResponse
from server.auth import AuthUser, get_current_user
import server.supabase_client as sb
import server.payment as payment_svc
import server.projects as projects

app = FastAPI()

BASE_DIR = Path(__file__).resolve().parent
RESULT_ROOT = (BASE_DIR.parent / "result").resolve()
RESULT_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TOKEN_COST_PER_IMAGE = int(os.getenv("TOKEN_COST_PER_IMAGE", "1"))

def _get_inpaint_device():
    import torch
    if torch.backends.mps.is_available():
        return 'mps'
    if torch.cuda.is_available():
        return 'cuda'
    return 'cpu'

# Static files for result directory
if RESULT_ROOT.exists():
    app.mount("/result", StaticFiles(directory=str(RESULT_ROOT)), name="result")


# ---------------------------------------------------------------------------
# Startup / shutdown — Redis
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup():
    if WORKER_MODE == "runpod":
        import logging
        logging.getLogger("server").info("WORKER_MODE=runpod — skipping Redis consumer group setup")
    else:
        from server.redis_client import ensure_consumer_group, ping
        if not await ping():
            import logging
            logging.getLogger("server").warning("Redis is not reachable at startup — workers won't receive jobs until Redis is available")
        await ensure_consumer_group()
    # Cleanup expired projects
    projects.cleanup_expired()


@app.on_event("shutdown")
async def _shutdown():
    from server.redis_client import close_pool
    await close_pool()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["api"])
async def health():
    result = {
        "status": "healthy",
        "worker_mode": WORKER_MODE,
        "sentry_enabled": bool(os.getenv("SENTRY_DSN", "")),
    }

    if WORKER_MODE == "runpod":
        from server.runpod_adapter import check_health
        runpod_health = await check_health()
        result["runpod"] = runpod_health
    else:
        from server.redis_client import ping, get_queue_length, active_worker_count
        redis_ok = await ping()
        queue_len = await get_queue_length() if redis_ok else -1
        workers = await active_worker_count() if redis_ok else 0
        if not redis_ok:
            result["status"] = "degraded"
        result["redis"] = redis_ok
        result["queue_length"] = queue_len
        result["active_workers"] = workers

    return result


# ---------------------------------------------------------------------------
# Transform helpers
# ---------------------------------------------------------------------------

def transform_to_image(ctx):
    if hasattr(ctx, 'use_placeholder') and ctx.use_placeholder:
        img_byte_arr = io.BytesIO()
        ctx.result.save(img_byte_arr, format="PNG")
        return img_byte_arr.getvalue()
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    return img_byte_arr.getvalue()

def transform_to_json(ctx):
    return to_translation(ctx).model_dump_json().encode("utf-8")

def transform_to_bytes(ctx):
    return to_translation(ctx).to_bytes()


def _ctx_to_response(ctx_or_dict) -> TranslationResponse:
    """Convert get_ctx result to TranslationResponse regardless of worker mode.

    In Redis mode, ctx is a Context object; in RunPod mode, it's a dict.
    """
    if isinstance(ctx_or_dict, dict):
        return TranslationResponse.model_validate(ctx_or_dict)
    return to_translation(ctx_or_dict)


# ---------------------------------------------------------------------------
# Translation endpoints (unchanged API contract)
# ---------------------------------------------------------------------------

@app.post("/translate/json", response_model=TranslationResponse, tags=["api", "json"])
async def json_endpoint(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return _ctx_to_response(ctx)

@app.post("/translate/bytes", response_class=StreamingResponse, tags=["api", "json"])
async def bytes_endpoint(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return StreamingResponse(content=_ctx_to_response(ctx).to_bytes())

@app.post("/translate/image", response_class=StreamingResponse, tags=["api", "json"])
async def image_endpoint(req: Request, data: TranslateRequest) -> StreamingResponse:
    ctx = await get_ctx(req, data.config, data.image)
    if isinstance(ctx, dict):
        # RunPod mode: use rendered_image from response
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

@app.post("/translate/json/stream", response_class=StreamingResponse, tags=["api", "json"])
async def stream_json(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_json, data.config, data.image)

@app.post("/translate/bytes/stream", response_class=StreamingResponse, tags=["api", "json"])
async def stream_bytes(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_bytes, data.config, data.image)

@app.post("/translate/image/stream", response_class=StreamingResponse, tags=["api", "json"])
async def stream_image(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_image, data.config, data.image)


# --- Form-based endpoints (with auth + token deduction) ---

@app.post("/translate/with-form/json", response_model=TranslationResponse, tags=["api", "form"])
async def json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/json", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    ctx = await get_ctx(req, conf, img)
    return _ctx_to_response(ctx)

@app.post("/translate/with-form/bytes", response_class=StreamingResponse, tags=["api", "form"])
async def bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/bytes", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    ctx = await get_ctx(req, conf, img)
    return StreamingResponse(content=_ctx_to_response(ctx).to_bytes())

@app.post("/translate/with-form/image", response_class=StreamingResponse, tags=["api", "form"])
async def image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
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

@app.post("/translate/with-form/json/stream", response_class=StreamingResponse, tags=["api", "form"])
async def stream_json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/json/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    conf._is_web_frontend = True
    return await while_streaming(req, transform_to_json, conf, img)

@app.post("/translate/with-form/bytes/stream", response_class=StreamingResponse, tags=["api", "form"])
async def stream_bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/bytes/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    return await while_streaming(req, transform_to_bytes, conf, img)

@app.post("/translate/with-form/image/stream", response_class=StreamingResponse, tags=["api", "form"])
async def stream_image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    conf._web_frontend_optimized = False
    return await while_streaming(req, transform_to_image, conf, img)

@app.post("/translate/with-form/image/stream/web", response_class=StreamingResponse, tags=["api", "form"])
async def stream_image_form_web(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image/stream/web", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    conf._web_frontend_optimized = True
    return await while_streaming(req, transform_to_image, conf, img)

@app.post("/inpaint", response_class=StreamingResponse, tags=["api", "form"])
async def inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    inpainting_size: int = Form(2048),
    user: AuthUser = Depends(get_current_user),
) -> StreamingResponse:
    """Run AI inpainting: remove masked regions and fill with background."""
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="inpaint", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")

    import cv2
    import numpy as np
    from manga_translator.inpainting import dispatch as dispatch_inpainting
    from manga_translator.config import Inpainter, InpainterConfig

    img_bytes = await image.read()
    mask_bytes = await mask.read()

    img_arr = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img_arr is None:
        raise HTTPException(400, "Invalid image")
    img_rgb = cv2.cvtColor(img_arr, cv2.COLOR_BGR2RGB)

    mask_arr = cv2.imdecode(np.frombuffer(mask_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    if mask_arr is None:
        raise HTTPException(400, "Invalid mask")

    if mask_arr.shape[:2] != img_rgb.shape[:2]:
        mask_arr = cv2.resize(mask_arr, (img_rgb.shape[1], img_rgb.shape[0]), interpolation=cv2.INTER_NEAREST)

    device = _get_inpaint_device()
    result = await dispatch_inpainting(
        Inpainter.lama_large, img_rgb, mask_arr, InpainterConfig(), inpainting_size, device
    )

    result_bgr = cv2.cvtColor(result, cv2.COLOR_RGB2BGR)
    _, png_data = cv2.imencode(".png", result_bgr)
    return StreamingResponse(io.BytesIO(png_data.tobytes()), media_type="image/png")


@app.post("/queue-size", response_model=int, tags=["api", "json"])
async def queue_size() -> int:
    return await task_queue.size()


# ---------------------------------------------------------------------------
# Result file serving
# ---------------------------------------------------------------------------

@app.api_route("/result/{folder_name}/final.png", methods=["GET", "HEAD"], tags=["api", "file"])
async def get_result_by_folder(folder_name: str):
    folder_path = RESULT_ROOT / folder_name
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(404, detail=f"Folder {folder_name} not found")

    final_png_path = folder_path / "final.png"
    if not final_png_path.exists():
        raise HTTPException(404, detail="final.png not found in folder")

    async def file_iterator():
        with open(final_png_path, "rb") as f:
            yield f.read()

    return StreamingResponse(
        file_iterator(),
        media_type="image/png",
        headers={"Content-Disposition": "inline; filename=final.png"},
    )


# ---------------------------------------------------------------------------
# Batch endpoints
# ---------------------------------------------------------------------------

@app.post("/translate/batch/json", response_model=list[TranslationResponse], tags=["api", "json", "batch"])
async def batch_json(req: Request, data: BatchTranslateRequest):
    results = await get_batch_ctx(req, data.config, data.images, data.batch_size)
    return [_ctx_to_response(ctx) for ctx in results]

@app.post("/translate/batch/images", tags=["api", "batch"])
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


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse, tags=["ui"])
async def index() -> HTMLResponse:
    html_file = BASE_DIR / "index.html"
    html_content = html_file.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)

@app.get("/manual", response_class=HTMLResponse, tags=["ui"])
async def manual():
    html_file = BASE_DIR / "manual.html"
    html_content = html_file.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)


# ---------------------------------------------------------------------------
# Results management
# ---------------------------------------------------------------------------

@app.get("/results/list", tags=["api"])
async def list_results():
    if not RESULT_ROOT.exists():
        return {"directories": []}
    try:
        directories = [
            item.name for item in RESULT_ROOT.iterdir()
            if item.is_dir() and (item / "final.png").exists()
        ]
        return {"directories": directories}
    except Exception as e:
        raise HTTPException(500, detail=f"Error listing results: {e}")

@app.delete("/results/clear", tags=["api"])
async def clear_results():
    if not RESULT_ROOT.exists():
        return {"message": "No results directory found"}
    try:
        deleted_count = 0
        for item_path in RESULT_ROOT.iterdir():
            if item_path.is_dir() and (item_path / "final.png").exists():
                shutil.rmtree(item_path)
                deleted_count += 1
        return {"message": f"Deleted {deleted_count} result directories"}
    except Exception as e:
        raise HTTPException(500, detail=f"Error clearing results: {e}")

@app.delete("/results/{folder_name}", tags=["api"])
async def delete_result(folder_name: str):
    folder_path = RESULT_ROOT / folder_name
    if not folder_path.exists():
        raise HTTPException(404, detail="Result directory not found")
    try:
        if not (folder_path / "final.png").exists():
            raise HTTPException(404, detail="Result file not found")
        shutil.rmtree(folder_path)
        return {"message": f"Deleted result directory: {folder_name}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"Error deleting result: {e}")


# ---------------------------------------------------------------------------
# User profile & token endpoints
# ---------------------------------------------------------------------------

@app.get("/user/profile", tags=["user"])
async def user_profile(user: AuthUser = Depends(get_current_user)):
    profile = sb.get_user_profile(user.id)
    profile["is_admin"] = user.is_admin
    return profile

from pydantic import BaseModel as _BaseModel

class UpdateProfileRequest(_BaseModel):
    display_name: str

@app.put("/user/profile", tags=["user"])
async def update_user_profile(body: UpdateProfileRequest, user: AuthUser = Depends(get_current_user)):
    return sb.update_user_profile(user.id, body.display_name)

@app.get("/user/transactions", tags=["user"])
async def user_transactions(
    user: AuthUser = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    return sb.get_transactions(user.id, limit=limit, offset=offset)


# ---------------------------------------------------------------------------
# Payment endpoints (Omise PromptPay)
# ---------------------------------------------------------------------------

class CreateChargeRequest(_BaseModel):
    token_amount: int
    payment_method: str = "promptpay"
    card_token: str | None = None

@app.post("/payment/create-charge", tags=["payment"])
async def create_charge(body: CreateChargeRequest, user: AuthUser = Depends(get_current_user)):
    try:
        if body.payment_method == "card":
            if not body.card_token:
                raise HTTPException(status_code=400, detail="card_token is required for card payment")
            charge_data = payment_svc.create_card_charge(user.id, body.token_amount, body.card_token)
        else:
            charge_data = payment_svc.create_promptpay_charge(user.id, body.token_amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Payment error: {e}")

    client = sb._get_client()
    client.table("payments").insert({
        "user_id": user.id,
        "omise_charge_id": charge_data["charge_id"],
        "amount_satangs": charge_data["amount_satangs"],
        "tokens_to_credit": charge_data["tokens_to_credit"],
        "status": "pending",
    }).execute()

    if body.payment_method == "card" and charge_data.get("paid"):
        sb.credit_tokens(
            user_id=user.id,
            amount=charge_data["tokens_to_credit"],
            type_="topup",
            reference=charge_data["charge_id"],
            channel="card",
        )
        client.table("payments").update({
            "status": "successful",
        }).eq("omise_charge_id", charge_data["charge_id"]).execute()

    return charge_data

@app.post("/payment/webhook", tags=["payment"])
async def payment_webhook(request: Request):
    body = await request.json()
    event = payment_svc.parse_webhook_event(body)
    if event is None:
        return JSONResponse({"ok": True, "message": "ignored"})

    client = sb._get_client()

    if event["status"] == "successful" and event["user_id"] and event["tokens_to_credit"]:
        sb.credit_tokens(
            user_id=event["user_id"],
            amount=int(event["tokens_to_credit"]),
            type_="topup",
            reference=event["charge_id"],
            channel=event.get("payment_method", "unknown"),
        )
        client.table("payments").update({
            "status": "successful",
        }).eq("omise_charge_id", event["charge_id"]).execute()
    else:
        client.table("payments").update({
            "status": "failed",
        }).eq("omise_charge_id", event["charge_id"]).execute()

    return JSONResponse({"ok": True})

@app.post("/payment/check-charge", tags=["payment"])
async def check_charge(body: dict, user: AuthUser = Depends(get_current_user)):
    charge_id = body.get("charge_id")
    if not charge_id:
        raise HTTPException(status_code=400, detail="charge_id required")

    import omise as _omise
    payment_svc._init_omise()

    try:
        charge = _omise.Charge.retrieve(charge_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve charge: {e}")

    if charge.status == "successful" and charge.paid:
        client = sb._get_client()
        existing = client.table("payments").select("status").eq("omise_charge_id", charge_id).single().execute()
        if existing.data and existing.data.get("status") != "successful":
            metadata = charge.metadata or {}
            tokens = int(metadata.get("tokens_to_credit", 0))
            uid = metadata.get("user_id", user.id)
            if tokens > 0:
                sb.credit_tokens(user_id=uid, amount=tokens, type_="topup", reference=charge_id, channel=metadata.get("payment_method", "unknown"))
                client.table("payments").update({"status": "successful"}).eq("omise_charge_id", charge_id).execute()

    return {"status": charge.status, "paid": charge.paid}


# ---------------------------------------------------------------------------
# Project endpoints
# ---------------------------------------------------------------------------

@app.post("/projects", tags=["projects"])
async def create_project_endpoint(body: dict, user: AuthUser = Depends(get_current_user)):
    try:
        return projects.create_project(user.id, body["name"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/projects", tags=["projects"])
async def list_projects_endpoint(user: AuthUser = Depends(get_current_user)):
    return projects.list_projects(user.id)

@app.get("/projects/{project_id}", tags=["projects"])
async def get_project_endpoint(project_id: str, user: AuthUser = Depends(get_current_user)):
    data = projects.get_project(project_id, user.id)
    if not data:
        raise HTTPException(404, "Project not found")
    return data

@app.put("/projects/{project_id}", tags=["projects"])
async def update_project_endpoint(project_id: str, body: dict, user: AuthUser = Depends(get_current_user)):
    if "name" in body:
        projects.rename_project(project_id, user.id, body["name"])
    return {"ok": True}

@app.delete("/projects/{project_id}", tags=["projects"])
async def delete_project_endpoint(project_id: str, user: AuthUser = Depends(get_current_user)):
    projects.delete_project(project_id, user.id)
    return {"ok": True}

@app.post("/projects/{project_id}/images", tags=["projects"])
async def upload_project_images(
    project_id: str,
    images: list[UploadFile] = File(...),
    user: AuthUser = Depends(get_current_user),
):
    results = []
    for idx, img in enumerate(images):
        data = await img.read()
        ct = img.content_type or "image/png"
        row = projects.upload_image(project_id, user.id, data, img.filename or f"image_{idx}.png", ct, idx)
        results.append(row)
    return results

@app.delete("/projects/{project_id}/images/{image_id}", tags=["projects"])
async def delete_project_image(project_id: str, image_id: str, user: AuthUser = Depends(get_current_user)):
    projects.delete_image(image_id, user.id)
    return {"ok": True}

@app.post("/projects/{project_id}/images/{image_id}/translate", tags=["projects"])
async def translate_project_image(
    req: Request, project_id: str, image_id: str,
    config: str = Form("{}"),
    user: AuthUser = Depends(get_current_user),
):
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference=f"project/{project_id}", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")

    img_row = projects.get_image(image_id)
    if not img_row:
        raise HTTPException(404, "Image not found")

    projects.update_image_status(image_id, "translating")

    try:
        img_bytes = projects.download_image(img_row["original_image_path"])
    except Exception as e:
        projects.update_image_status(image_id, "error")
        raise HTTPException(500, f"Failed to download image: {e}")

    conf = Config.parse_raw(config)
    conf._is_web_frontend = True
    return await while_streaming(req, transform_to_json, conf, img_bytes)

@app.post("/projects/{project_id}/images/{image_id}/save-result", tags=["projects"])
async def save_project_image_result(
    project_id: str, image_id: str, body: dict,
    user: AuthUser = Depends(get_current_user),
):
    translation_response = body.get("translation_response", {})
    editable_blocks = body.get("editable_blocks", [])
    projects.save_translation_result(user.id, project_id, image_id, translation_response, editable_blocks)
    return projects.get_image_with_urls(image_id)

@app.put("/projects/{project_id}/images/{image_id}/blocks", tags=["projects"])
async def save_image_blocks(project_id: str, image_id: str, body: dict, user: AuthUser = Depends(get_current_user)):
    projects.save_editable_blocks(image_id, body["editable_blocks"])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import uvicorn
    from args import parse_arguments

    args = parse_arguments()

    # Create upload-cache directory
    folder_name = "upload-cache"
    if os.path.exists(folder_name):
        shutil.rmtree(folder_name)
    os.makedirs(folder_name)

    print(f"Starting API server on {args.host}:{args.port}")
    print("Workers must be started separately: python -m server.worker --use-gpu")
    uvicorn.run(app, host=args.host, port=args.port)
