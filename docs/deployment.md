# Deployment Guide

## Architecture

```
Contabo VPS (Singapore, $6/mo)          RunPod Serverless (GPU)
├── nginx:80       (reverse proxy)       └── GPU Worker (RTX 3090)
│   ├── /          → front:3000               ↑
│   └── /api/*     → api:5003                 │ (HTTP)
├── front:3000     (React SSR)                │
├── api:5003       (FastAPI)  ───── Redis ────┘
└── redis:6379     (job queue)
```

- **API + Frontend + Redis + Nginx** run on Contabo VPS (no GPU needed)
- **GPU Worker** runs on RunPod Serverless (pay-per-use, scales to 0)
- GitHub Actions handles CI/CD automatically on push to `main`

---

## VPS Setup (One-Time)

### Server: Contabo Cloud VPS 10 SSD
- IP: `46.250.226.52`
- Location: Singapore
- OS: Ubuntu 24.04
- Specs: 4 vCPU, 8 GB RAM, 75 GB NVMe

### Initial Setup

```bash
ssh root@46.250.226.52

# Install Docker + Git
apt update && apt install -y git
curl -fsSL https://get.docker.com | sh

# Clone repo
git clone https://github.com/mikeyoshino/manga-translator.git ~/manga-translator
cd ~/manga-translator

# Create .env
nano .env
# (paste environment variables — see .env section below)

# Start services
docker compose up -d redis api nginx front

# Verify
curl http://localhost:5003/health
```

### .env Variables

```env
GEMINI_API_KEY=<your-key>
GEMINI_MODEL=gemini-2.0-flash
OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-4o-mini

SUPABASE_URL=<your-url>
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-key>

OMISE_PUBLIC_KEY=<your-key>
OMISE_SECRET_KEY=<your-key>

TOKEN_COST_PER_IMAGE=1
ADMIN_EMAILS=mikeyoshinos@gmail.com
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://46.250.226.52

VITE_SUPABASE_URL=<your-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>

REDIS_URL=redis://redis:6379/0

SENTRY_DSN=
SENTRY_ENVIRONMENT=production
```

---

## CI/CD (GitHub Actions)

### Workflows

| File | Trigger | What it does |
|------|---------|-------------|
| `.github/workflows/ci.yml` | Push/PR to main | Test + lint |
| `.github/workflows/deploy.yml` | Push to main (server/front changes) | Build images → push to GHCR → SSH deploy to VPS |
| `.github/workflows/release.yml` | Manual / GitHub release | Push to Docker Hub |

### GitHub Secrets Required

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `46.250.226.52` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH key |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` |
| `VITE_SUPABASE_URL` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

### Manual Deploy (if needed)

```bash
ssh root@46.250.226.52
cd ~/manga-translator
git pull
docker compose up -d --build api front
docker compose restart nginx
```

---

## Frontend Notes

- Uses React Router v7 with SSR
- `react-router.config.ts` conditionally uses `vercelPreset()` only when `VERCEL=1`
- Docker builds use `react-router-serve` (standard Node server)
- Vite dev server proxies `/api` → `localhost:8000` (see `vite.config.ts`)
- Nginx proxies `/api/*` → `api:5003` in production

---

## API Lightweight Mode

The API server runs without PyTorch/ML dependencies. This is handled by:

- `manga_translator/__init__.py` — catches `ImportError` from `.manga_translator` (torch), falls back to importing only `Config` and `Context`
- `manga_translator/utils/__init__.py` — wraps `inference` import (torch) with `try/except`
- `requirements-api.txt` — lightweight deps only (no torch, no ML models)
- `Dockerfile.api` — based on `python:3.11-slim`, installs only `requirements-api.txt`

---

## Scaling

| Component | Current | How to scale |
|-----------|---------|-------------|
| API | 1 uvicorn worker | `--workers 4` (handles ~80 concurrent) |
| Frontend | 1 container | Fine for thousands of users |
| Redis | 1 instance | Fine for thousands of ops/sec |
| GPU Worker | 0 (RunPod) | RunPod auto-scales based on queue |

The bottleneck is always the GPU worker, not the API/frontend.

---

## Useful Commands

```bash
# Check all services
docker compose ps

# View logs
docker compose logs api --tail 20
docker compose logs front --tail 20
docker compose logs nginx --tail 20

# Health check
curl http://localhost:5003/health

# Rebuild a single service
docker compose up -d --build api

# Force clean rebuild
docker compose build --no-cache front

# Restart nginx after frontend changes
docker compose restart nginx

# Stop everything
docker compose down

# View disk usage
docker system df
```
