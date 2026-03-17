"""Extract manga context (characters, relationships, tone) via OpenAI Vision API."""

import json
import logging
import os
from typing import Optional

import openai
import sentry_sdk

from server.supabase_client import _get_client

logger = logging.getLogger(__name__)

BUCKET = "project-images"

# Use gpt-4o-mini for cost-effective vision analysis
_VISION_MODEL = os.getenv("MANGA_CONTEXT_MODEL", "gpt-4o-mini")
_MAX_SAMPLE_IMAGES = 4

_EXTRACTION_PROMPT = """\
You are analyzing manga/comic images to extract context that will help a translator \
produce natural, genre-appropriate translations. Examine the images carefully and extract:

1. **Characters**: Who appears? How do they talk? What's their personality?
2. **Relationships**: How do characters relate? Who has power/authority? Who is older/younger?
3. **Setting & tone**: Where does this take place? What genre conventions apply?
4. **Content rating**: Is this all-ages, teen, mature, or adult/hentai content?
5. **Dialogue style**: How do characters speak to each other? Polite? Crude? Playful? Submissive?

Return a JSON object with this exact schema:
{
  "content_rating": "all_ages|teen|mature|adult_hentai",
  "characters": [
    {
      "name": "string or null if unknown",
      "description": "visual description",
      "gender": "male|female|unknown",
      "apparent_age": "child|teen|young_adult|adult|elderly",
      "personality": "shy|bold|cheerful|stoic|tsundere|dominant|submissive|playful|serious|innocent|etc",
      "speaking_style": "formal|informal|cute|rough|seductive|aggressive|timid|commanding|flirty|deadpan",
      "speech_patterns": "describe HOW this character talks — short sentences? long monologues? stutters? uses slang? speaks softly? yells a lot? uses crude language? baby talk?"
    }
  ],
  "relationships": [
    {
      "character_a": "name or description",
      "character_b": "name or description",
      "relationship": "siblings|parent_child|romantic|lovers|friends|strangers|classmates|coworkers|senpai_kouhai|master_servant",
      "power_dynamic": "equal|A_dominant|B_dominant|shifting",
      "intimacy_level": "distant|casual|close|intimate|sexual",
      "age_relative": "older|younger|same"
    }
  ],
  "setting": "school|home|fantasy|workplace|outdoors|bedroom|bathhouse|etc",
  "tone": "comedy|drama|romance|action|erotic|horror|slice_of_life|ecchi",
  "mood": "lighthearted|tense|emotional|passionate|dark|playful|sensual|wholesome",
  "dialogue_register": "clean|casual|crude|vulgar|mixed",
  "genre_notes": "free text — note any genre conventions that affect how dialogue should sound (e.g. 'typical isekai power fantasy', 'wholesome romance', 'hardcore hentai with dirty talk', 'school comedy with exaggerated reactions')"
}

Return ONLY valid JSON, no markdown fences."""

