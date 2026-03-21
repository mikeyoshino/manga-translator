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
            prompt="clean manga panel, high quality",
            negative_prompt="text, watermark, blurry, low quality",
            image=pil_image,
            mask_image=pil_mask,
            num_inference_steps=30,
            strength=0.99,
            guidance_scale=7.5,
        ).images[0]

        img_inpainted = np.array(result)
        if img_inpainted.shape[2] == 4:
            img_inpainted = img_inpainted[:, :, :3]

        if new_h != height or new_w != width:
            img_inpainted = cv2.resize(img_inpainted, (width, height), interpolation=cv2.INTER_LINEAR)

        ans = img_inpainted * mask_original + img_original * (1 - mask_original)
        return ans
