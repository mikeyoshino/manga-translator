import io
import os
import secrets
import shutil
import signal
import subprocess
import sys
from argparse import Namespace
import asyncio

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from dotenv import load_dotenv
load_dotenv()


from fastapi import FastAPI, Request, HTTPException, Header, UploadFile, File, Form, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from manga_translator import Config
from server.instance import ExecutorInstance, executor_instances
from server.myqueue import task_queue
from server.request_extraction import get_ctx, while_streaming, TranslateRequest, BatchTranslateRequest, get_batch_ctx
from server.to_json import to_translation, TranslationResponse
from server.auth import AuthUser, get_current_user
import server.supabase_client as sb
import server.payment as payment_svc
import server.projects as projects

app = FastAPI()
nonce = None

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

# 添加result文件夹静态文件服务
if RESULT_ROOT.exists():
    app.mount("/result", StaticFiles(directory=str(RESULT_ROOT)), name="result")

@app.post("/register", response_description="no response", tags=["internal-api"])
async def register_instance(instance: ExecutorInstance, req: Request, req_nonce: str = Header(alias="X-Nonce")):
    if req_nonce != nonce:
        raise HTTPException(401, detail="Invalid nonce")
    instance.ip = req.client.host
    executor_instances.register(instance)

def transform_to_image(ctx):
    # 检查是否使用占位符（在web模式下final.png保存后会设置此标记）
    if hasattr(ctx, 'use_placeholder') and ctx.use_placeholder:
        # ctx.result已经是1x1占位符图片，快速传输
        img_byte_arr = io.BytesIO()
        ctx.result.save(img_byte_arr, format="PNG")
        return img_byte_arr.getvalue()

    # 返回完整的翻译结果
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    return img_byte_arr.getvalue()

def transform_to_json(ctx):
    return to_translation(ctx).model_dump_json().encode("utf-8")

def transform_to_bytes(ctx):
    return to_translation(ctx).to_bytes()

@app.post("/translate/json", response_model=TranslationResponse, tags=["api", "json"],response_description="json strucure inspired by the ichigo translator extension")
async def json(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return to_translation(ctx)

@app.post("/translate/bytes", response_class=StreamingResponse, tags=["api", "json"],response_description="custom byte structure for decoding look at examples in 'examples/response.*'")
async def bytes(req: Request, data: TranslateRequest):
    ctx = await get_ctx(req, data.config, data.image)
    return StreamingResponse(content=to_translation(ctx).to_bytes())

@app.post("/translate/image", response_description="the result image", tags=["api", "json"],response_class=StreamingResponse)
async def image(req: Request, data: TranslateRequest) -> StreamingResponse:
    ctx = await get_ctx(req, data.config, data.image)
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/png")

@app.post("/translate/json/stream", response_class=StreamingResponse,tags=["api", "json"], response_description="A stream over elements with strucure(1byte status, 4 byte size, n byte data) status code are 0,1,2,3,4 0 is result data, 1 is progress report, 2 is error, 3 is waiting queue position, 4 is waiting for translator instance")
async def stream_json(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_json, data.config, data.image)

@app.post("/translate/bytes/stream", response_class=StreamingResponse, tags=["api", "json"],response_description="A stream over elements with strucure(1byte status, 4 byte size, n byte data) status code are 0,1,2,3,4 0 is result data, 1 is progress report, 2 is error, 3 is waiting queue position, 4 is waiting for translator instance")
async def stream_bytes(req: Request, data: TranslateRequest)-> StreamingResponse:
    return await while_streaming(req, transform_to_bytes,data.config, data.image)

@app.post("/translate/image/stream", response_class=StreamingResponse, tags=["api", "json"], response_description="A stream over elements with strucure(1byte status, 4 byte size, n byte data) status code are 0,1,2,3,4 0 is result data, 1 is progress report, 2 is error, 3 is waiting queue position, 4 is waiting for translator instance")
async def stream_image(req: Request, data: TranslateRequest) -> StreamingResponse:
    return await while_streaming(req, transform_to_image, data.config, data.image)

@app.post("/translate/with-form/json", response_model=TranslationResponse, tags=["api", "form"],response_description="json strucure inspired by the ichigo translator extension")
async def json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/json", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    ctx = await get_ctx(req, conf, img)
    return to_translation(ctx)

@app.post("/translate/with-form/bytes", response_class=StreamingResponse, tags=["api", "form"],response_description="custom byte structure for decoding look at examples in 'examples/response.*'")
async def bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)):
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/bytes", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    ctx = await get_ctx(req, conf, img)
    return StreamingResponse(content=to_translation(ctx).to_bytes())

@app.post("/translate/with-form/image", response_description="the result image", tags=["api", "form"],response_class=StreamingResponse)
async def image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    ctx = await get_ctx(req, conf, img)
    img_byte_arr = io.BytesIO()
    ctx.result.save(img_byte_arr, format="PNG")
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/png")