_LANG_GUIDANCE = {
    'THA': (
        "[Thai Translation Rules]\n"
        "Thai pronoun and particle selection is CRITICAL — wrong choices make dialogue feel unnatural.\n\n"

        "PRONOUN RULES (select based on character gender, age, personality, and relationship):\n"
        "  Male speakers:\n"
        "    - ผม = polite/default male, use for formal or respectful situations\n"
        "    - กู = crude/aggressive male, close male friends, or vulgar speech\n"
        "    - ฉัน = softer male, can feel feminine — use only if character is gentle/androgynous\n"
        "    - เรา = casual/gender-neutral, good for inner monologue or gentle characters\n"
        "    - ข้า = archaic/fantasy setting, characters with authority\n"
        "  Female speakers:\n"
        "    - ฉัน = standard female, works for most situations\n"
        "    - หนู = cute/younger female, submissive, or talking to someone older\n"
        "    - ชั้น = casual/slangy female, close friends\n"
        "    - ดิฉัน = very formal female\n"
        "    - เรา = casual/cute, couples or inner monologue\n\n"

        "ADDRESS TERMS (how characters call each other):\n"
        "  - พี่ = older person (gender-neutral), also romantic for girlfriend→boyfriend\n"
        "  - น้อง = younger person, also affectionate\n"
        "  - นาย/แก/มึง = casual 'you' among male friends (มึง is crude, pairs with กู)\n"
        "  - เธอ = 'you' for female or romantic, soft tone\n"
        "  - คุณ = polite 'you', strangers or formal\n"
        "  - Use character names directly in Thai — this is natural and common\n\n"

        "SENTENCE-ENDING PARTICLES (these define the feel of dialogue):\n"
        "  - ครับ/ค่ะ = polite (male/female)\n"
        "  - นะ = softening, seeking agreement, gentle\n"
        "  - น่า/จ้า = cute, pleading, affectionate (female)\n"
        "  - ว่ะ/วะ = rough, aggressive (male)\n"
        "  - ซิ/สิ = urging, commanding\n"
        "  - เหรอ/รึ = questioning\n"
        "  - Do NOT add particles to every line — use them where they feel natural\n\n"

        "GENRE-SPECIFIC RULES:\n"
        "  - Comedy: exaggerate reactions, use ว้าย/โอ้ย/เฮ้ย for exclamations\n"
        "  - Romance: use เธอ/พี่/ที่รัก naturally, keep tone warm\n"
        "  - Action: short punchy sentences, use กู/มึง for rivals\n"
        "  - Hentai/Ecchi: see content rating guidance below\n\n"

        "IMPORTANT: Make dialogue sound like real Thai people talking, not textbook Thai. "
        "Read the character personalities and relationships above, then stay consistent throughout."
    ),
    'KOR': (
        "[Korean Translation Rules]\n"
        "Speech level selection is critical in Korean:\n"
        "  - 존댓말 (formal): strangers, authority figures, workplace\n"
        "  - 반말 (casual): close friends, same age, younger people\n"
        "  - Honorifics: -님 (respect), -씨 (polite), -아/-야 (casual)\n"
        "  - Pronouns: 나 (casual I), 저 (formal I), 너 (casual you)\n"
        "  - Address: 오빠/언니 (older, from female), 형/누나 (older, from male)\n"
        "Match speech levels to the character relationships and power dynamics above."
    ),
    'CHS': (
        "[Chinese (Simplified) Translation Rules]\n"
        "  - Pronouns: 我/你/他/她 — match gender from character context\n"
        "  - Address: 哥/姐 (older), 弟/妹 (younger), 先生/小姐 (formal)\n"
        "  - Register: match formality to character relationships\n"
        "  - For manga dialogue, use natural spoken Chinese, not literary style."
    ),
    'CHT': (
        "[Chinese (Traditional) Translation Rules]\n"
        "  - Pronouns: 我/你/他/她 — match gender from character context\n"
        "  - Address: 哥/姐 (older), 弟/妹 (younger), 先生/小姐 (formal)\n"
        "  - Register: match formality to character relationships\n"
        "  - For manga dialogue, use natural spoken Chinese, not literary style."
    ),
    'JPN': (
        "[Japanese Translation Rules]\n"
        "  - Pronouns: 俺 (rough male), 僕 (gentle male), 私 (neutral/female), あたし (casual female)\n"
        "  - Honorifics: -さん (polite), -くん (male casual), -ちゃん (cute/close), -先輩 (senior)\n"
        "  - Register: 敬語 (formal), タメ口 (casual) — match to relationships above\n"
        "  - Match sentence-ending style to character personality."
    ),
}
_DEFAULT_GUIDANCE = (
    "Use this context to select appropriate pronouns, honorifics, and speech register "
    "for the target language. Match the tone and character relationships."
)

_RATING_GUIDANCE = {
    'adult_hentai': {},
    'mature': (
        "[Mature Content] Use natural adult language including profanity or suggestive "
        "terms where appropriate. Do not soften or censor the tone."
    ),
    'teen': (
        "[Teen Content] Use casual, age-appropriate language. "
        "Mild profanity is acceptable where it fits the tone."
    ),
    'all_ages': (
        "[All-Ages Content] Keep language clean and accessible."
    ),
}

