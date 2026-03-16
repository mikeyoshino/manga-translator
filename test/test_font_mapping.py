import os
import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from manga_translator.rendering import text_render
from manga_translator.rendering import dispatch as dispatch_rendering
from manga_translator.utils import TextBlock


# --- LANGUAGE_FONTS coverage tests ---

def test_language_fonts_has_expected_languages():
    """All common target languages are mapped in LANGUAGE_FONTS."""
    expected = {'THA', 'ENG', 'JPN', 'KOR', 'CHS', 'CHT'}
    assert expected.issubset(set(text_render.LANGUAGE_FONTS.keys()))


def test_all_language_font_paths_exist():
    """All font paths in LANGUAGE_FONTS point to existing files."""
    for lang, path in text_render.LANGUAGE_FONTS.items():
        assert os.path.isfile(path), f"Font for {lang} not found: {path}"


def test_fallback_fonts_exist():
    """All fallback font files exist on disk."""
    for path in text_render.FALLBACK_FONTS:
        assert os.path.isfile(path), f"Fallback font not found: {path}"


def test_language_fonts_paths_are_absolute():
    """All LANGUAGE_FONTS paths are absolute paths."""
    for lang, path in text_render.LANGUAGE_FONTS.items():
        assert os.path.isabs(path), f"Font path for {lang} is not absolute: {path}"


# --- set_font tests ---

def test_set_font_with_language_font():
    """set_font() correctly loads a font when given a valid path."""
    tha_font = text_render.LANGUAGE_FONTS.get('THA')
    if tha_font and os.path.isfile(tha_font):
        text_render.set_font(tha_font)
        assert len(text_render.FONT_SELECTION) > 0
        # First font should be the THA font, rest are fallbacks
        assert len(text_render.FONT_SELECTION) == 1 + len(text_render.FALLBACK_FONTS)


def test_set_font_empty_uses_fallbacks():
    """set_font('') uses only fallback fonts."""
    text_render.set_font('')
    assert len(text_render.FONT_SELECTION) == len(text_render.FALLBACK_FONTS)


# --- dispatch language_fonts override tests ---

@pytest.mark.asyncio
async def test_dispatch_uses_language_fonts_override():
    """dispatch() uses the language_fonts override when provided."""
    width, height = 200, 200
    img = np.zeros((height, width, 3), dtype=np.uint8)
    regions = [
        TextBlock(
            [[[10, 10], [190, 10], [10, 190], [190, 190]]],
            texts=['test'],
            translation='hello'
        ),
    ]
    regions[0].target_lang = 'THA'
    regions[0].set_font_colors([255, 255, 255], [200, 200, 200])
    regions[0].font_size = 30

    # Custom override font map using a known-existing font
    eng_font = text_render.LANGUAGE_FONTS.get('ENG', '')
    custom_fonts = {'THA': eng_font}  # Override THA to use ENG font

    with patch.object(text_render, 'set_font') as mock_set_font:
        try:
            await dispatch_rendering(img, regions, language_fonts=custom_fonts)
        except Exception:
            pass  # Rendering may fail without full setup, but set_font should be called

        # Verify set_font was called with the overridden font (ENG font for THA)
        mock_set_font.assert_called_once_with(eng_font)


@pytest.mark.asyncio
async def test_dispatch_falls_back_to_default_language_fonts():
    """dispatch() uses default LANGUAGE_FONTS when no override is provided."""
    width, height = 200, 200
    img = np.zeros((height, width, 3), dtype=np.uint8)
    regions = [
        TextBlock(
            [[[10, 10], [190, 10], [10, 190], [190, 190]]],
            texts=['test'],
            translation='hello'
        ),
    ]
    regions[0].target_lang = 'THA'
    regions[0].set_font_colors([255, 255, 255], [200, 200, 200])
    regions[0].font_size = 30

    tha_font = text_render.LANGUAGE_FONTS.get('THA', '')

    with patch.object(text_render, 'set_font') as mock_set_font:
        try:
            await dispatch_rendering(img, regions)
        except Exception:
            pass

        mock_set_font.assert_called_once_with(tha_font)
