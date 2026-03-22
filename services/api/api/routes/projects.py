"""Project endpoints: /projects/*"""

import io
import os

import sentry_sdk
from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, Depends, Query
from fastapi.responses import StreamingResponse

from manga_shared.config import Config

from api.services.auth import AuthUser, get_current_user
from api.services.token_guard import deduct_or_raise
from api.services import projects
from api.adapters.redis_queue import while_streaming
from api.models.responses import to_translation, TranslationResponse

router = APIRouter(prefix="/projects", tags=["projects"])

TOKEN_COST_PER_IMAGE = int(os.getenv("TOKEN_COST_PER_IMAGE", "1"))


def _transform_to_json(ctx):
    return to_translation(ctx).model_dump_json().encode("utf-8")


@router.post("")
async def create_project_endpoint(body: dict, user: AuthUser = Depends(get_current_user)):
    try:
        return projects.create_project(user.id, body["name"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("")
async def list_projects_endpoint(user: AuthUser = Depends(get_current_user)):
    return projects.list_projects(user.id)

@router.get("/{project_id}")
async def get_project_endpoint(project_id: str, user: AuthUser = Depends(get_current_user)):
    data = projects.get_project(project_id, user.id)
    if not data:
        raise HTTPException(404, "Project not found")
    return data

@router.put("/{project_id}")
async def update_project_endpoint(project_id: str, body: dict, user: AuthUser = Depends(get_current_user)):
    if "name" in body:
        projects.rename_project(project_id, user.id, body["name"])
    return {"ok": True}

@router.delete("/{project_id}")
async def delete_project_endpoint(project_id: str, user: AuthUser = Depends(get_current_user)):
    projects.delete_project(project_id, user.id)
    return {"ok": True}

@router.post("/{project_id}/images")
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

@router.delete("/{project_id}/images/{image_id}")
async def delete_project_image(project_id: str, image_id: str, user: AuthUser = Depends(get_current_user)):
    projects.delete_image(image_id, user.id)
    return {"ok": True}

@router.get("/{project_id}/context")
async def get_project_context(project_id: str, user: AuthUser = Depends(get_current_user)):
    data = projects.get_project(project_id, user.id)
    if not data:
        raise HTTPException(404, "Project not found")
    ctx = projects.get_manga_context(project_id)
    if ctx is None:
        raise HTTPException(404, "No context extracted yet")
    return ctx

@router.post("/{project_id}/images/{image_id}/translate")
async def translate_project_image(
    req: Request, project_id: str, image_id: str,
    config: str = Form("{}"),
    user: AuthUser = Depends(get_current_user),
):
    charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, f"project/{project_id}", user.is_admin)

    img_row = projects.get_image(image_id)
    if not img_row:
        raise HTTPException(404, "Image not found")

    projects.update_image_status(image_id, "translating")

    try:
        img_bytes = projects.download_image(img_row["original_image_path"])
    except Exception as e:
        projects.update_image_status(image_id, "error")
        raise HTTPException(500, f"Failed to download image: {e}")

    conf = Config.model_validate_json(config)
    conf._is_web_frontend = True

    try:
        from api.services.context_extraction import extract_manga_context, format_manga_context_prompt
        manga_ctx = projects.get_manga_context(project_id)
        if manga_ctx is None:
            manga_ctx = extract_manga_context(project_id, user.id)
            if manga_ctx:
                projects.save_manga_context(project_id, manga_ctx)
        if manga_ctx:
            conf.translator.manga_context = format_manga_context_prompt(manga_ctx, conf.translator.target_lang)
    except Exception as e:
        import logging, traceback
        logging.getLogger("api").warning(
            "Manga context extraction failed (non-fatal): %s\n%s", e, traceback.format_exc()
        )

    return await while_streaming(req, _transform_to_json, conf, img_bytes,
                                 on_error=charge.refund if charge else None)

@router.post("/{project_id}/images/{image_id}/save-result")
async def save_project_image_result(
    project_id: str, image_id: str, body: dict,
    user: AuthUser = Depends(get_current_user),
):
    translation_response = body.get("translation_response", {})
    editable_blocks = body.get("editable_blocks", [])
    projects.save_translation_result(user.id, project_id, image_id, translation_response, editable_blocks)
    return projects.get_image_with_urls(image_id)

@router.put("/{project_id}/images/{image_id}/blocks")
async def save_image_blocks(project_id: str, image_id: str, body: dict, user: AuthUser = Depends(get_current_user)):
    projects.save_editable_blocks(image_id, body["editable_blocks"])
    return {"ok": True}
