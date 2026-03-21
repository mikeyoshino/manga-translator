import logging
import os

import cv2
import numpy as np
import torch
from PIL import Image

from .common import OfflineInpainter
from ..config import InpainterConfig
from ..utils import resize_keep_aspect

logger = logging.getLogger(__name__)


class StableDiffusionXLInpainter(OfflineInpainter):
    _MODEL_MAPPING = {}
    _MODEL_ID = "diffusers/stable-diffusion-xl-1.0-inpainting-0.1"

    def __init__(self, *args, **kwargs):
        os.makedirs(self.model_dir, exist_ok=True)
        super().__init__(*args, **kwargs)

    async def _check_downloaded(self) -> bool:
        try:
            from huggingface_hub import snapshot_download
            path = snapshot_download(self._MODEL_ID, local_files_only=True)
            return path is not None
        except Exception:
            return False

    async def _download(self):
        from huggingface_hub import snapshot_download
        logger.info("Downloading SDXL inpainting model from HuggingFace Hub...")
        snapshot_download(self._MODEL_ID)
        logger.info("SDXL inpainting model downloaded.")

    async def _load(self, device: str):
        from diffusers import StableDiffusionXLInpaintPipeline

        dtype = torch.float16 if device.startswith("cuda") else torch.float32
        self.pipeline = StableDiffusionXLInpaintPipeline.from_pretrained(
            self._MODEL_ID,
            torch_dtype=dtype,
            variant="fp16" if dtype == torch.float16 else None,
        )
        if device.startswith("cuda"):
            self.pipeline.enable_model_cpu_offload()
        else:
            self.pipeline.to(device)
        self.device = device
        logger.info("SDXL inpainting pipeline loaded on %s", device)

    async def _unload(self):
        del self.pipeline
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def _try_auto_fill(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        threshold: int,
    ) -> np.ndarray | None:
        """Try to fill masked region with border color if surroundings are predominantly white/light.

        Returns filled image if auto-fill applies, None otherwise.
        """
        # Dilate mask to get a border ring around it
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
        dilated = cv2.dilate(mask, kernel, iterations=1)
        border_ring = dilated.astype(bool) & ~mask.astype(bool)

        if not np.any(border_ring):
            return None

        # Sample border pixels from original image
        if image.ndim == 3:
            border_pixels = image[border_ring]  # shape: (N, C)
            brightness = np.mean(border_pixels, axis=1)
        else:
            border_pixels = image[border_ring]
            brightness = border_pixels.astype(float)

        # Check if median brightness exceeds threshold
        median_brightness = np.median(brightness)
        if median_brightness < threshold:
            return None

        # Compute median color from border pixels
        median_color = np.median(border_pixels, axis=0).astype(np.uint8)

        result = image.copy()
        result[mask.astype(bool)] = median_color
        logger.info(
            "Auto white-fill applied (median brightness=%.1f, threshold=%d)",
            median_brightness, threshold,
        )
        return result

    async def _infer(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        config: InpainterConfig,
        inpainting_size: int = 1024,
        verbose: bool = False,
    ) -> np.ndarray:
        img_original = np.copy(image)
        mask_original = np.copy(mask)
        mask_original[mask_original < 127] = 0
        mask_original[mask_original >= 127] = 1
        mask_original = mask_original[:, :, None]

        # Step 1: Try auto white-fill for speech bubbles
        if config.sdxl_auto_white_fill:
            binary_mask = np.copy(mask)
            binary_mask[binary_mask < 127] = 0
            binary_mask[binary_mask >= 127] = 255
            filled = self._try_auto_fill(img_original, binary_mask, config.sdxl_white_threshold)
            if filled is not None:
                return filled

        # Step 2: SDXL pipeline with anti-text prompts and tuned parameters
        height, width, c = image.shape
        if max(image.shape[0:2]) > inpainting_size:
            image = resize_keep_aspect(image, inpainting_size)
            mask = resize_keep_aspect(mask, inpainting_size)

        pad_size = 8
        h, w, c = image.shape
        new_h = h if h % pad_size == 0 else h + (pad_size - (h % pad_size))
        new_w = w if w % pad_size == 0 else w + (pad_size - (w % pad_size))
        if new_h != h or new_w != w:
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            mask = cv2.resize(mask, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        self.logger.info("SDXL inpainting resolution: %dx%d", new_w, new_h)

        pil_image = Image.fromarray(image)
        mask[mask < 127] = 0
        mask[mask >= 127] = 255
        pil_mask = Image.fromarray(mask)

        result = self.pipeline(
            prompt="blank empty background, smooth clean surface",
            negative_prompt=(
                "text, words, letters, writing, kanji, hiragana, katakana, characters, "
                "symbols, numbers, watermark, signature, font, typography, calligraphy, "
                "handwriting, script, glyphs"
            ),
            image=pil_image,
            mask_image=pil_mask,
            num_inference_steps=config.sdxl_num_inference_steps,
            strength=config.sdxl_strength,
            guidance_scale=config.sdxl_guidance_scale,
        ).images[0]

        img_inpainted = np.array(result)
        if img_inpainted.shape[2] == 4:
            img_inpainted = img_inpainted[:, :, :3]

        if new_h != height or new_w != width:
            img_inpainted = cv2.resize(img_inpainted, (width, height), interpolation=cv2.INTER_LINEAR)

        # Step 3: Feathered mask blending — Gaussian blur on mask edges for smooth transitions
        blend_mask = mask_original.astype(np.float32)
        blur_size = max(3, min(height, width) // 100) | 1  # ensure odd, scale with image
        blend_mask = cv2.GaussianBlur(blend_mask, (blur_size, blur_size), 0)
        if blend_mask.ndim == 2:
            blend_mask = blend_mask[:, :, None]

        ans = (img_inpainted * blend_mask + img_original * (1 - blend_mask)).astype(np.uint8)
        return ans
