export type WatermarkType = "text" | "image";

export type WatermarkPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface WatermarkSettings {
  enabled: boolean;
  applyTo: "all" | "specific";
  selectedPageIds: Set<string>;
  type: WatermarkType;
  // Text
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  opacity: number;
  // Image
  imageDataUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  // Position
  position: WatermarkPosition;
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
  enabled: false,
  applyTo: "all",
  selectedPageIds: new Set(),
  type: "text",
  text: "WunPlae.com",
  fontFamily: "Kanit",
  fontSize: 24,
  color: "#000000",
  borderEnabled: false,
  borderColor: "#ffffff",
  borderWidth: 1,
  opacity: 0.5,
  imageDataUrl: null,
  imageWidth: 100,
  imageHeight: 100,
  position: "bottom-right",
  offsetX: -20,
  offsetY: -20,
};

const MARGIN = 20;

export function computeWatermarkPosition(
  imageW: number,
  imageH: number,
  contentW: number,
  contentH: number,
  position: WatermarkPosition,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  let x = 0;
  let y = 0;

  // Horizontal
  if (position.includes("left")) {
    x = MARGIN;
  } else if (position.includes("right")) {
    x = imageW - contentW - MARGIN;
  } else {
    x = (imageW - contentW) / 2;
  }

  // Vertical
  if (position.includes("top")) {
    y = MARGIN;
  } else if (position.includes("bottom")) {
    y = imageH - contentH - MARGIN;
  } else {
    y = (imageH - contentH) / 2;
  }

  return { x: x + offsetX, y: y + offsetY };
}

export function shouldApplyWatermark(
  settings: WatermarkSettings,
  imageId: string,
): boolean {
  if (!settings.enabled) return false;
  if (settings.applyTo === "all") return true;
  return settings.selectedPageIds.has(imageId);
}

/**
 * Draw a text watermark onto a 2D canvas context.
 */
export function drawTextWatermark(
  ctx: CanvasRenderingContext2D,
  imageW: number,
  imageH: number,
  settings: WatermarkSettings,
): void {
  const font = `${settings.fontSize}px "${settings.fontFamily}"`;
  ctx.font = font;
  const metrics = ctx.measureText(settings.text);
  const textW = metrics.width;
  const textH = settings.fontSize;

  const { x, y } = computeWatermarkPosition(
    imageW, imageH, textW, textH,
    settings.position, settings.offsetX, settings.offsetY,
  );

  ctx.save();
  ctx.globalAlpha = settings.opacity;
  ctx.font = font;
  ctx.textBaseline = "top";

  if (settings.borderEnabled && settings.borderWidth > 0) {
    ctx.strokeStyle = settings.borderColor;
    ctx.lineWidth = settings.borderWidth * 2;
    ctx.lineJoin = "round";
    ctx.strokeText(settings.text, x, y);
  }

  ctx.fillStyle = settings.color;
  ctx.fillText(settings.text, x, y);
  ctx.restore();
}

/**
 * Draw an image watermark onto a 2D canvas context.
 * The image must already be loaded as an HTMLImageElement.
 */
export function drawImageWatermark(
  ctx: CanvasRenderingContext2D,
  imageW: number,
  imageH: number,
  settings: WatermarkSettings,
  watermarkImg: HTMLImageElement,
): void {
  const { x, y } = computeWatermarkPosition(
    imageW, imageH, settings.imageWidth, settings.imageHeight,
    settings.position, settings.offsetX, settings.offsetY,
  );

  ctx.save();
  ctx.globalAlpha = settings.opacity;
  ctx.drawImage(watermarkImg, x, y, settings.imageWidth, settings.imageHeight);
  ctx.restore();
}

/**
 * Draw watermark (text or image) onto a canvas.
 * For image watermarks, loads the image from dataUrl asynchronously.
 */
export async function drawWatermark(
  canvas: HTMLCanvasElement,
  settings: WatermarkSettings,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imageW = canvas.width;
  const imageH = canvas.height;

  if (settings.type === "text") {
    drawTextWatermark(ctx, imageW, imageH, settings);
  } else if (settings.type === "image" && settings.imageDataUrl) {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = settings.imageDataUrl!;
    });
    drawImageWatermark(ctx, imageW, imageH, settings, img);
  }
}
