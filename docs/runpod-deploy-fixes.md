# RunPod Auto-Deploy & Production Bug Fixes

## Date: 2026-03-16

## 1. Auto-Deploy Workflow (`.github/workflows/deploy.yml`)

**Goal:** Automatically update RunPod worker image after GitHub Actions builds and pushes to GHCR.

**Approach:** Added `deploy-runpod` job that calls RunPod GraphQL API (`saveTemplate` mutation) to update the template's docker image.

**Challenges encountered:**
- `saveEndpoint` mutation doesn't have an `imageName` field — had to use `saveTemplate` instead
- `saveTemplate` requires ALL fields (name, dockerArgs, containerDiskInGb, volumeInGb, env) even for updates
- Shell quoting issues with GraphQL + JSON env vars — rewrote to use curl for HTTP + Python for JSON building
- Python `urllib` got 403 from RunPod API — switched back to curl which worked
- `env: []` in early attempt **wiped all template env vars** including `OPENAI_API_KEY`

**Current status:** Working. Uses two-step approach:
1. Fetch current template settings via GraphQL query (preserves env vars)
2. Update template with new image + all existing settings

**Secrets required:**
- `RUNPOD_API_KEY` — RunPod API key
- `RUNPOD_TEMPLATE_ID` — `fmc7i6m2w7`
- `RUNPOD_ENDPOINT_ID` — `di12hbbh89jda4` (no longer used in workflow, can remove)

## 2. OpenAI Model Fix

**Bug:** Worker used `chatgpt-4o-latest` model which doesn't exist on the API key.

**Root cause:** `.env` file was baked into Docker image via `COPY . /app`. `load_dotenv()` in `keys.py` loaded it, and it contained `OPENAI_MODEL=chatgpt-4o-latest`.

**Fix:**
- Added `.env` and `.env.*` to `.dockerignore`
- Changed default in `keys.py` from `chatgpt-4o-latest` to `gpt-4o-mini`

## 3. Kernel Size Crash (`cv2.getStructuringElement` assertion)

**Bug:** `OpenCV assertion failed: anchor.inside(Rect(0, 0, ksize.width, ksize.height))` in mask refinement.

**Root cause:** `MangaTranslator` initialized in `runpod_handler.py` without `kernel_size` param → stays `None` → passed to `cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (None, None))` → crash. Didn't happen locally because CLI mode loads `kernel_size` from config (default `3`).

**Fix:**
- `manga_translator.py:1361` — fall back to `config.kernel_size` when `self.kernel_size` is None
- `text_mask_utils.py:192` — clamp `kernel_size = max(kernel_size, 1)` as safety net
- `mask_refinement/__init__.py:35` — clamp bubble removal kernel size
- `config.py` — added `ge=1` validation on `kernel_size` field

## 4. RunPod Response Serialization

**Bug:** `Object of type ndarray is not JSON serializable` — translation ran successfully but response failed to serialize.

**Root cause:** `response.model_dump()` returns raw numpy arrays. RunPod needs JSON-serializable dicts.

**Fix:** Changed to `json.loads(response.model_dump_json())` which triggers Pydantic's custom encoders (ndarray → base64 PNG string). Also added missing `import json`.

## Current Status (as of 2026-03-16)

- Deploy workflow: **Working** — auto-triggers on push to `server/**`
- Template env vars: `OPENAI_API_KEY` (real key) + `OPENAI_MODEL=gpt-4o-mini`
- Latest fix (serialization) deployed — needs worker restart after deploy
- **Not yet verified:** Full end-to-end translation via RunPod after all fixes

## RunPod Details

- Endpoint: `probable_maroon_starfish` (ID: `di12hbbh89jda4`)
- Template: `probable_maroon_starfish__template__2w1ewr` (ID: `fmc7i6m2w7`)
- GPU: 24 GB
- Docker image: `ghcr.io/mikeyoshino/manga-translator/runpod-worker:latest`

## Key Learnings

- RunPod `saveTemplate` overwrites ALL fields — always fetch current config first
- `.env` files in Docker images can silently override container env vars via `load_dotenv()`
- `model_dump()` vs `model_dump_json()` — the latter triggers custom Pydantic serializers
- After template updates, workers must be terminated to pick up changes (new release needed)
- `workflow_dispatch` re-runs use the code from the triggered commit, not the latest
