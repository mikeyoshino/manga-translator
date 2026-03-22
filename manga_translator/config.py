"""
Re-exports all config types from the manga_shared package.

This file exists for backward compatibility — all definitions now live in
packages/shared/manga_shared/config.py.
"""

from manga_shared.config import (  # noqa: F401
    # Language constants
    VALID_LANGUAGES,
    LANGUAGE_ORIENTATION_PRESETS,
    # Context
    Context,
    # Enums
    Alignment,
    Colorizer,
    ColorizerConfig,
    Detector,
    DetectorConfig,
    Direction,
    Inpainter,
    InpainterConfig,
    InpaintPrecision,
    Ocr,
    OcrConfig,
    Renderer,
    RenderConfig,
    Translator,
    TranslatorConfig,
    Upscaler,
    UpscaleConfig,
    # TranslatorChain
    TranslatorChain,
    translator_chain,
    # Helpers
    hex2rgb,
    resolve_rtl,
    # Config
    Config,
)
