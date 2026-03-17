/**
 * Renders styled text onto an offscreen canvas using the browser's native
 * text shaping, which correctly handles Thai combining characters (e.g. สำ).
 * Returns the canvas element for use as a Konva Image source.
 */
import { segmentGraphemes, segmentWords } from "./textSegment";

export interface TextRenderOptions {
  text: string;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontStyle: string; // "normal", "bold", "italic", "bold italic"
  color: string;
  align: string; // "left" | "center" | "right"
  letterSpacing: number;
  lineHeight: number;
  strokeEnabled: boolean;
  strokeColor: string;
  strokeWidth: number;
}


/**
 * Release a canvas's backing bitmap memory.
 */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

// Thai test string for font loading — ensures Thai unicode-range subset is loaded
const THAI_TEST_CHARS = "กขคง";

/**
 * Wait until a specific font family is fully loaded and usable for canvas rendering.
 * Tests with Thai characters to ensure the Thai unicode-range subset is downloaded
 * (Google Fonts splits fonts by unicode-range).
 */
export function waitForFont(fontFamily: string, testText?: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  // Use Thai test chars by default to ensure Thai subset loads
  const text = testText || THAI_TEST_CHARS;
  const spec = `16px "${fontFamily}"`;

  // If already loaded, resolve immediately
  if (document.fonts.check(spec, text)) {
    return Promise.resolve();
  }

  // Trigger the download with Thai text
  return document.fonts.load(spec, text).then(() => {
    if (document.fonts.check(spec, text)) return;

    // Poll until the font is truly available for Thai glyphs
    return new Promise<void>((resolve) => {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (document.fonts.check(spec, text) || attempts > 50) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  });
}

export function renderTextToCanvas(opts: TextRenderOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(opts.width));
  canvas.height = Math.max(1, Math.round(opts.height));

  const ctx = canvas.getContext("2d")!;

  // Build font string — font should already be loaded via FontFace API
  const parts: string[] = [];
  if (opts.fontStyle.includes("italic")) parts.push("italic");
  if (opts.fontStyle.includes("bold")) parts.push("bold");
  parts.push(`${opts.fontSize}px "${opts.fontFamily}"`);
  ctx.font = parts.join(" ");

  ctx.textBaseline = "top";

  // Word-wrap the text
  const lines = wrapText(ctx, opts.text, opts.width, opts.letterSpacing);

  const actualLineHeight = opts.fontSize * opts.lineHeight;
  const totalTextHeight = lines.length * actualLineHeight;

  // Vertical center
  let startY = Math.max(0, (opts.height - totalTextHeight) / 2);

  for (const line of lines) {
    let x = 0;
    const lineWidth = measureWithSpacing(ctx, line, opts.letterSpacing);

    if (opts.align === "center") {
      x = (opts.width - lineWidth) / 2;
    } else if (opts.align === "right") {
      x = opts.width - lineWidth;
    }

    if (opts.letterSpacing && opts.letterSpacing !== 0) {
      drawTextWithSpacing(ctx, line, x, startY, opts);
    } else {
      // Draw stroke first (behind fill) for a clean border effect
      if (opts.strokeEnabled && opts.strokeWidth > 0) {
        ctx.strokeStyle = opts.strokeColor;
        ctx.lineWidth = opts.strokeWidth * 2; // double because stroke is centered on path
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(line, x, startY);
      }
      ctx.fillStyle = opts.color;
      ctx.fillText(line, x, startY);
    }

    startY += actualLineHeight;
  }

  return canvas;
}

function drawTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: TextRenderOptions
) {
  const segments = segmentGraphemes(text);
  let curX = x;

  // First pass: draw all strokes
  if (opts.strokeEnabled && opts.strokeWidth > 0) {
    ctx.strokeStyle = opts.strokeColor;
    ctx.lineWidth = opts.strokeWidth * 2;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    let sx = x;
    for (const seg of segments) {
      ctx.strokeText(seg, sx, y);
      sx += ctx.measureText(seg).width + opts.letterSpacing;
    }
  }
  // Second pass: draw all fills on top
  ctx.fillStyle = opts.color;
  let fx = x;
  for (const seg of segments) {
    ctx.fillText(seg, fx, y);
    fx += ctx.measureText(seg).width + opts.letterSpacing;
  }
}


function measureWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number
): number {
  if (!letterSpacing || letterSpacing === 0) {
    return ctx.measureText(text).width;
  }
  const segments = segmentGraphemes(text);
  let w = 0;
  for (const seg of segments) {
    w += ctx.measureText(seg).width + letterSpacing;
  }
  return w > 0 ? w - letterSpacing : 0;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  letterSpacing: number
): string[] {
  const paragraphs = text.split("\n");
  const result: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      result.push("");
      continue;
    }

    const words = segmentWords(paragraph);
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine + word;
      const testWidth = measureWithSpacing(ctx, testLine, letterSpacing);

      if (testWidth > maxWidth && currentLine !== "") {
        result.push(currentLine);
        currentLine = word.trim() === "" ? "" : word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      result.push(currentLine);
    }
  }

  return result.length > 0 ? result : [""];
}
