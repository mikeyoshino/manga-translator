"""FastAPI application entry point for the API service."""

import os
import sys
import shutil
from pathlib import Path

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..')))

from dotenv import load_dotenv
load_dotenv()

from manga_shared.monitoring import init_sentry
from manga_shared.log_config import setup_logging
setup_logging()
init_sentry(service="api")

from fastapi import FastAPI, Request, Query, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api.middleware.auth import AuthCookieMiddleware
from api.middleware.logging import RequestLoggingMiddleware
from api.services.auth import AuthUser, get_current_user
import manga_shared.supabase_client as sb

from api.routes import health, auth, translate, payment, projects, admin, subscription

app = FastAPI()
app.add_middleware(AuthCookieMiddleware)
app.add_middleware(RequestLoggingMiddleware)

BASE_DIR = Path(__file__).resolve().parent
RESULT_ROOT = (BASE_DIR.parent.parent.parent / "result").resolve()
RESULT_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:3000,"
    "https://wunplae.com,https://crm.wunplae.com,"
    "http://wunplae.com,http://crm.wunplae.com"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(translate.router)
app.include_router(payment.router)
app.include_router(projects.router)
app.include_router(admin.router)
app.include_router(subscription.router)


# Static files for result directory
if RESULT_ROOT.exists():
    app.mount("/result", StaticFiles(directory=str(RESULT_ROOT)), name="result")


WORKER_MODE = os.getenv("WORKER_MODE", "redis")


@app.on_event("startup")
async def _startup():
    if WORKER_MODE == "runpod":
        import logging
        logging.getLogger("api").info("WORKER_MODE=runpod — skipping Redis consumer group setup")
    else:
        from manga_shared.redis_protocol import ensure_consumer_group, ping
        if not await ping():
            import logging
            logging.getLogger("api").warning("Redis is not reachable at startup")
        await ensure_consumer_group()
    from api.services import projects as proj_svc
    proj_svc.cleanup_expired()


@app.on_event("shutdown")
async def _shutdown():
    from manga_shared.redis_protocol import close_pool
    await close_pool()


# --- User profile & token endpoints (small, kept in main) ---

@app.get("/user/profile", tags=["user"])
async def user_profile(user: AuthUser = Depends(get_current_user)):
    from api.services.subscription import get_user_subscription_summary
    profile = sb.get_user_profile(user.id)
    profile["is_admin"] = user.is_admin
    profile["subscription"] = get_user_subscription_summary(user.id)
    return profile


class UpdateProfileRequest(BaseModel):
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


# --- Results management ---

@app.api_route("/result/{folder_name}/final.png", methods=["GET", "HEAD"], tags=["api", "file"])
async def get_result_by_folder(folder_name: str):
    from fastapi.responses import StreamingResponse
    folder_path = RESULT_ROOT / folder_name
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(404, detail=f"Folder {folder_name} not found")
    final_png_path = folder_path / "final.png"
    if not final_png_path.exists():
        raise HTTPException(404, detail="final.png not found in folder")

    async def file_iterator():
        with open(final_png_path, "rb") as f:
            yield f.read()

    return StreamingResponse(file_iterator(), media_type="image/png",
                             headers={"Content-Disposition": "inline; filename=final.png"})


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


# --- UI (legacy web client) ---

@app.get("/", response_class=HTMLResponse, tags=["ui"])
async def index() -> HTMLResponse:
    server_dir = Path(__file__).resolve().parent.parent.parent.parent / "server"
    html_file = server_dir / "index.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>API Server</h1>")


@app.get("/manual", response_class=HTMLResponse, tags=["ui"])
async def manual():
    server_dir = Path(__file__).resolve().parent.parent.parent.parent / "server"
    html_file = server_dir / "manual.html"
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Manual not found</h1>")


# --- Entry point ---

if __name__ == '__main__':
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5003"))

    folder_name = "upload-cache"
    if os.path.exists(folder_name):
        shutil.rmtree(folder_name)
    os.makedirs(folder_name)

    print(f"Starting API server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
