# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manga/image translation tool with a multi-stage pipeline: text detection → OCR → text merging → inpainting → translation → rendering. Supports 30+ translation backends, multiple detection/OCR models, and runs as CLI, GUI (PySide6), or web server (FastAPI).

## Common Commands

```bash
# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # dev tools: pytest, pylint

# Run CLI translation (single image)
python -m manga_translator local -i <image_path>

# Run CLI translation (batch)
python -m manga_translator local -i <folder_path> -o <output_folder>

# Run WebSocket server
python -m manga_translator ws --host 0.0.0.0 --port 5003

# Run shared/API server
python -m manga_translator shared --host 0.0.0.0 --port 5003

# Run FastAPI web server
python server/main.py --verbose --start-instance --host=0.0.0.0 --port=5003

# Run GUI
python MangaStudioMain.py

# Print config schema
python -m manga_translator config-help

# Run all tests
pytest test/

# Run a single test file
pytest test/test_translation.py

# Run a specific test
pytest test/test_translation.py::test_single_language

# Lint
pylint $(git ls-files '*.py')

# Docker
docker build . --tag=manga-image-translator
```

## Architecture

### Translation Pipeline (`manga_translator/manga_translator.py`)
The core ~138KB file orchestrating the full pipeline. Each stage has swappable implementations selected via enums in `config.py`.

### Entry Points
- **CLI**: `manga_translator/__main__.py` → dispatches to mode handlers in `manga_translator/mode/`
- **GUI**: `MangaStudioMain.py` → PySide6 app in `MangaStudio_Data/app/`
- **Web Server**: `server/main.py` → FastAPI with REST (`/translate/json`, `/translate/bytes`) and WebSocket endpoints

### Pipeline Components (each in its own subdirectory under `manga_translator/`)
- `detection/` — Text region detectors (DBNET, CTD, CRAFT, Paddle)
- `ocr/` — OCR models (model_32px, model_48px, model_48px_ctc, manga_ocr)
- `textline_merge/` — Combines detected text lines
- `inpainting/` — Removes original text (LaMa, StableDiffusion)
- `translators/` — 30+ backends: online (ChatGPT, Gemini, DeepL, etc.) and offline (NLLB, Sugoi, M2M100, etc.)
- `rendering/` — Renders translated text onto images
- `upscaling/` — Image upscaling
- `colorization/` — Image colorization

### Key Modules
- `config.py` — Pydantic models and enums for all component types (Detector, Ocr, Translator, Inpainter, etc.)
- `args.py` — CLI argument parsing with subcommands: `local`, `ws`, `shared`, `config-help`
- `utils/textblock.py` — Core `TextBlock` data structure for text regions
- `utils/generic.py` — Shared helpers and image processing utilities

### Translator Chains
Translators can be chained: `--translator "chatgpt:JPN;sugoi:ENG"` runs ChatGPT first (→JPN), then Sugoi (→ENG). Parsed by `TranslatorChain` in `config.py`.

## Configuration

- **Environment variables**: `.env` file (see `examples/Example.env` for API keys)
- **Config files**: JSON (`examples/config-example.json`) or TOML (`examples/config-example.toml`)
- **Models**: Auto-downloaded to `./models/` directory (gitignored)

## Tech Stack

- Python 3.10-3.11 (requires ≥3.10, <3.12)
- PyTorch 2.5.1 with CUDA 11.8
- pytest + pytest-asyncio for testing
- Docker base: `pytorch/pytorch:2.5.1-cuda11.8-cudnn9-runtime`

## Frontend i18n & Locale Routing

### URL-based Locale
All frontend routes are prefixed with `/:lang` (`/th`, `/en`). The locale is determined by the URL, not localStorage. Visiting `/` redirects to `/th` or `/en` based on the `Accept-Language` header (defaults to Thai).

### Route Structure (`front/app/routes.ts`)
```
/                    → root-redirect.tsx (redirects to /:lang)
/:lang               → locale-layout.tsx (validates lang, provides LocaleProvider)
  ├── /              → landing.tsx
  ├── /login         → login.tsx
  ├── /studio        → home.tsx
  ├── /studio/editor → editor.tsx
  └── ...
/login, /studio/*    → legacy-redirect.tsx (redirects old URLs to /th/...)
```

### Translation Files
Translations are centralized in JSON files (Angular-style):
```
front/app/i18n/
├── th.json    ← all Thai strings, namespaced by page
├── en.json    ← all English strings, namespaced by page
└── index.ts   ← getMessages(locale) with TypeScript types
```

JSON keys are namespaced: `landing`, `login`, `navbar`, `home`, `project`, `topup`, `profile`, `tokenUsage`, `editor`.

### Hooks (`front/app/context/LocaleContext.tsx`)
- `useLocale()` — returns current locale (`"th" | "en"`) from URL param
- `useLocalePath()` — returns `(path) => "/${locale}${path}"` for building locale-prefixed links
- `useT()` — returns the full typed translations object for the current locale (e.g. `useT().landing.hero.cta`)

### Adding a New Translation
1. Add the key to both `front/app/i18n/th.json` and `front/app/i18n/en.json` under the appropriate namespace
2. Use `const i = useT().namespace` in the component
3. Reference as `i.yourKey` — fully typed via TypeScript inference

### Adding a New Language
1. Create `front/app/i18n/xx.json` copying the structure from `th.json`
2. Add `"xx"` to `SUPPORTED_LOCALES` in `front/app/context/LocaleContext.tsx`
3. Add the locale to the `messages` record in `front/app/i18n/index.ts`
4. Add hreflang `<link>` tags in `landing.tsx` `meta()` function

### SEO
- Each locale gets its own URL (`/th`, `/en`) indexable by search engines
- `meta()` functions return locale-aware `<title>`, `<meta description>`, OG tags, hreflang, and canonical URLs
- Domain for SEO tags: `WunPlae.com`
- Landing page after image is locale-specific: `/images/after-th.webp`, `/images/after-en.webp`

## Observability & Logging Rules

- **Always add structured logging** when writing new code. Use `logging.getLogger(__name__)` and log key operations (start, success, failure) with relevant context (IDs, durations, error details).
- **Server code**: Use the JSON formatter from `server/log_config.py`. Set `correlation_id` in request-handling paths.
- **Error tracking**: Sentry Cloud captures errors from API, Worker, and Client. DSN configured via `SENTRY_DSN` (backend) / `VITE_SENTRY_DSN` (frontend) env vars.
- **When adding try/except**: Always call `sentry_sdk.capture_exception(e)` and `logger.error(...)` with context before re-raising or handling.