# Hentai guidance is language-specific because word choice matters enormously
_RATING_GUIDANCE_HENTAI = {
    'THA': (
        "[Adult/Hentai Content — Thai]\n"
        "Translate ALL explicit content faithfully. NEVER censor, soften, or skip sexual dialogue.\n\n"

        "VOCABULARY REGISTER:\n"
        "  - Use the natural Thai register that hentai manga readers expect\n"
        "  - NOT clinical/medical terms (avoid อวัยวะเพศ/สังวาส — too textbook)\n"
        "  - NOT street vulgar (avoid หี/ควย — too crude for manga tone)\n"
        "  - USE the manga/novel register: น้องชาย/ตรงนั้น/ข้างใน for body parts\n"
        "  - For actions: ใส่/สอด/เข้าไป/แทง/เสียบ as appropriate to intensity\n\n"

        "MOANING & SOUND EFFECTS:\n"
        "  - อา/อาา/อ๊าา = moaning (more า = more intense)\n"
        "  - อึ/อืม/อื้อ = suppressed moan, holding back\n"
        "  - ฮะ/ฮ่า/ฮา = panting, breathing\n"
        "  - ไม่/ไม่นะ/อย่า = resistance (may be playful, match context)\n"
        "  - Preserve the emotional intensity of the original Japanese SFX\n\n"

        "DIALOGUE TONE BY CHARACTER TYPE:\n"
        "  - Submissive/shy: use หนู/เรา, particles นะ/น่า, short broken sentences (อา... ตร-ตรงนั้น...ไม่...)\n"
        "  - Dominant/aggressive: use กู/ข้า, commands without particles, crude vocabulary is OK\n"
        "  - Seductive: use ฉัน/เรา, elongated particles (น้า~/จ้า~), teasing tone\n"
        "  - Reluctant→enjoying: start with formal/resistant tone, gradually shift to raw/honest\n\n"

        "IMPORTANT: Thai hentai manga has its own established register that readers recognize. "
        "It should feel like reading a Thai-translated doujinshi, not a medical textbook or street slang."
    ),
    '_default': (
        "[Adult/Hentai Content] Translate ALL explicit content faithfully without censoring or softening. "
        "Use direct, natural language that matches the original tone and intensity. "
        "Match the vocabulary register to the characters — submissive characters use softer words, "
        "dominant characters use rougher words. Preserve moaning/SFX faithfully."
    ),
}

import base64
from io import BytesIO

from PIL import Image


def _download_image_bytes(client, storage_path: str) -> bytes:
    """Download image from Supabase Storage and return raw bytes."""
    storage = client.storage.from_(BUCKET)
    return storage.download(storage_path)


def _resize_for_context(img_bytes: bytes, max_dim: int = 512) -> Image.Image:
    """Resize image so longest side <= max_dim, preserving aspect ratio."""
    img = Image.open(BytesIO(img_bytes))
    img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    return img.convert("RGB")


