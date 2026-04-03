"""Project CRUD and Supabase Storage operations for image persistence."""

import base64
import io
import logging
import uuid
from collections import defaultdict

from PIL import Image

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


def _sign_urls_batch(client, paths: list[str], expires_in: int = 86400) -> dict[str, str | None]:
    """Generate signed URLs for multiple paths in a single API call.

    Returns a dict mapping each input path to its signed URL (or None on error).
    """
    if not paths:
        return {}
    results = _storage(client).create_signed_urls(paths, expires_in)
    url_map: dict[str, str | None] = {}
    for item in results:
        path = item.get("path", "")
        if item.get("error"):
            url_map[path] = None
        else:
            url_map[path] = item.get("signedURL") or item.get("signedUrl")
    return url_map


def _base_path(user_id: str, project_id: str) -> str:
    return f"{user_id}/{project_id}"


def _thumb_path_from_original(original_path: str) -> str:
    """Derive thumbnail storage path from an original image path.

    ``originals/{image_id}.{ext}`` → ``thumbnails/{image_id}.webp``
    """
    base, filename = original_path.rsplit("/", 1)
    image_id = filename.rsplit(".", 1)[0]
    parent = base.rsplit("/", 1)[0]  # strip "originals"
    return f"{parent}/thumbnails/{image_id}.webp"


def _generate_thumbnail(file_bytes: bytes, max_size: int = 400, quality: int = 70) -> bytes:
    """Resize image to fit within *max_size* px and return as WebP bytes."""
    img = Image.open(io.BytesIO(file_bytes))
    img.thumbnail((max_size, max_size))
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality)
    return buf.getvalue()


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
    if not projects.data:
        return []

    # Fetch all images for all projects in a single query instead of N+1
    project_ids = [p["id"] for p in projects.data]
    all_images = client.table("project_images") \
        .select("project_id, original_image_path, sequence") \
        .in_("project_id", project_ids) \
        .order("original_filename") \
        .execute()

    # Build per-project: count + first image path
    project_image_counts: dict[str, int] = defaultdict(int)
    project_first_image: dict[str, str | None] = {}
    for img in all_images.data:
        pid = img["project_id"]
        project_image_counts[pid] += 1
        if pid not in project_first_image:
            project_first_image[pid] = img["original_image_path"]

    # Prefer small thumbnails; fall back to originals for older uploads
    thumb_map: dict[str, str] = {}  # project_id → path to sign
    for pid, orig_path in project_first_image.items():
        if orig_path:
            thumb_map[pid] = _thumb_path_from_original(orig_path)

    paths_to_sign = list(thumb_map.values())
    # Also include originals as fallback
    orig_paths = [p for p in project_first_image.values() if p]
    paths_to_sign.extend(orig_paths)
    url_map = _sign_urls_batch(client, paths_to_sign) if paths_to_sign else {}

    for p in projects.data:
        pid = p["id"]
        p["image_count"] = project_image_counts[pid]
        thumb_p = thumb_map.get(pid)
        orig_p = project_first_image.get(pid)
        # Use thumbnail URL if available, otherwise fall back to original
        p["thumbnail_url"] = (
            url_map.get(thumb_p) if thumb_p and url_map.get(thumb_p)
            else url_map.get(orig_p) if orig_p
            else None
        )

    return projects.data


def get_project(project_id: str, user_id: str) -> dict | None:
    client = _get_client()
    proj = client.table("projects").select("*") \
        .eq("id", project_id).eq("user_id", user_id).maybe_single().execute()
    if not proj.data:
        return None
    images = client.table("project_images").select("*") \
        .eq("project_id", project_id).order("original_filename").execute()

    # Collect all paths that need signing
    paths_to_sign: list[str] = []
    for img in images.data:
        paths_to_sign.append(img["original_image_path"])
        if img.get("inpainted_image_path"):
            paths_to_sign.append(img["inpainted_image_path"])
        if img.get("rendered_image_path"):
            paths_to_sign.append(img["rendered_image_path"])
        if img.get("translation_metadata"):
            for t in img["translation_metadata"].get("translations", []):
                if t.get("background_path"):
                    paths_to_sign.append(t["background_path"])

    # Batch sign all paths in one API call
    url_map = _sign_urls_batch(client, paths_to_sign)

    # Map signed URLs back to images
    for img in images.data:
        img["original_image_url"] = url_map.get(img["original_image_path"])
        if img.get("inpainted_image_path"):
            img["inpainted_image_url"] = url_map.get(img["inpainted_image_path"])
        if img.get("rendered_image_path"):
            img["rendered_image_url"] = url_map.get(img["rendered_image_path"])
        if img.get("translation_metadata"):
            for t in img["translation_metadata"].get("translations", []):
                if t.get("background_path"):
                    t["background_url"] = url_map.get(t["background_path"])

    return {"project": proj.data, "images": images.data}


def upload_image(project_id: str, user_id: str, file_bytes: bytes, filename: str,
                 content_type: str, sequence: int) -> dict:
    client = _get_client()
    image_id = str(uuid.uuid4())
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "png"
    base = _base_path(user_id, project_id)
    path = f"{base}/originals/{image_id}.{ext}"
    storage = _storage(client)
    storage.upload(path, file_bytes, {"content-type": content_type})

    # Generate and upload a small thumbnail for the project list
    try:
        thumb_bytes = _generate_thumbnail(file_bytes)
        thumb_path = f"{base}/thumbnails/{image_id}.webp"
        storage.upload(thumb_path, thumb_bytes, {"content-type": "image/webp"})
    except Exception as e:
        logger.warning("Failed to generate thumbnail for image %s: %s", image_id, e)

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

    # Collect all paths that need signing
    paths_to_sign: list[str] = [row["original_image_path"]]
    if row.get("inpainted_image_path"):
        paths_to_sign.append(row["inpainted_image_path"])
    if row.get("rendered_image_path"):
        paths_to_sign.append(row["rendered_image_path"])
    if row.get("translation_metadata"):
        for t in row["translation_metadata"].get("translations", []):
            if t.get("background_path"):
                paths_to_sign.append(t["background_path"])

    # Batch sign all paths in one API call
    url_map = _sign_urls_batch(client, paths_to_sign)

    # Map signed URLs back
    row["original_image_url"] = url_map.get(row["original_image_path"])
    if row.get("inpainted_image_path"):
        row["inpainted_image_url"] = url_map.get(row["inpainted_image_path"])
    if row.get("rendered_image_path"):
        row["rendered_image_url"] = url_map.get(row["rendered_image_path"])
    if row.get("translation_metadata"):
        for t in row["translation_metadata"].get("translations", []):
            if t.get("background_path"):
                t["background_url"] = url_map.get(t["background_path"])

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
    for folder in ["originals", "results", "backgrounds", "thumbnails"]:
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
    # Delete thumbnail
    if img.data.get("original_image_path"):
        try:
            storage.remove([_thumb_path_from_original(img.data["original_image_path"])])
        except Exception as e:
            logger.warning("Failed to delete thumbnail for image %s: %s", image_id, e)
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


def save_manga_context(project_id: str, context_data: dict) -> None:
    """Upsert manga_context and context_analyzed_at on a project."""
    from datetime import datetime, timezone
    client = _get_client()
    client.table("projects").update({
        "manga_context": context_data,
        "context_analyzed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", project_id).execute()


def get_manga_context(project_id: str) -> dict | None:
    """Load manga_context for a project. Returns None if not yet analyzed."""
    client = _get_client()
    result = client.table("projects").select("manga_context") \
        .eq("id", project_id).maybe_single().execute()
    if result.data:
        return result.data.get("manga_context")
    return None


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
