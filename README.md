# Manga Image Translator

Internal manga/image translation tool with a multi-stage pipeline: text detection, OCR, text merging, inpainting, translation, and rendering.

## Quick Start

### Prerequisites

- Python 3.10 or 3.11
- CUDA-capable GPU (recommended)

### Setup

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt  # dev tools: pytest, pylint
```

Models are automatically downloaded to `./models/` on first run.

### Environment Variables

Copy `examples/Example.env` to `.env` and fill in any required API keys. See [Environment Variables Summary](#environment-variables) for a full list.

## Usage

### CLI - Single Image

```bash
python -m manga_translator local -i <image_path>
```

### CLI - Batch

```bash
python -m manga_translator local -i <folder_path> -o <output_folder>
```

Results are saved to `<input_folder>-translated` by default.

### API Server (FastAPI)

```bash
python server/main.py --verbose --start-instance --host=0.0.0.0 --port=5003 --use-gpu
```

API docs available at `http://localhost:5003/docs`.

### WebSocket Server

```bash
python -m manga_translator ws --host 0.0.0.0 --port 5003
```

### GUI

```bash
python MangaStudioMain.py
```

### Config Schema

```bash
python -m manga_translator config-help
```

## Docker

```bash
# Build
docker build . --tag=manga-image-translator

# Run API server with GPU
docker run --gpus all -p 5003:5003 --ipc=host \
  --env-file .env \
  --entrypoint python \
  manga-image-translator \
  server/main.py --verbose --start-instance --host=0.0.0.0 --port=5003 --use-gpu

# Run CLI batch translation
docker run --gpus all --ipc=host \
  --env-file .env \
  -v ./input:/app/input \
  -v ./output:/app/output \
  manga-image-translator \
  local -i /app/input -o /app/output
```

## Pipeline Architecture

Each stage has swappable implementations selected via config:

| Stage | Options |
|-------|---------|
| **Detection** | `default` (DBConvNext), `ctd`, `craft`, `paddle`, `none` |
| **OCR** | `model_32px`, `model_48px`, `model_48px_ctc`, `manga_ocr` |
| **Inpainting** | `default`, `lama_large`, `lama_mpe`, `sd`, `none`, `original` |
| **Translation** | 30+ backends (see [Translator Routing](#translator-routing)) |
| **Upscaling** | Optional image upscaling |
| **Colorization** | `none`, `mc2` |

### Translator Routing

Translators can be chained for multi-hop translation:

```
--translator "chatgpt:JPN;sugoi:ENG"
```

The API server uses **smart routing** (`server/smart_routing.py`) to automatically select the optimal chain:

| Target Language | Chain | Notes |
|----------------|-------|-------|
| ENG | `sugoi:ENG` | Offline, best quality for JPN to ENG |
| JPN | `sugoi:JPN` | Offline, ENG to JPN |
| THA | `nllb_big:THA` | Offline, direct JPN to THA |
| Others | `sugoi:ENG;chatgpt:<target>` | Two-hop via English |

## Configuration

Configuration can be provided via:
- **CLI flags** (see `python -m manga_translator local --help`)
- **JSON config file** (see `examples/config-example.json`)
- **TOML config file** (see `examples/config-example.toml`)
- **Environment variables** (see `examples/Example.env`)

### Key CLI Options

```
-v, --verbose              Debug output and save intermediate images
-i, --input INPUT          Image file or folder path
-o, --dest DEST            Output folder path
--use-gpu                  Enable GPU acceleration (auto-detects CUDA/MPS)
--font-path FONT_PATH      Custom font file
--pre-dict PRE_DICT        Pre-translation replacement dictionary
--post-dict POST_DICT      Post-translation replacement dictionary
--kernel-size KERNEL_SIZE   Convolution kernel size for text erasure
--attempts ATTEMPTS         Retry count on error (-1 for infinite)
--ignore-errors             Skip images on error
```

### Tips for Better Quality

- Use `upscale_ratio 2` for low-resolution images that trip up the detector
- Set `font_size_offset` or use `--manga2eng` renderer for larger text output
- Use `mask_dilation_offset 10~30` for better source text coverage
- Increase `box_threshold` to filter OCR false positives
- Adjust `detection_size` based on image resolution (lower for low-res, higher for high-res)
- Increase `inpainting_size` for high-res images to prevent source text leaking through

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key for ChatGPT translator |
| `OPENAI_API_BASE` | Custom OpenAI API base URL |
| `OPENAI_MODEL` | OpenAI model to use |
| `DEEPL_AUTH_KEY` | DeepL API key |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Google Cloud credentials JSON |

See `examples/Example.env` for the full list.

## Development

### Running Tests

```bash
pytest test/

# Single test file
pytest test/test_translation.py

# Specific test
pytest test/test_translation.py::test_single_language
```

### Linting

```bash
pylint $(git ls-files '*.py')
```

### Project Structure

```
manga_translator/
  __main__.py          # CLI entry point
  manga_translator.py  # Core pipeline orchestrator
  config.py            # Pydantic models and enums
  args.py              # CLI argument parsing
  detection/           # Text region detectors
  ocr/                 # OCR models
  textline_merge/      # Text line combining
  inpainting/          # Text removal (LaMa, SD)
  translators/         # 30+ translation backends
  rendering/           # Translated text rendering
  upscaling/           # Image upscaling
  colorization/        # Image colorization
  utils/
    textblock.py       # Core TextBlock data structure
    generic.py         # Shared helpers
server/
  main.py              # FastAPI web server
  smart_routing.py     # Auto translator chain selection
MangaStudioMain.py     # GUI entry point (PySide6)
```
