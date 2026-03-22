# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manga/image translation tool with a multi-stage pipeline: text detection → OCR → text merging → inpainting → translation → rendering. Supports 30+ translation backends, multiple detection/OCR models, and runs as CLI, GUI (PySide6), or web server (FastAPI).

## Common Commands

```bash
# Install dependencies
pip install -e packages/shared/        # shared package (required first)
pip install -r requirements.txt        # worker/ML deps
pip install -r requirements-api.txt    # API-only deps
pip install -r requirements-dev.txt    # dev tools: pytest, pylint

# Run CLI translation (single image)
python -m manga_translator local -i <image_path>

# Run CLI translation (batch)
python -m manga_translator local -i <folder_path> -o <output_folder>

# Run FastAPI web server (legacy path, still works)
python server/main.py --verbose --start-instance --host=0.0.0.0 --port=5003

# Run FastAPI web server (new modular path)
PYTHONPATH=.:services/api uvicorn api.main:app --host 0.0.0.0 --port 5003

# Run GPU worker (legacy path, still works)
python -m server.worker --use-gpu --verbose

# Run GPU worker (new modular path)
PYTHONPATH=.:services/worker python -m worker.main --use-gpu --verbose

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

# Docker (dev — all services)
docker compose -f infra/docker-compose.yml up

# Docker (prod — pre-built images)
docker compose -f infra/docker-compose.prod.yml up -d
```

## Architecture

### Modular Monorepo Structure

The project is structured as a modular monorepo with independently deployable services:

```
manga-translator/
├── packages/shared/manga_shared/    # Shared Python package (config, Redis, Supabase, logging)
├── services/
│   ├── api/api/                     # FastAPI API server (routes, services, adapters, middleware)
│   ├── worker/worker/               # ML Translation Worker (Redis consumer + RunPod handler)
│   ├── front/                       # React Frontend (placeholder — code still in /front)
│   └── crm/                         # CRM Admin Panel (standalone Dockerfile)
├── infra/                           # Docker Compose configs + nginx
│   ├── nginx/                       # Pure nginx (proxies to services)
│   ├── docker-compose.yml           # Dev: build from source
│   ├── docker-compose.prod.yml      # Prod: GHCR images
│   └── docker-compose.split.yml     # Multi-VPS deployment
├── server/                          # Legacy API code (re-exports from services/api during transition)
├── manga_translator/                # ML pipeline (stays here, used by worker)
├── front/                           # React frontend source
└── crm/                             # CRM admin source
```

### Shared Package (`packages/shared/manga_shared/`)
Single source of truth for types shared between API and Worker:
- `config.py` — Config, enums (Detector, Ocr, Translator, etc.), Context, TranslatorChain, VALID_LANGUAGES
- `redis_protocol.py` — Redis connection pool, stream constants, job queue, pub/sub, worker registry
- `supabase_client.py` — Service-role Supabase client for token operations
- `log_config.py` — JSON structured logging with correlation IDs
- `monitoring.py` — Sentry initialization

### API Service (`services/api/api/`)
Lightweight FastAPI server (no ML dependencies):
- `routes/` — auth, translate, projects, payment, admin, health
- `services/` — auth, token_guard, payment, projects, admin_queries, context_extraction
- `models/` — request/response Pydantic models
- `adapters/` — redis_queue (dual Redis/RunPod mode), runpod, smart_routing
- `middleware/` — auth cookie refresh, request logging

### Worker Service (`services/worker/worker/`)
GPU worker consuming Redis Stream jobs:
- `main.py` — TranslationWorker class with Redis consumer loop
- `runpod_handler.py` — RunPod Serverless handler
- `pipeline/` — (transitional) ML pipeline stays in `manga_translator/`

### Translation Pipeline (`manga_translator/manga_translator.py`)
The core ~138KB file orchestrating the full pipeline. Each stage has swappable implementations selected via enums in `packages/shared/manga_shared/config.py`.

### Entry Points
- **CLI**: `manga_translator/__main__.py` → dispatches to mode handlers in `manga_translator/mode/`
- **GUI**: `MangaStudioMain.py` → PySide6 app in `MangaStudio_Data/app/`
- **API Server**: `services/api/api/main.py` (or legacy `server/main.py`) → FastAPI
- **Worker**: `services/worker/worker/main.py` (or legacy `server/worker.py`) → Redis consumer

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
- `packages/shared/manga_shared/config.py` — Pydantic models and enums for all component types (canonical source)
- `manga_translator/config.py` — Re-exports from `manga_shared` for backward compatibility
- `manga_translator/args.py` — CLI argument parsing with subcommands: `local`, `ws`, `shared`, `config-help`
- `manga_translator/utils/textblock.py` — Core `TextBlock` data structure for text regions
- `services/api/api/services/token_guard.py` — `TokenCharge` class with idempotent refund

### Dependency Graph
```
services/front  ──HTTP──→  services/api
services/crm   ──HTTP──→  services/api
services/api   ──Redis──→  services/worker
    │                          │
    └── depends on ──→  packages/shared  ←── depends on ──┘
```

### Translator Chains
Translators can be chained: `--translator "chatgpt:JPN;sugoi:ENG"` runs ChatGPT first (→JPN), then Sugoi (→ENG). Parsed by `TranslatorChain` in `manga_shared/config.py`.

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
- **Server code**: Use the JSON formatter from `manga_shared.log_config`. Set `correlation_id` in request-handling paths.
- **Error tracking**: Sentry Cloud captures errors from API, Worker, and Client. DSN configured via `SENTRY_DSN` (backend) / `VITE_SENTRY_DSN` (frontend) env vars.
- **When adding try/except**: Always call `sentry_sdk.capture_exception(e)` and `logger.error(...)` with context before re-raising or handling.

## Token Billing & Refund

All paid endpoints (`/translate/with-form/*`, `/inpaint`, `/projects/.../translate`) deduct tokens before work starts and refund on failure.

### How it works (`services/api/api/services/token_guard.py`)
- `deduct_or_raise(user_id, amount, reference, is_admin)` — deducts tokens or raises HTTP 402. Returns `None` for admins.
- `TokenCharge.refund(reason)` — idempotent (safe to call multiple times). Credits tokens back with `type_="refund"`. On refund failure, logs ERROR and sends a Sentry fatal message for ops alerting.

### Endpoint patterns
- **Non-streaming** (json, bytes, image): wrap `get_ctx()` in try/except, call `charge.refund()` on failure.
- **Streaming** (all `/stream` endpoints, project translate): pass `charge.refund` as `on_error` callback to `while_streaming()`.
- **Inpaint**: refund in existing except block.

### Adding a new paid endpoint
1. Call `charge = deduct_or_raise(user.id, TOKEN_COST_PER_IMAGE, "your/ref", user.is_admin)`
2. For non-streaming: wrap work in try/except, call `charge.refund(reason=str(e))` in except
3. For streaming: pass `on_error=charge.refund if charge else None` to `while_streaming()`
