"""Project CRUD and Supabase Storage operations for image persistence."""

import base64
import logging
import uuid

from server.supabase_client import _get_client

logger = logging.getLogger(__name__)

BUCKET = "project-images"
MAX_PROJECTS_PER_USER = 5


def _storage(client):
    return client.storage.from_(BUCKET)


def _sign_url(client, path: str, expires_in: int = 86400) -> str:
    """Generate a signed URL valid for 24 hours."""
    result = _storage(client).create_signed_url(path, expires_in)
    return result["signedURL"]


def _base_path(user_id: str, project_id: str) -> str:
    return f"{user_id}/{project_id}"


def _decode_base64_image(data_uri_or_b64: str) -> bytes:
    """Decode a base64 string (with or without data URI prefix) to bytes."""
    b64 = data_uri_or_b64.split(",", 1)[-1] if "," in data_uri_or_b64 else data_uri_or_b64
    return base64.b64decode(b64)


def create_project(user_id: str, name: str) -> dict:
    client = _get_client()
    count = client.table("projects").select("id", count="exact") \
        .eq("user_id", user_id).gt("expires_at", "now()").execute()
    if count.count >= MAX_PROJECTS_PER_USER:
        raise ValueError(f"Maximum {MAX_PROJECTS_PER_USER} active projects allowed")
    result = client.table("projects").insert({
        "user_id": user_id, "name": name
    }).execute()
    return result.data[0]


def list_projects(user_id: str) -> list[dict]:
    client = _get_client()
    projects = client.table("projects").select("*") \
        .eq("user_id", user_id).gt("expires_at", "now()") \
        .order("updated_at", desc=True).execute()
    for p in projects.data:
        imgs = client.table("project_images").select("id, original_image_path", count="exact") \
            .eq("project_id", p["id"]).order("sequence").limit(1).execute()
        p["image_count"] = imgs.count
        p["thumbnail_url"] = None
        if imgs.data:
            try:
                p["thumbnail_url"] = _sign_url(client, imgs.data[0]["original_image_path"])
            except Exception:
                pass
    return projects.data


def get_project(project_id: str, user_id: str) -> dict | None:
    client = _get_client()
    proj = client.table("projects").select("*") \
        .eq("id", project_id).eq("user_id", user_id).maybe_single().execute()
    if not proj.data:
        return None
    images = client.table("project_images").select("*") \
        .eq("project_id", project_id).order("sequence").execute()
    for img in images.data:
        try:
            img["original_image_url"] = _sign_url(client, img["original_image_path"])
        except Exception:
            img["original_image_url"] = None
        if img.get("inpainted_image_path"):
            try:
                img["inpainted_image_url"] = _sign_url(client, img["inpainted_image_path"])
            except Exception:
                img["inpainted_image_url"] = None
        if img.get("rendered_image_path"):
            try:
                img["rendered_image_url"] = _sign_url(client, img["rendered_image_path"])
            except Exception:
                img["rendered_image_url"] = None
        if img.get("translation_metadata"):
            for t in img["translation_metadata"].get("translations", []):
                if t.get("background_path"):
                    try:
                        t["background_url"] = _sign_url(client, t["background_path"])
                    except Exception:
                        pass
    return {"project": proj.data, "images": images.data}


def upload_image(project_id: str, user_id: str, file_bytes: bytes, filename: str,
                 content_type: str, sequence: int) -> dict:
    client = _get_client()
    image_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    path = f"{_base_path(user_id, project_id)}/originals/{image_id}.{ext}"
    _storage(client).upload(path, file_bytes, {"content-type": content_type})
    result = client.table("project_images").insert({
        "id": image_id, "project_id": project_id, "sequence": sequence,
        "original_filename": filename, "original_image_path": path,
    }).execute()
    row = result.data[0]
    row["original_image_url"] = _sign_url(client, path)
    return row


def save_translation_result(user_id: str, project_id: str, image_id: str,
                            translation_response: dict, editable_blocks: list) -> None:
    """Extract base64 images, upload to Storage, save lightweight metadata to DB."""
    client = _get_client()
    base = _base_path(user_id, project_id)
    storage = _storage(client)

    inpainted_path = None
    if translation_response.get("inpainted_image"):
        inpainted_path = f"{base}/results/{image_id}_inpainted.png"
        img_bytes = _decode_base64_image(translation_response["inpainted_image"])
        storage.upload(inpainted_path, img_bytes, {"content-type": "image/png"})
        del translation_response["inpainted_image"]

    rendered_path = None
    if translation_response.get("rendered_image"):
        rendered_path = f"{base}/results/{image_id}_rendered.png"
        img_bytes = _decode_base64_image(translation_response["rendered_image"])
        storage.upload(rendered_path, img_bytes, {"content-type": "image/png"})
        del translation_response["rendered_image"]

    for idx, t in enumerate(translation_response.get("translations", [])):
        if t.get("background"):
            bg_path = f"{base}/backgrounds/{image_id}_block_{idx}.png"
            bg_bytes = _decode_base64_image(t["background"])
            storage.upload(bg_path, bg_bytes, {"content-type": "image/png"})
            t["background_path"] = bg_path
            del t["background"]

    client.table("project_images").update({
        "translation_metadata": translation_response,
        "editable_blocks": editable_blocks,
        "inpainted_image_path": inpainted_path,
        "rendered_image_path": rendered_path,
        "status": "translated",
    }).eq("id", image_id).execute()


