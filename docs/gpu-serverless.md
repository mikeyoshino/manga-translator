# GPU Serverless (RunPod)

## Overview

GPU workers run on RunPod Serverless — pay only for active inference time, scale to zero when idle.

---

## Request Flow (RunPod Mode)

When `WORKER_MODE=runpod`, the API server submits jobs directly to RunPod's HTTP API instead of Redis Streams.

```
┌─────────────┐     HTTP      ┌──────────────────┐     HTTP      ┌─────────────────────────┐
│   Browser    │ ────────────► │   FastAPI API     │ ────────────► │   RunPod Serverless      │
│  (React SPA) │ ◄──────────── │   (Contabo VPS)   │ ◄──────────── │   (GPU Worker)           │
└─────────────┘               └──────────────────┘               └─────────────────────────┘
                                                                   │
                                                                   │ runpod_handler.py
                                                                   │  1. Deserialize Config
                                                                   │  2. Smart routing
                                                                   │  3. MangaTranslator.translate()
                                                                   │  4. Return TranslationResponse
                                                                   │
```

### Sequence

```
1. Client → API:   POST /translate/json  { image, config: { target_lang: "THA" } }
       │
2. API:   _runpod_translate()
       │  ├── Encode image to base64
       │  ├── Serialize config → config_json (model_dump_json)
       │  └── POST https://api.runpod.ai/v2/{endpoint_id}/run
       │        body: { input: { image_b64, config_json } }
       │
3. RunPod queues the job → returns job_id
       │
4. API:   poll_job(job_id) — exponential backoff (1s → 1.5s → ... → 5s max)
       │  └── GET https://api.runpod.ai/v2/{endpoint_id}/status/{job_id}
       │       status: IN_QUEUE → IN_PROGRESS → COMPLETED
       │
5. Worker: runpod_handler.handler(event)
       │  ├── Decode base64 image
       │  ├── Deserialize config_json → Config object
       │  ├── apply_smart_routing(config)          ← auto-selects translator chain
       │  │     └── target_lang="THA" → translator_chain="sugoi:ENG;chatgpt:THA"
       │  ├── MangaTranslator.translate(image, config)
       │  │     ├── Detection (DBNET/CTD)
       │  │     ├── OCR → detects source language (e.g. JPN)
       │  │     ├── Text merge
       │  │     ├── Inpainting (LaMa)
       │  │     ├── Translation (sugoi: JPN→ENG, then chatgpt: ENG→THA)
       │  │     └── Rendering (with per-language font)
       │  └── to_translation(ctx) → TranslationResponse JSON
       │
6. RunPod returns output → API receives COMPLETED status with result
       │
7. API → Client:   JSON response (translations, inpainted image, etc.)
```

### Smart Routing (server/smart_routing.py)

The worker auto-selects the best translator chain so clients only need to send `target_lang`:

| Client sends `target_lang` | Worker sets `translator_chain` | What happens |
|---|---|---|
| `ENG` | `"sugoi:ENG"` | Sugoi JPN→ENG (offline, best quality) |
| `JPN` | `"sugoi:JPN"` | Sugoi ENG→JPN (offline) |
| `THA` | `"sugoi:ENG;chatgpt:THA"` | Sugoi JPN→ENG + ChatGPT ENG→THA |
| Any other | `"sugoi:ENG;chatgpt:<lang>"` | Same two-hop pattern |

Smart routing is **skipped** when the client explicitly sets `translator_chain` or `selective_translation`.

### Differences from Redis Mode

| Aspect | Redis mode | RunPod mode |
|--------|-----------|-------------|
| Job dispatch | Redis Streams (XADD/XREADGROUP) | RunPod HTTP API (POST /run) |
| Progress streaming | Redis PubSub → real-time frames | No real-time progress; single "Processing on GPU..." frame |
| Result delivery | PubSub frame + Redis KV | RunPod poll → JSON response |
| Worker lifecycle | Self-registered, heartbeat | Managed by RunPod (auto-scale) |
| Smart routing | Not applied (client decides) | Applied in handler before pipeline |

