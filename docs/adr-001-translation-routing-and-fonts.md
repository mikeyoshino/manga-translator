# ADR-001: Translation Routing and Per-Language Font Selection

**Status:** Accepted
**Date:** 2026-03-16

## Context

The manga-translator project supports 30+ translation backends and 26 target languages. Users translating Japanese manga into various languages need guidance on which translator to use for each language pair, and the rendered output needs appropriate fonts per target language.

A key problem: the source language is detected at runtime by OCR, so the client sending an image doesn't know upfront whether the text is Japanese, English, or something else. The worker must automatically select the best translator chain based on the detected source and the requested target language.

## Decision 1: JPN↔ENG Uses Sugoi Translator

**JPN→ENG and ENG→JPN translations use the Sugoi offline translator.**

- Sugoi is purpose-built for Japanese↔English manga/light-novel translation
- Runs fully offline — no API key or network required
- Best quality for this specific language pair among available offline models
- Already implemented in `SelectiveOfflineTranslator.select_translator()` (`manga_translator/translators/selective.py:32-37`): when `from_lang` is not `auto` and Sugoi supports the pair, it is selected automatically

## Decision 2: Other Language Pairs Use ChatGPT (via Two-Hop Chain)

**Non-JPN↔ENG pairs (e.g., ENG→THA, JPN→THA) use ChatGPT, routed through English when beneficial.**

- ChatGPT supports all 26 target languages in the project
- API-based, requires `OPENAI_API_KEY` in `.env`
- For JPN→THA workflows, a **translator chain** is used: `"sugoi:ENG;chatgpt:THA"`
  - Step 1: Sugoi translates JPN→ENG (high quality, offline)
  - Step 2: ChatGPT translates ENG→THA (broad language support)
- This two-hop approach produces better output than direct JPN→THA via ChatGPT, because Sugoi's JPN→ENG is more accurate than ChatGPT's JPN understanding

### Fallback

When using the `offline` (selective) translator, unsupported pairs fall back to M2M100 (`m2m100_big`). This is fully offline but lower quality than ChatGPT for most pairs.

## Decision 3: Smart Routing in RunPod Worker

**The RunPod worker automatically selects the optimal translator chain based on `target_lang`, so clients only need to specify the desired output language.**

### Implementation (`server/runpod_handler.py`)

The `apply_smart_routing(config)` function runs before the pipeline and sets `translator_chain` if the client didn't explicitly provide one:

| Client sends `target_lang` | Worker auto-sets `translator_chain` | What happens |
|---|---|---|
| `ENG` | `"sugoi:ENG"` | Sugoi handles JPN→ENG directly (offline) |
| `JPN` | `"sugoi:JPN"` | Sugoi handles ENG→JPN directly (offline) |
| `THA` | `"sugoi:ENG;chatgpt:THA"` | Sugoi JPN→ENG, then ChatGPT ENG→THA |
| Any other | `"sugoi:ENG;chatgpt:<lang>"` | Same two-hop pattern |

### Skip conditions

Smart routing is skipped when the client already provides:
- `translator_chain` — explicit chain, user knows what they want
- `selective_translation` — per-language routing already configured

### Why this works

The translator chain processes sequentially. If the source text is already in English and the chain starts with `sugoi:ENG`, Sugoi will pass it through (source == target). ChatGPT then translates ENG→THA as expected. The pipeline's language detection and skip logic handles edge cases.

### Requirements

- Sugoi model files must be in `models/` in the Docker image (bundled at build time)
- `OPENAI_API_KEY` must be set in the worker environment for non-ENG/JPN targets

## Decision 4: Per-Language Font Selection

**Each target language gets a default font, configurable per-language in the GUI.**

### Default Font Mapping (`LANGUAGE_FONTS` in `text_render.py`)

| Language | Font File | Reason |
|----------|-----------|--------|
| THA | `Kanit-Regular.ttf` | Thai script, Google Fonts |
| ENG | `comic shanns 2.ttf` | Comic/manga style for English |
| JPN | `msgothic.ttc` | Standard Japanese gothic |
| KOR | `NotoSansMonoCJK-VF.ttf.ttc` | CJK coverage for Korean |
| CHS | `msyh.ttc` | Microsoft YaHei for Simplified Chinese |
| CHT | `msyh.ttc` | Microsoft YaHei for Traditional Chinese |

### Font Selection Priority

1. Explicit `font_path` from CLI or config (highest priority)
2. Per-language override from GUI `language_fonts` parameter
3. `LANGUAGE_FONTS` default mapping based on `target_lang`
4. `FALLBACK_FONTS` list (tried in order until a glyph is found)

### GUI Integration

The GUI provides a "Per-Language Font Overrides" editor in the "Render & Output" tab, allowing users to:
- Map any target language to any available font
- Add/remove language-font pairs
- Overrides are passed through config to the rendering dispatch

## Consequences

- **Clients are simple**: just send `target_lang: "THA"` and the worker figures out the optimal path
- Smart routing is transparent — clients that already set `translator_chain` are unaffected
- The two-hop pattern ensures JPN manga gets Sugoi's high-quality JPN→ENG first, regardless of final target
- Users get sensible font defaults without configuration
- GUI users can customize fonts per language without editing code
- Adding new language-font defaults requires only editing `LANGUAGE_FONTS` dict
- Non-ENG/JPN targets require `OPENAI_API_KEY` on the worker