def get_image(image_id: str) -> dict | None:
    client = _get_client()
    result = client.table("project_images").select("*").eq("id", image_id).maybe_single().execute()
    return result.data


def download_image(storage_path: str) -> bytes:
    client = _get_client()
    return _storage(client).download(storage_path)


def get_image_with_urls(image_id: str) -> dict:
    client = _get_client()
    img = client.table("project_images").select("*").eq("id", image_id).single().execute()
    row = img.data
    row["original_image_url"] = _sign_url(client, row["original_image_path"])
    if row.get("inpainted_image_path"):
        row["inpainted_image_url"] = _sign_url(client, row["inpainted_image_path"])
    if row.get("rendered_image_path"):
        row["rendered_image_url"] = _sign_url(client, row["rendered_image_path"])
    if row.get("translation_metadata"):
        for t in row["translation_metadata"].get("translations", []):
            if t.get("background_path"):
                try:
                    t["background_url"] = _sign_url(client, t["background_path"])
                except Exception:
                    pass
    return row


def save_editable_blocks(image_id: str, editable_blocks: list) -> None:
    client = _get_client()
    client.table("project_images").update({
        "editable_blocks": editable_blocks,
    }).eq("id", image_id).execute()


def update_image_status(image_id: str, status: str) -> None:
    client = _get_client()
    client.table("project_images").update({"status": status}).eq("id", image_id).execute()


def rename_project(project_id: str, user_id: str, name: str) -> None:
    client = _get_client()
    client.table("projects").update({"name": name}).eq("id", project_id).eq("user_id", user_id).execute()


def delete_project(project_id: str, user_id: str):
    client = _get_client()
    base = _base_path(user_id, project_id)
    storage = _storage(client)
    for folder in ["originals", "results", "backgrounds"]:
        try:
            files = storage.list(f"{base}/{folder}")
            if files:
                paths = [f"{base}/{folder}/{f['name']}" for f in files]
                storage.remove(paths)
        except Exception as e:
            logger.warning("Failed to cleanup storage folder %s/%s: %s", base, folder, e)
    client.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()


def delete_image(image_id: str, user_id: str):
    client = _get_client()
    img = client.table("project_images").select("*, projects!inner(user_id)") \
        .eq("id", image_id).maybe_single().execute()
    if not img.data or img.data["projects"]["user_id"] != user_id:
        return
    storage = _storage(client)
    for path_field in ["original_image_path", "inpainted_image_path", "rendered_image_path"]:
        if img.data.get(path_field):
            try:
                storage.remove([img.data[path_field]])
            except Exception as e:
                logger.warning("Failed to delete storage file %s: %s", img.data[path_field], e)
    # Delete background files via metadata (fast path)
    if img.data.get("translation_metadata"):
        for t in img.data["translation_metadata"].get("translations", []):
            if t.get("background_path"):
                try:
                    storage.remove([t["background_path"]])
                except Exception as e:
                    logger.warning("Failed to delete background file %s: %s", t["background_path"], e)
    # Fallback: list backgrounds folder and remove any remaining files for this image
    project_id = img.data["project_id"]
    base = _base_path(user_id, project_id)
    try:
        bg_files = storage.list(f"{base}/backgrounds")
        if bg_files:
            orphaned = [f"{base}/backgrounds/{f['name']}" for f in bg_files
                        if f["name"].startswith(f"{image_id}_block_")]
            if orphaned:
                storage.remove(orphaned)
    except Exception as e:
        logger.warning("Failed to cleanup background files for image %s: %s", image_id, e)
    client.table("project_images").delete().eq("id", image_id).execute()


def cleanup_expired():
    """Delete expired projects and their Storage files. Called on server startup."""
    try:
        client = _get_client()
        expired = client.table("projects").select("id, user_id") \
            .lt("expires_at", "now()").execute()
        for p in expired.data:
            try:
                delete_project(p["id"], p["user_id"])
            except Exception as e:
                logger.warning("Failed to cleanup project %s: %s", p["id"], e)
    except Exception as e:
        logger.warning("Failed to run expired project cleanup: %s", e)