@app.post("/translate/with-form/json/stream", response_class=StreamingResponse, tags=["api", "form"],response_description="A stream over elements with strucure(1byte status, 4 byte size, n byte data) status code are 0,1,2,3,4 0 is result data, 1 is progress report, 2 is error, 3 is waiting queue position, 4 is waiting for translator instance")
async def stream_json_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/json/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    # 标记这是Web前端调用，用于占位符优化
    conf._is_web_frontend = True
    return await while_streaming(req, transform_to_json, conf, img)



@app.post("/translate/with-form/bytes/stream", response_class=StreamingResponse,tags=["api", "form"], response_description="A stream over elements with strucure(1byte status, 4 byte size, n byte data) status code are 0,1,2,3,4 0 is result data, 1 is progress report, 2 is error, 3 is waiting queue position, 4 is waiting for translator instance")
async def stream_bytes_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user))-> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/bytes/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    img = await image.read()
    conf = Config.parse_raw(config)
    return await while_streaming(req, transform_to_bytes, conf, img)

@app.post("/translate/with-form/image/stream", response_class=StreamingResponse, tags=["api", "form"], response_description="Standard streaming endpoint - returns complete image data. Suitable for API calls and scripts.")
async def stream_image_form(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image/stream", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    """通用流式端点：返回完整图片数据，适用于API调用和comicread脚本"""
    img = await image.read()
    conf = Config.parse_raw(config)
    # 标记为通用模式，不使用占位符优化
    conf._web_frontend_optimized = False
    return await while_streaming(req, transform_to_image, conf, img)

@app.post("/translate/with-form/image/stream/web", response_class=StreamingResponse, tags=["api", "form"], response_description="Web frontend optimized streaming endpoint - uses placeholder optimization for faster response.")
async def stream_image_form_web(req: Request, image: UploadFile = File(...), config: str = Form("{}"), user: AuthUser = Depends(get_current_user)) -> StreamingResponse:
    if not user.is_admin and not sb.deduct_tokens(user.id, TOKEN_COST_PER_IMAGE, reference="translate/image/stream/web", channel="api"):
        raise HTTPException(status_code=402, detail="Insufficient tokens")
    """Web前端专用端点：使用占位符优化，提供极速体验"""
    img = await image.read()
    conf = Config.parse_raw(config)
    # 标记为Web前端优化模式，使用占位符优化
    conf._web_frontend_optimized = True
    return await while_streaming(req, transform_to_image, conf, img)

@app.post("/queue-size", response_model=int, tags=["api", "json"])
async def queue_size() -> int:
    return len(task_queue.queue)


@app.api_route("/result/{folder_name}/final.png", methods=["GET", "HEAD"], tags=["api", "file"])
async def get_result_by_folder(folder_name: str):
    """根据文件夹名称获取翻译结果图片"""
    result_dir = RESULT_ROOT
    if not result_dir.exists():
        raise HTTPException(404, detail="Result directory not found")

    folder_path = result_dir / folder_name
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
        headers={"Content-Disposition": f"inline; filename=final.png"}
    )

@app.post("/translate/batch/json", response_model=list[TranslationResponse], tags=["api", "json", "batch"])
async def batch_json(req: Request, data: BatchTranslateRequest):
    """Batch translate images and return JSON format results"""
    results = await get_batch_ctx(req, data.config, data.images, data.batch_size)
    return [to_translation(ctx) for ctx in results]

@app.post("/translate/batch/images", response_description="Zip file containing translated images", tags=["api", "batch"])
async def batch_images(req: Request, data: BatchTranslateRequest):
    """Batch translate images and return zip archive containing translated images"""
    import zipfile
    import tempfile
    
    results = await get_batch_ctx(req, data.config, data.images, data.batch_size)
    
    # Create temporary ZIP file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp_file:
        with zipfile.ZipFile(tmp_file, 'w') as zip_file:
            for i, ctx in enumerate(results):
                if ctx.result:
                    img_byte_arr = io.BytesIO()
                    ctx.result.save(img_byte_arr, format="PNG")
                    zip_file.writestr(f"translated_{i+1}.png", img_byte_arr.getvalue())
        
        # Return ZIP file
        with open(tmp_file.name, 'rb') as f:
            zip_data = f.read()
        
        # Clean up temporary file
        os.unlink(tmp_file.name)
        
        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=translated_images.zip"}
        )

@app.get("/", response_class=HTMLResponse,tags=["ui"])
async def index() -> HTMLResponse:
    script_directory = Path(__file__).parent
    html_file = script_directory / "index.html"
    html_content = html_file.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)

@app.get("/manual", response_class=HTMLResponse, tags=["ui"])
async def manual():
    script_directory = Path(__file__).parent
    html_file = script_directory / "manual.html"
    html_content = html_file.read_text(encoding="utf-8")
    return HTMLResponse(content=html_content)

def generate_nonce():
    return secrets.token_hex(16)

def start_translator_client_proc(host: str, port: int, nonce: str, params: Namespace):
    cmds = [
        sys.executable,
        '-m', 'manga_translator',
        'shared',
        '--host', host,
        '--port', str(port),
        '--nonce', nonce,
    ]
    if params.use_gpu:
        cmds.append('--use-gpu')
    if params.use_gpu_limited:
        cmds.append('--use-gpu-limited')
    if params.ignore_errors:
        cmds.append('--ignore-errors')
    if params.verbose:
        cmds.append('--verbose')
    if params.models_ttl:
        cmds.append('--models-ttl=%s' % params.models_ttl)
    if getattr(params, 'pre_dict', None):
        cmds.extend(['--pre-dict', params.pre_dict])
    if getattr(params, 'post_dict', None):
        cmds.extend(['--post-dict', params.post_dict])       
    base_path = os.path.dirname(os.path.abspath(__file__))
    parent = os.path.dirname(base_path)
    proc = subprocess.Popen(cmds, cwd=parent)
    executor_instances.register(ExecutorInstance(ip=host, port=port))

    def handle_exit_signals(signal, frame):
        proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit_signals)
    signal.signal(signal.SIGTERM, handle_exit_signals)

    return proc

def prepare(args):
    global nonce
    if args.nonce is None:
        nonce = os.getenv('MT_WEB_NONCE', generate_nonce())
    else:
        nonce = args.nonce
    from server.instance import set_shared_nonce
    set_shared_nonce(nonce)
    if args.start_instance:
        return start_translator_client_proc(args.host, args.port + 1, nonce, args)
    folder_name= "upload-cache"
    if os.path.exists(folder_name):
        shutil.rmtree(folder_name)
    os.makedirs(folder_name)
    # Cleanup expired projects on startup
    projects.cleanup_expired()

@app.post("/simple_execute/translate_batch", tags=["internal-api"])
async def simple_execute_batch(req: Request, data: BatchTranslateRequest):
    """Internal batch translation execution endpoint"""
    # Implementation for batch translation logic
    # Currently returns empty results, actual implementation needs to call batch translator
    from manga_translator import MangaTranslator
    translator = MangaTranslator({'batch_size': data.batch_size})
    
    # Prepare image-config pairs
    images_with_configs = [(img, data.config) for img in data.images]
    
    # Execute batch translation
    results = await translator.translate_batch(images_with_configs, data.batch_size)
    
    return results

@app.post("/execute/translate_batch", tags=["internal-api"])
async def execute_batch_stream(req: Request, data: BatchTranslateRequest):
    """Internal batch translation streaming execution endpoint"""
    # Streaming batch translation implementation
    from manga_translator import MangaTranslator
    translator = MangaTranslator({'batch_size': data.batch_size})
    
    # Prepare image-config pairs
    images_with_configs = [(img, data.config) for img in data.images]
    
    # Execute batch translation (streaming version requires more complex implementation)
    results = await translator.translate_batch(images_with_configs, data.batch_size)
    
    return results

@app.get("/results/list", tags=["api"])
async def list_results():
    """List all result directories"""
    result_dir = RESULT_ROOT
    if not result_dir.exists():
        return {"directories": []}
    
    try:
        directories = []
        for item_path in result_dir.iterdir():
            if item_path.is_dir():
                # Check if final.png exists in this directory
                final_png_path = item_path / "final.png"
                if final_png_path.exists():
                    directories.append(item_path.name)
        return {"directories": directories}
    except Exception as e:
        raise HTTPException(500, detail=f"Error listing results: {str(e)}")

@app.delete("/results/clear", tags=["api"])
async def clear_results():
    """Delete all result directories"""
    result_dir = RESULT_ROOT
    if not result_dir.exists():
        return {"message": "No results directory found"}
    
    try:
        deleted_count = 0
        for item_path in result_dir.iterdir():
            if item_path.is_dir():
                # Check if final.png exists in this directory
                final_png_path = item_path / "final.png"
                if final_png_path.exists():
                    shutil.rmtree(item_path)
                    deleted_count += 1
        
        return {"message": f"Deleted {deleted_count} result directories"}
    except Exception as e:
        raise HTTPException(500, detail=f"Error clearing results: {str(e)}")

@app.delete("/results/{folder_name}", tags=["api"])
async def delete_result(folder_name: str):
    """Delete a specific result directory"""
    result_dir = RESULT_ROOT
    folder_path = result_dir / folder_name
    
    if not folder_path.exists():
        raise HTTPException(404, detail="Result directory not found")
    
    try:
        # Check if final.png exists in this directory
        final_png_path = folder_path / "final.png"
        if not final_png_path.exists():
            raise HTTPException(404, detail="Result file not found")
        
        shutil.rmtree(folder_path)
        return {"message": f"Deleted result directory: {folder_name}"}
    except Exception as e:
        raise HTTPException(500, detail=f"Error deleting result: {str(e)}")

# ============================================================
# User profile & token endpoints
# ============================================================

@app.get("/user/profile", tags=["user"])
async def user_profile(user: AuthUser = Depends(get_current_user)):
    profile = sb.get_user_profile(user.id)
    profile["is_admin"] = user.is_admin
    return profile


@app.get("/user/transactions", tags=["user"])
async def user_transactions(
    user: AuthUser = Depends(get_current_user),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    txns = sb.get_transactions(user.id, limit=limit, offset=offset)
    return txns


# ============================================================
# Payment endpoints (Omise PromptPay)
# ============================================================

from pydantic import BaseModel as _BaseModel

class CreateChargeRequest(_BaseModel):
    token_amount: int  # must be one of the TOKEN_PACKAGES keys
    payment_method: str = "promptpay"  # "promptpay" or "card"
    card_token: str | None = None  # Omise token from frontend (required for card)


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

    # Record pending payment
    client = sb._get_client()
    client.table("payments").insert({
        "user_id": user.id,
        "omise_charge_id": charge_data["charge_id"],
        "amount_satangs": charge_data["amount_satangs"],
        "tokens_to_credit": charge_data["tokens_to_credit"],
        "status": "pending",
    }).execute()

    # For card payments that are immediately successful (no 3DS), credit tokens now
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
    """Omise webhook — no auth, but signature-verified."""
    body = await request.json()

    event = payment_svc.parse_webhook_event(body)
    if event is None:
        return JSONResponse({"ok": True, "message": "ignored"})

    client = sb._get_client()

    if event["status"] == "successful" and event["user_id"] and event["tokens_to_credit"]:
        # Credit tokens
        sb.credit_tokens(
            user_id=event["user_id"],
            amount=int(event["tokens_to_credit"]),
            type_="topup",
            reference=event["charge_id"],
            channel=event.get("payment_method", "unknown"),
        )
        # Update payment record
        client.table("payments").update({
            "status": "successful",
        }).eq("omise_charge_id", event["charge_id"]).execute()
    else:
        # Mark as failed
        client.table("payments").update({
            "status": "failed",
        }).eq("omise_charge_id", event["charge_id"]).execute()

    return JSONResponse({"ok": True})


@app.post("/payment/check-charge", tags=["payment"])
async def check_charge(body: dict, user: AuthUser = Depends(get_current_user)):
    """Poll Omise charge status — credits tokens if successful. Used as webhook fallback."""
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
        # Check if already credited
        existing = client.table("payments").select("status").eq("omise_charge_id", charge_id).single().execute()
        if existing.data and existing.data.get("status") != "successful":
            metadata = charge.metadata or {}
            tokens = int(metadata.get("tokens_to_credit", 0))
            uid = metadata.get("user_id", user.id)
            if tokens > 0:
                sb.credit_tokens(user_id=uid, amount=tokens, type_="topup", reference=charge_id, channel=metadata.get("payment_method", "unknown"))
                client.table("payments").update({"status": "successful"}).eq("omise_charge_id", charge_id).execute()

    return {"status": charge.status, "paid": charge.paid}


# ============================================================
# Project endpoints
# ============================================================

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
    """Translate a project image: download from Storage, translate, save results back."""
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

    # Use the standard streaming pipeline — the result JSON will be saved to DB after streaming
    return await while_streaming(req, transform_to_json, conf, img_bytes)


@app.post("/projects/{project_id}/images/{image_id}/save-result", tags=["projects"])
async def save_project_image_result(
    project_id: str, image_id: str, body: dict,
    user: AuthUser = Depends(get_current_user),
):
    """Save translation result from frontend to Storage + DB."""
    translation_response = body.get("translation_response", {})
    editable_blocks = body.get("editable_blocks", [])
    projects.save_translation_result(user.id, project_id, image_id, translation_response, editable_blocks)
    return projects.get_image_with_urls(image_id)


@app.put("/projects/{project_id}/images/{image_id}/blocks", tags=["projects"])
async def save_image_blocks(project_id: str, image_id: str, body: dict, user: AuthUser = Depends(get_current_user)):
    projects.save_editable_blocks(image_id, body["editable_blocks"])
    return {"ok": True}


#todo: restart if crash
#todo: cache results
#todo: cleanup cache

if __name__ == '__main__':
    import uvicorn
    from args import parse_arguments

    args = parse_arguments()
    args.start_instance = True
    proc = prepare(args)
    print("Nonce: "+nonce)
    try:
        uvicorn.run(app, host=args.host, port=args.port)
    except Exception:
        if proc:
            proc.terminate()