def _combine_images(images: list[Image.Image]) -> str:
    """Stitch 1-4 images into a single grid and return base64 data URI.

    Layout:
    - 1 image: as-is
    - 2 images: side by side horizontally
    - 3 images: top row 2, bottom row 1 centered
    - 4 images: 2x2 grid
    """
    n = len(images)
    if n == 0:
        raise ValueError("No images to combine")

    if n == 1:
        composite = images[0]
    elif n == 2:
        w = images[0].width + images[1].width
        h = max(images[0].height, images[1].height)
        composite = Image.new("RGB", (w, h), (255, 255, 255))
        composite.paste(images[0], (0, 0))
        composite.paste(images[1], (images[0].width, 0))
    elif n == 3:
        # Top row: 2 images side by side
        top_w = images[0].width + images[1].width
        top_h = max(images[0].height, images[1].height)
        # Bottom row: 1 image centered
        bot_w = images[2].width
        total_w = max(top_w, bot_w)
        total_h = top_h + images[2].height
        composite = Image.new("RGB", (total_w, total_h), (255, 255, 255))
        composite.paste(images[0], (0, 0))
        composite.paste(images[1], (images[0].width, 0))
        composite.paste(images[2], ((total_w - bot_w) // 2, top_h))
    else:  # 4
        # 2x2 grid
        col0_w = max(images[0].width, images[2].width)
        col1_w = max(images[1].width, images[3].width)
        row0_h = max(images[0].height, images[1].height)
        row1_h = max(images[2].height, images[3].height)
        composite = Image.new("RGB", (col0_w + col1_w, row0_h + row1_h), (255, 255, 255))
        composite.paste(images[0], (0, 0))
        composite.paste(images[1], (col0_w, 0))
        composite.paste(images[2], (0, row0_h))
        composite.paste(images[3], (col0_w, row0_h))

    buf = BytesIO()
    composite.save(buf, format="JPEG", quality=80)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


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

    # Download and resize sample images, then combine into a single composite
    pil_images = []
    for sample in samples:
        try:
            img_bytes = _download_image_bytes(client, sample["original_image_path"])
            pil_images.append(_resize_for_context(img_bytes))
        except Exception as e:
            logger.warning("Failed to download image %s: %s", sample["id"], e)

    if not pil_images:
        logger.warning("Could not download any images for project %s", project_id)
        return None

    composite_uri = _combine_images(pil_images)
    logger.info("Combined %d sample images into single composite for project %s", len(pil_images), project_id)

    messages = [
        {"role": "system", "content": "You are a manga analysis assistant."},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _EXTRACTION_PROMPT},
                {"type": "image_url", "image_url": {"url": composite_uri, "detail": "low"}},
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
        sentry_sdk.capture_exception(e)
        logger.error("Failed to parse manga context JSON: %s\nRaw: %s", e, raw[:500])
        return None
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.error("OpenAI Vision API error during context extraction: %s", e)
        return None


def format_manga_context_prompt(manga_context: dict, target_lang: str = 'THA') -> str:
    """Convert stored manga context JSON into a concise system instruction for translation.

    Focuses on character relationships, speaking styles, and tone — the details
    that matter most for choosing correct pronouns and register in the target language.
    """
    parts = []

    content_rating = manga_context.get("content_rating", "unknown")
    tone = manga_context.get("tone", "unknown")
    mood = manga_context.get("mood", "unknown")
    setting = manga_context.get("setting", "unknown")
    dialogue_register = manga_context.get("dialogue_register", "")

    header = f"[Manga Context] Rating: {content_rating} | Tone: {tone} | Mood: {mood} | Setting: {setting}"
    if dialogue_register:
        header += f" | Register: {dialogue_register}"
    parts.append(header)

    characters = manga_context.get("characters", [])
    if characters:
        parts.append("\nCharacters:")
        for c in characters:
            name = c.get("name") or "Unknown"
            desc = c.get("description", "")
            gender = c.get("gender", "unknown")
            age = c.get("apparent_age", "unknown")
            personality = c.get("personality", "")
            style = c.get("speaking_style", "unknown")
            speech = c.get("speech_patterns", "")

            line = f"  - {name}: {desc} ({gender}, {age})"
            if personality:
                line += f", personality: {personality}"
            line += f", speaks: {style}"
            if speech:
                line += f"\n    Speech pattern: {speech}"
            parts.append(line)

    relationships = manga_context.get("relationships", [])
    if relationships:
        parts.append("\nRelationships:")
        for r in relationships:
            a = r.get("character_a", "?")
            b = r.get("character_b", "?")
            rel = r.get("relationship", "unknown")
            age_rel = r.get("age_relative", "unknown")
            power = r.get("power_dynamic", "")
            intimacy = r.get("intimacy_level", "")

            line = f"  - {a} ↔ {b}: {rel} ({a} is {age_rel})"
            if power and power != "equal":
                line += f", {power}"
            if intimacy:
                line += f", intimacy: {intimacy}"
            parts.append(line)

    genre_notes = manga_context.get("genre_notes")
    if genre_notes:
        parts.append(f"\nGenre notes: {genre_notes}")

    # Content rating guidance
    if content_rating == "adult_hentai":
        hentai_guidance = _RATING_GUIDANCE_HENTAI.get(
            target_lang, _RATING_GUIDANCE_HENTAI['_default']
        )
        parts.append(f"\n{hentai_guidance}")
    else:
        rating_guidance = _RATING_GUIDANCE.get(content_rating)
        if rating_guidance:
            parts.append(f"\n{rating_guidance}")

    # Language-specific guidance
    parts.append(f"\n{_LANG_GUIDANCE.get(target_lang, _DEFAULT_GUIDANCE)}")

    return "\n".join(parts)