---

## Key Files

| File | Role |
|------|------|
| `server/runpod_handler.py` | RunPod entrypoint — receives jobs, applies smart routing, runs pipeline |
| `server/smart_routing.py` | `build_smart_chain()` and `apply_smart_routing()` — auto-selects translator |
| `server/runpod_adapter.py` | API-side HTTP client — `submit_job()`, `poll_job()`, `check_health()` |
| `server/myqueue.py` | Queue abstraction — `RunPodTaskQueue` wraps adapter with same interface as Redis |
| `server/request_extraction.py` | Orchestrates RunPod submit/poll for each endpoint |

---

## Cost Analysis

### RunPod RTX 3090 Serverless
- Rate: ~$0.30/hr GPU time
- Per image: ~10 seconds = **$0.00083/image (~0.03 THB)**

### Profitability Per Package

Using **GPT-4o-mini** as translator:

| Package | Revenue | GPU cost | API cost | Omise fee (3.65%) | **Profit** | **Margin** |
|---------|---------|----------|----------|-------------------|-----------|-----------|
| 50 tokens (99 THB) | 99 THB | ~1.5 THB | ~5 THB | ~3.6 THB | **~89 THB** | ~90% |
| 200 tokens (299 THB) | 299 THB | ~6 THB | ~20 THB | ~10.9 THB | **~262 THB** | ~88% |
| 500 tokens (599 THB) | 599 THB | ~15 THB | ~50 THB | ~21.9 THB | **~512 THB** | ~85% |

### Translation API Cost Comparison

| Translator | Cost per image | Recommendation |
|-----------|---------------|----------------|
| GPT-4o | ~0.5-1.5 THB | Premium option only |
| **GPT-4o-mini** | **~0.05-0.15 THB** | **Default — best value** |
| **Gemini Flash** | **~0.02-0.05 THB** | **Cheapest, good quality** |
| Offline (NLLB/Sugoi) | 0 THB | Free, runs on worker GPU |

---

## Cold Start

| Phase | Time |
|-------|------|
| Container startup | 5-15s |
| Model loading (detector + OCR + inpainter) | 10-60s |
| First inference | 10-30s |
| **Total first request** | **~30-90s** |

Subsequent requests (warm): **~5-15s per image**

### Reducing Cold Start

| Strategy | Tradeoff |
|----------|----------|
| Set min workers = 1 | No cold start, but ~$160-250/mo for always-on GPU |
| Increase idle timeout (10-15 min) | Stays warm between bursts, costs more during gaps |
| **Network Volume (current)** | **Models on persistent SSD, fast builds, first boot downloads once** |

### Scale-Down Timeout

| Provider | Default idle timeout | Configurable? |
|----------|---------------------|---------------|
| RunPod Serverless | 5 seconds | Yes (up to 15 min) |
| Modal | 60 seconds | Yes |
| Replicate | ~30 seconds | Limited |

---

## Processing Speed

### Single Worker (RTX 3090)

| Stage | Time per image |
|-------|---------------|
| Detection (DBNET/CTD) | 1-3s |
| OCR | 1-2s |
| Inpainting (LaMa) | 2-5s |
| Translation (API) | 1-3s |
| Rendering | <1s |
| **Total** | **~5-15s** |

### Batch Processing (20 images)

| Workers | Time |
|---------|------|
| 1 | 2-5 min |
| 2 | 1-2.5 min |
| 4 | 30-75s |

---

## Network Volume (Persistent Model Storage)

Models (~5-8 GB) are stored on a RunPod **Network Volume** instead of being baked into the Docker image. This gives us:

- **Fast builds** — Docker image is lightweight (no model download during build)
- **Fast cold starts** — models load from persistent SSD after first boot
- **Single download** — models are downloaded once to the volume; subsequent workers reuse them

### How It Works

On startup, `server/runpod_handler.py` runs this sequence before initializing `MangaTranslator`:

```
1. Check if /runpod-volume exists (RunPod mounts it automatically)
2. If yes: symlink /app/models → /runpod-volume/models
3. Run _ensure_models() — downloads any missing models (no-op if cached)
4. If no volume: fall back to /app/models (local dev compatibility)
```

