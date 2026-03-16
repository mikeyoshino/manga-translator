"""Extract manga context (characters, relationships, tone) via OpenAI Vision API."""

import json
import logging
import os
from typing import Optional

import openai

from server.supabase_client import _get_client

logger = logging.getLogger(__name__)

BUCKET = "project-images"

# Use gpt-4o-mini for cost-effective vision analysis
_VISION_MODEL = os.getenv("MANGA_CONTEXT_MODEL", "gpt-4o-mini")
_MAX_SAMPLE_IMAGES = 4

_EXTRACTION_PROMPT = """\
You are analyzing manga/comic images to extract context that will help a translator \
produce natural Thai translations. Examine the images and extract:

1. **Characters**: Who appears? Describe each visually distinct character.
2. **Relationships**: How do characters relate? (siblings, romantic, parent-child, friends, etc.) \
   Who is older/younger?
3. **Setting & tone**: Where does this take place? What's the mood?
4. **Content rating**: Is this all-ages, teen, mature, or adult/hentai content?

Return a JSON object with this exact schema:
{
  "content_rating": "all_ages|teen|mature|adult_hentai",
  "characters": [
    {
      "name": "string or null if unknown",
      "description": "visual description",
      "gender": "male|female|unknown",
      "apparent_age": "child|teen|young_adult|adult|elderly",
      "speaking_style": "formal|informal|cute|rough|seductive|aggressive"
    }
  ],
  "relationships": [
    {
      "character_a": "name or description",
      "character_b": "name or description",
      "relationship": "siblings|parent_child|romantic|lovers|friends|strangers|classmates|coworkers",
      "age_relative": "older|younger|same"
    }
  ],
  "setting": "school|home|fantasy|workplace|outdoors|etc",
  "tone": "comedy|drama|romance|action|erotic|horror",
  "mood": "lighthearted|tense|emotional|passionate|dark|playful",
  "genre_notes": "free text with any additional context"
}

Return ONLY valid JSON, no markdown fences."""

import base64


def _download_image_as_base64(client, storage_path: str) -> str:
    """Download image from Supabase Storage and return as base64 data URI."""
    storage = client.storage.from_(BUCKET)
    img_bytes = storage.download(storage_path)
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    # Guess content type from extension
    ext = storage_path.rsplit(".", 1)[-1].lower()
    ct = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
          "webp": "image/webp", "gif": "image/gif"}.get(ext, "image/png")
    return f"data:{ct};base64,{b64}"


def _select_sample_images(client, project_id: str) -> list[dict]:
    """Select up to _MAX_SAMPLE_IMAGES evenly spaced images from the project."""
    images = client.table("project_images").select("id, original_image_path, sequence") \
        .eq("project_id", project_id).order("sequence").execute()
    rows = images.data
    if not rows:
        return []
    if len(rows) <= _MAX_SAMPLE_IMAGES:
        return rows
    # Evenly space the selection
    step = len(rows) / _MAX_SAMPLE_IMAGES
    return [rows[int(i * step)] for i in range(_MAX_SAMPLE_IMAGES)]


def extract_manga_context(project_id: str, user_id: str) -> Optional[dict]:
    """Analyze sample images from a project and extract manga context via OpenAI Vision.

    Returns the parsed context dict, or None if extraction fails.
    """
    client = _get_client()
    samples = _select_sample_images(client, project_id)
    if not samples:
        logger.warning("No images found for project %s, skipping context extraction", project_id)
        return None

    # Build vision messages with image URLs
    image_content = []
    for sample in samples:
        try:
            data_uri = _download_image_as_base64(client, sample["original_image_path"])
            image_content.append({
                "type": "image_url",
                "image_url": {"url": data_uri, "detail": "low"},
            })
        except Exception as e:
            logger.warning("Failed to download image %s: %s", sample["id"], e)

    if not image_content:
        logger.warning("Could not download any images for project %s", project_id)
        return None

    messages = [
        {"role": "system", "content": "You are a manga analysis assistant."},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _EXTRACTION_PROMPT},
                *image_content,
            ],
        },
    ]

    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY not set, cannot extract manga context")
            return None

        oai_client = openai.OpenAI(api_key=api_key)
        response = oai_client.chat.completions.create(
            model=_VISION_MODEL,
            messages=messages,
            max_tokens=1000,
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        context = json.loads(raw)
        logger.info("Extracted manga context for project %s: %d characters, %d relationships",
                     project_id, len(context.get("characters", [])), len(context.get("relationships", [])))
        return context
    except json.JSONDecodeError as e:
        logger.error("Failed to parse manga context JSON: %s\nRaw: %s", e, raw[:500])
        return None
    except Exception as e:
        logger.error("OpenAI Vision API error during context extraction: %s", e)
        return None


def format_manga_context_prompt(manga_context: dict) -> str:
    """Convert stored manga context JSON into a concise system instruction for Thai translation.

    Focuses on character relationships, speaking styles, and tone — the details
    that matter most for choosing correct Thai pronouns and register.
    """
    parts = []

    content_rating = manga_context.get("content_rating", "unknown")
    tone = manga_context.get("tone", "unknown")
    mood = manga_context.get("mood", "unknown")
    setting = manga_context.get("setting", "unknown")

    parts.append(f"[Manga Context] Rating: {content_rating} | Tone: {tone} | Mood: {mood} | Setting: {setting}")

    characters = manga_context.get("characters", [])
    if characters:
        parts.append("Characters:")
        for c in characters:
            name = c.get("name") or "Unknown"
            desc = c.get("description", "")
            gender = c.get("gender", "unknown")
            age = c.get("apparent_age", "unknown")
            style = c.get("speaking_style", "unknown")
            parts.append(f"  - {name}: {desc} ({gender}, {age}, speaks {style})")

    relationships = manga_context.get("relationships", [])
    if relationships:
        parts.append("Relationships:")
        for r in relationships:
            a = r.get("character_a", "?")
            b = r.get("character_b", "?")
            rel = r.get("relationship", "unknown")
            age_rel = r.get("age_relative", "unknown")
            parts.append(f"  - {a} ↔ {b}: {rel} ({a} is {age_rel})")

    genre_notes = manga_context.get("genre_notes")
    if genre_notes:
        parts.append(f"Notes: {genre_notes}")

    parts.append(
        "Use this context to select appropriate Thai pronouns (พี่/น้อง/ผม/หนู/ฉัน/etc.), "
        "honorifics, and speech register. Match the tone and character relationships."
    )

    return "\n".join(parts)