### Cold Start Timeline

| Scenario | Model download | Model load | Total |
|----------|---------------|------------|-------|
| **First boot (empty volume)** | ~5-10 min | ~10-60s | ~6-11 min |
| **Subsequent cold starts** | 0s (cached) | ~10-60s | ~10-60s |
| **Warm worker** | 0s | 0s | ~5-15s per image |

### Network Volume Setup (One-Time)

1. **Create the volume** in [RunPod Console](https://www.runpod.io/console/user/storage):
   - Click **Network Volumes** → **New Network Volume**
   - **Name:** `manga-translator-models`
   - **Region:** Must match your endpoint region (e.g., `US-TX-3`)
   - **Size:** 20 GB (models are ~5-8 GB, leaves room for growth)

2. **Attach to your serverless endpoint:**
   - Go to **Serverless** → your endpoint → **Edit Template**
   - Under **Network Volume**, select the volume you just created
   - The volume mounts at `/runpod-volume` automatically

3. **Deploy** — push to `main` or manually trigger the deploy workflow. On first worker boot:
   - Logs will show `Using network volume for models: /app/models -> /runpod-volume/models`
   - Then `Downloading model: ...` for each model (one-time)
   - Subsequent boots will show `Model already cached: ...`

4. **Verify** the volume is working:
   ```bash
   # Check RunPod logs for the first cold start
   # You should see:
   #   INFO - Using network volume for models: /app/models -> /runpod-volume/models
   #   INFO - Downloading model: default
   #   ...
   #   INFO - All models ready.
   #   INFO - Initializing MangaTranslator (cold start)...
   ```

### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `No network volume found, using local models` | Volume not attached to endpoint template | Attach volume in RunPod Console → endpoint → Edit Template |
| Models re-download every cold start | Volume region doesn't match endpoint region | Recreate volume in the same region as your endpoint |
| `Failed to download model X` | Network issue during first boot | Worker will retry on next cold start; already-downloaded models are retained |
| Slow first boot (~10 min) | Expected — one-time model download to volume | Subsequent boots will be fast (~30-60s) |

---

## Setup

### 1. RunPod Account
- Sign up at [runpod.io](https://runpod.io)
- Add billing (pay-as-you-go)

### 2. Template Configuration
- Container image: `ghcr.io/mikeyoshino/manga-translator/runpod-worker:latest`
- GPU: RTX 3090 (24GB VRAM)
- Template env vars: `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`

### 3. API Server Configuration
```env
# .env on Contabo VPS
WORKER_MODE=runpod
RUNPOD_ENDPOINT_ID=<your-endpoint-id>
RUNPOD_API_KEY=<your-api-key>
RUNPOD_TIMEOUT=300
```

### 4. Auto-Deploy (CI/CD)
GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:
1. Builds Docker image → pushes to GHCR
2. Updates RunPod template via GraphQL API (`saveTemplate` mutation)
3. Workers pick up new image on next cold start

See [runpod-deploy-fixes.md](./runpod-deploy-fixes.md) for deployment details and past issues.

---

## RunPod Details

- Endpoint: `probable_maroon_starfish` (ID: `di12hbbh89jda4`)
- Template: `probable_maroon_starfish__template__2w1ewr` (ID: `fmc7i6m2w7`)
- GPU: 24 GB
- Docker image: `ghcr.io/mikeyoshino/manga-translator/runpod-worker:latest`

---

## GPU Comparison

| GPU | VRAM | Per image | Monthly (serverless, 100 img/day) | Notes |
|-----|------|-----------|----------------------------------|-------|
| RTX 3070 | 8GB | ~7-20s | ~$3 | Tight VRAM, keep inpaint ≤2048px |
| **RTX 3090** | **24GB** | **~5-15s** | **~$2.5** | **Recommended** |
| A10G | 24GB | ~5-12s | ~$3 | Newer, slightly faster |
| T4 | 16GB | ~10-25s | ~$1.5 | Cheapest, slowest |
