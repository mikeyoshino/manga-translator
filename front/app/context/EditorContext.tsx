import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { EditorImage, EditableBlock, EditorAction, ImageHistory, TranslationResponseJson } from "@/types";
import { createEmptyHistory, pushToHistory } from "@/types";
import { useAuth } from "@/context/AuthContext";
import Sentry from "@/lib/sentry";
import { initEditableBlocksWithOffset } from "@/utils/initEditableBlocks";
import { loadSettings } from "@/utils/localStorage";
import { apiFetch } from "@/utils/api";
import type { WatermarkSettings } from "@/utils/drawWatermark";
import { DEFAULT_WATERMARK_SETTINGS } from "@/utils/drawWatermark";

export interface DrawingLine {
  points: number[];
  color: string;
  size: number;
  tool: "pen" | "eraser";
}

export interface CloneStampStroke {
  sourceX: number;
  sourceY: number;
  points: number[];
  size: number;
  opacity: number;
}

export interface ManualTranslateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ActiveTool = "select" | "pen" | "eraser" | "magicRemover" | "manualTranslate" | "cloneStamp" | "watermark";

interface EditorContextValue {
  images: EditorImage[];
  setImages: React.Dispatch<React.SetStateAction<EditorImage[]>>;
  currentImageIndex: number;
  setCurrentImageIndex: React.Dispatch<React.SetStateAction<number>>;
  currentImage: EditorImage | null;
  selectedBlockId: string | null;
  setSelectedBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  updateBlock: (imageId: string, blockId: string, updates: Partial<EditableBlock>) => void;
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  drawingLines: Map<string, DrawingLine[]>;
  addDrawingLine: (imageId: string, line: DrawingLine) => void;
  undoDrawingLine: (imageId: string) => void;
  clearDrawingLines: (imageId: string) => void;
  penColor: string;
  setPenColor: React.Dispatch<React.SetStateAction<string>>;
  penSize: number;
  setPenSize: React.Dispatch<React.SetStateAction<number>>;
  magicRemoverLines: Map<string, DrawingLine[]>;
  addMagicRemoverLine: (imageId: string, line: DrawingLine) => void;
  undoMagicRemoverLine: (imageId: string) => void;
  clearMagicRemoverLines: (imageId: string) => void;
  magicRemoverSize: number;
  setMagicRemoverSize: React.Dispatch<React.SetStateAction<number>>;
  isInpainting: boolean;
  imageHistory: Map<string, string[]>;
  applyMagicRemover: (imageId: string) => Promise<void>;
  undoMagicRemover: (imageId: string) => void;
  // Manual translate
  manualTranslateRect: Map<string, ManualTranslateRect | null>;
  setManualTranslateRect: (imageId: string, rect: ManualTranslateRect | null) => void;
  clearManualTranslateRect: (imageId: string) => void;
  isManualTranslating: boolean;
  applyManualTranslate: (imageId: string) => Promise<void>;
  manualTranslateError: string | null;
  // Clone stamp
  cloneStampSize: number;
  setCloneStampSize: React.Dispatch<React.SetStateAction<number>>;
  cloneStampOpacity: number;
  setCloneStampOpacity: React.Dispatch<React.SetStateAction<number>>;
  cloneStampSource: Map<string, { x: number; y: number } | null>;
  setCloneStampSource: (imageId: string, point: { x: number; y: number } | null) => void;
  clearCloneStampSource: (imageId: string) => void;
  cloneStampStrokes: Map<string, CloneStampStroke[]>;
  addCloneStampStroke: (imageId: string, stroke: CloneStampStroke) => void;
  undoCloneStampStroke: (imageId: string) => void;
  clearCloneStampStrokes: (imageId: string) => void;
  isCloneStamping: boolean;
  applyCloneStamp: (imageId: string) => Promise<void>;
  // Watermark
  watermarkSettings: WatermarkSettings;
  setWatermarkSettings: React.Dispatch<React.SetStateAction<WatermarkSettings>>;
  // Unified undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<EditorImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTool, setActiveToolRaw] = useState<ActiveTool>("select");
  const [drawingLines, setDrawingLines] = useState<Map<string, DrawingLine[]>>(new Map());
  const [penColor, setPenColor] = useState("#000000");
  const [penSize, setPenSize] = useState(3);
  const [magicRemoverLines, setMagicRemoverLines] = useState<Map<string, DrawingLine[]>>(new Map());
  const [magicRemoverSize, setMagicRemoverSize] = useState(20);
  const [isInpainting, setIsInpainting] = useState(false);
  const [imageHistory, setImageHistory] = useState<Map<string, string[]>>(new Map());
  const [historyMap, setHistoryMap] = useState<Map<string, ImageHistory>>(new Map());
  const [manualTranslateRect, setManualTranslateRectMap] = useState<Map<string, ManualTranslateRect | null>>(new Map());
  const [isManualTranslating, setIsManualTranslating] = useState(false);
  const [manualTranslateError, setManualTranslateError] = useState<string | null>(null);
  const [cloneStampSize, setCloneStampSize] = useState(20);
  const [cloneStampOpacity, setCloneStampOpacity] = useState(1.0);
  const [cloneStampSourceMap, setCloneStampSourceMap] = useState<Map<string, { x: number; y: number } | null>>(new Map());
  const [cloneStampStrokes, setCloneStampStrokes] = useState<Map<string, CloneStampStroke[]>>(new Map());
  const [isCloneStamping, setIsCloneStamping] = useState(false);
  const [watermarkSettings, setWatermarkSettings] = useState<WatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const { user } = useAuth();
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const imagesRef = useRef<EditorImage[]>([]);
  imagesRef.current = images;
  const pendingActionRef = useRef<{
    imageId: string;
    blockId: string;
    before: Partial<EditableBlock>;
    after: Partial<EditableBlock>;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const currentImage = images[currentImageIndex] ?? null;

  // Helper to get or create history for an image
  const getHistory = useCallback((imageId: string): ImageHistory => {
    return historyMap.get(imageId) || createEmptyHistory();
  }, [historyMap]);

  // Push an action to the undo stack
  const pushAction = useCallback((action: EditorAction) => {
    setHistoryMap((prev) => {
      const next = new Map(prev);
      const current = next.get(action.imageId) || createEmptyHistory();
      next.set(action.imageId, pushToHistory(current, action));
      return next;
    });
  }, []);

  // Flush any pending coalesced block-update action to history
  const flushPendingAction = useCallback(() => {
    const pending = pendingActionRef.current;
    if (pending) {
      clearTimeout(pending.timer);
      pushAction({
        type: "block-update",
        imageId: pending.imageId,
        blockId: pending.blockId,
        before: pending.before,
        after: pending.after,
      });
      pendingActionRef.current = null;
    }
  }, [pushAction]);

  const setActiveTool = useCallback((tool: ActiveTool) => {
    setActiveToolRaw(tool);
    if (tool !== "select") {
      setSelectedBlockId(null);
    }
  }, []);

  // Internal update block (no history recording) - used by undo/redo and auto-save
  const updateBlockInternal = useCallback(
    (imageId: string, blockId: string, updates: Partial<EditableBlock>) => {
      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== imageId) return img;
          const updated = {
            ...img,
            isDirty: true,
            editableBlocks: img.editableBlocks.map((blk) =>
              blk.id === blockId ? { ...blk, ...updates } : blk
            ),
          };
          // Auto-save to backend if this is a persisted project image
          if (updated.projectImageId && user) {
            clearTimeout(saveTimerRef.current[imageId]);
            saveTimerRef.current[imageId] = setTimeout(() => {
              apiFetch(`/api/projects/_/images/${updated.projectImageId}/blocks`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ editable_blocks: updated.editableBlocks }),
              })
                .then(() => {
                  setImages((prev2) =>
                    prev2.map((i) => (i.id === imageId ? { ...i, isDirty: false } : i))
                  );
                })
                .catch(() => {});
            }, 2000);
          }
          return updated;
        })
      );
    },
    [user]
  );

  // Public updateBlock - coalesces rapid edits to the same block into a single history entry
  const updateBlock = useCallback(
    (imageId: string, blockId: string, updates: Partial<EditableBlock>) => {
      const pending = pendingActionRef.current;

      if (pending && pending.imageId === imageId && pending.blockId === blockId) {
        // Same block: merge updates into pending action, keep original "before"
        clearTimeout(pending.timer);
        pending.after = { ...pending.after, ...updates };
        pending.timer = setTimeout(flushPendingAction, 500);
      } else {
        // Different block or no pending action: flush old, start new
        if (pending) {
          flushPendingAction();
        }

        // Capture "before" state from ref
        const img = imagesRef.current.find((im) => im.id === imageId);
        if (img) {
          const block = img.editableBlocks.find((b) => b.id === blockId);
          if (block) {
            const before: Partial<EditableBlock> = {};
            for (const key of Object.keys(updates) as (keyof EditableBlock)[]) {
              (before as Record<string, unknown>)[key] = block[key];
            }
            pendingActionRef.current = {
              imageId,
              blockId,
              before,
              after: { ...updates },
              timer: setTimeout(flushPendingAction, 500),
            };
          }
        }
      }

      // Always update UI immediately
      updateBlockInternal(imageId, blockId, updates);
    },
    [updateBlockInternal, flushPendingAction]
  );

  const addDrawingLine = useCallback((imageId: string, line: DrawingLine) => {
    setDrawingLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, [...(next.get(imageId) || []), line]);
      return next;
    });
    pushAction({ type: "drawing-line-add", imageId, line });
  }, [pushAction]);

  const undoDrawingLine = useCallback((imageId: string) => {
    setDrawingLines((prev) => {
      const lines = prev.get(imageId);
      if (!lines || lines.length === 0) return prev;
      const next = new Map(prev);
      next.set(imageId, lines.slice(0, -1));
      return next;
    });
  }, []);

  const clearDrawingLines = useCallback((imageId: string) => {
    const currentLines = drawingLines.get(imageId) || [];
    if (currentLines.length > 0) {
      pushAction({ type: "drawing-clear", imageId, lines: [...currentLines] });
    }
    setDrawingLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, []);
      return next;
    });
  }, [drawingLines, pushAction]);

  const addMagicRemoverLine = useCallback((imageId: string, line: DrawingLine) => {
    setMagicRemoverLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, [...(next.get(imageId) || []), line]);
      return next;
    });
    pushAction({ type: "magic-line-add", imageId, line });
  }, [pushAction]);

  const undoMagicRemoverLine = useCallback((imageId: string) => {
    setMagicRemoverLines((prev) => {
      const lines = prev.get(imageId);
      if (!lines || lines.length === 0) return prev;
      const next = new Map(prev);
      next.set(imageId, lines.slice(0, -1));
      return next;
    });
  }, []);

  const clearMagicRemoverLines = useCallback((imageId: string) => {
    const currentLines = magicRemoverLines.get(imageId) || [];
    if (currentLines.length > 0) {
      pushAction({ type: "magic-clear", imageId, lines: [...currentLines] });
    }
    setMagicRemoverLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, []);
      return next;
    });
  }, [magicRemoverLines, pushAction]);

  const setManualTranslateRect = useCallback((imageId: string, rect: ManualTranslateRect | null) => {
    setManualTranslateRectMap((prev) => {
      const next = new Map(prev);
      next.set(imageId, rect);
      return next;
    });
    setManualTranslateError(null);
  }, []);

  const clearManualTranslateRect = useCallback((imageId: string) => {
    setManualTranslateRect(imageId, null);
  }, [setManualTranslateRect]);

  const setCloneStampSource = useCallback((imageId: string, point: { x: number; y: number } | null) => {
    setCloneStampSourceMap((prev) => {
      const next = new Map(prev);
      next.set(imageId, point);
      return next;
    });
  }, []);

  const clearCloneStampSource = useCallback((imageId: string) => {
    setCloneStampSource(imageId, null);
  }, [setCloneStampSource]);

  const addCloneStampStroke = useCallback((imageId: string, stroke: CloneStampStroke) => {
    setCloneStampStrokes((prev) => {
      const next = new Map(prev);
      next.set(imageId, [...(next.get(imageId) || []), stroke]);
      return next;
    });
  }, []);

  const undoCloneStampStroke = useCallback((imageId: string) => {
    setCloneStampStrokes((prev) => {
      const strokes = prev.get(imageId);
      if (!strokes || strokes.length === 0) return prev;
      const next = new Map(prev);
      next.set(imageId, strokes.slice(0, -1));
      return next;
    });
  }, []);

  const clearCloneStampStrokes = useCallback((imageId: string) => {
    setCloneStampStrokes((prev) => {
      const next = new Map(prev);
      next.set(imageId, []);
      return next;
    });
  }, []);

  const applyCloneStamp = useCallback(async (imageId: string) => {
    const strokes = cloneStampStrokes.get(imageId);
    if (!strokes || strokes.length === 0) return;

    const img = images.find((im) => im.id === imageId);
    if (!img) return;

    const bgSrc = img.originalFile
      ? URL.createObjectURL(img.originalFile)
      : img.originalImageUrl;
    if (!bgSrc) return;

    setIsCloneStamping(true);
    try {
      const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = bgSrc;
      });

      const offscreen = document.createElement("canvas");
      offscreen.width = bgImg.naturalWidth;
      offscreen.height = bgImg.naturalHeight;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(bgImg, 0, 0);

      // For each stroke, copy pixels from source region of the original image
      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        const offsetX = stroke.sourceX - stroke.points[0];
        const offsetY = stroke.sourceY - stroke.points[1];
        const r = stroke.size / 2;

        for (let j = 0; j < stroke.points.length; j += 2) {
          const destX = stroke.points[j];
          const destY = stroke.points[j + 1];
          const srcX = destX + offsetX;
          const srcY = destY + offsetY;

          // Clamp source region to image bounds
          const sx = Math.max(0, Math.min(bgImg.naturalWidth, srcX - r));
          const sy = Math.max(0, Math.min(bgImg.naturalHeight, srcY - r));
          const sw = Math.min(bgImg.naturalWidth - sx, r * 2);
          const sh = Math.min(bgImg.naturalHeight - sy, r * 2);
          if (sw <= 0 || sh <= 0) continue;

          ctx.save();
          ctx.globalAlpha = stroke.opacity;
          ctx.beginPath();
          ctx.arc(destX, destY, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(bgImg, sx, sy, sw, sh, sx - offsetX, sy - offsetY, sw, sh);
          ctx.restore();
        }
      }

      if (img.originalFile) URL.revokeObjectURL(bgSrc);

      const resultBlob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      });
      const resultUrl = URL.createObjectURL(resultBlob);

      const previousImageUrl = img.originalFile ? "" : (img.originalImageUrl || "");

      pushAction({
        type: "clone-stamp-apply",
        imageId,
        previousImageUrl,
        newImageUrl: resultUrl,
      });

      setImages((prev) =>
        prev.map((im) =>
          im.id === imageId
            ? { ...im, originalImageUrl: resultUrl, originalFile: null }
            : im
        )
      );

      // Clear strokes after apply
      setCloneStampStrokes((prev) => {
        const next = new Map(prev);
        next.set(imageId, []);
        return next;
      });
    } catch (err) {
      console.error("Clone stamp apply failed:", err);
      Sentry.captureException(err);
      alert(err instanceof Error ? err.message : "Clone stamp failed");
    } finally {
      setIsCloneStamping(false);
    }
  }, [cloneStampStrokes, images, pushAction]);

  const applyManualTranslate = useCallback(async (imageId: string) => {
    const rect = manualTranslateRect.get(imageId);
    if (!rect) return;

    const img = images.find((im) => im.id === imageId);
    if (!img) return;

    const bgSrc = img.originalFile
      ? URL.createObjectURL(img.originalFile)
      : img.originalImageUrl;
    if (!bgSrc) return;

    setIsManualTranslating(true);
    setManualTranslateError(null);
    try {
      // Load the background image
      const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = bgSrc;
      });

      // Crop to rect using offscreen canvas
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = rect.width;
      cropCanvas.height = rect.height;
      const cropCtx = cropCanvas.getContext("2d")!;
      cropCtx.drawImage(bgImg, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

      const cropBlob = await new Promise<Blob>((resolve, reject) => {
        cropCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("crop toBlob failed"))), "image/png");
      });

      // Clean up object URL if we created one
      if (img.originalFile) URL.revokeObjectURL(bgSrc);

      // Build translation config from saved settings
      const savedSettings = loadSettings();
      const config = JSON.stringify({
        detector: {
          detector: savedSettings.textDetector || "default",
          detection_size: savedSettings.detectionResolution || "1536",
          box_threshold: 0.7,
          unclip_ratio: 2.3,
        },
        render: { direction: savedSettings.renderTextDirection || "auto" },
        translator: {
          translator: savedSettings.translator || "openai",
          target_lang: savedSettings.targetLanguage || "THA",
        },
        inpainter: {
          inpainter: "lama_large",
          inpainting_size: "2048",
        },
        ocr: { ignore_bubble: savedSettings.skipOutsideBubble ? 10 : 0 },
        mask_dilation_offset: 30,
      });

      const fd = new FormData();
      fd.append("image", cropBlob, "crop.png");
      fd.append("config", config);

      const resp = await apiFetch("/api/translate/with-form/json", {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        let detail = `${resp.status}`;
        try { const j = await resp.json(); detail = j.detail || detail; } catch {}
        throw new Error(`Translation failed: ${detail}`);
      }

      const result: TranslationResponseJson = await resp.json();

      if (!result.translations || result.translations.length === 0) {
        setManualTranslateError("noTextDetected");
        return;
      }

      // Create new editable blocks with coordinate offset
      const targetLang = savedSettings.targetLanguage || "THA";
      const idPrefix = `manual-${Date.now()}`;
      const newBlocks = initEditableBlocksWithOffset(
        result.translations,
        targetLang,
        rect.x,
        rect.y,
        idPrefix,
      ).map(b => ({ ...b, background: "" }));

      // Composite inpainted crop back onto full image
      let newImageUrl = img.originalFile ? "" : (img.originalImageUrl || "");
      const previousImageUrl = newImageUrl;

      if (result.inpainted_image) {
        const fullCanvas = document.createElement("canvas");
        fullCanvas.width = bgImg.naturalWidth;
        fullCanvas.height = bgImg.naturalHeight;
        const fullCtx = fullCanvas.getContext("2d")!;
        fullCtx.drawImage(bgImg, 0, 0);

        // Decode inpainted crop (base64 or data URI)
        const inpaintedSrc = result.inpainted_image!.startsWith("data:")
          ? result.inpainted_image!
          : `data:image/png;base64,${result.inpainted_image}`;
        const inpaintedImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new window.Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Failed to decode inpainted image"));
          el.src = inpaintedSrc;
        });
        fullCtx.drawImage(inpaintedImg, rect.x, rect.y, rect.width, rect.height);

        const compositeBlob = await new Promise<Blob>((resolve, reject) => {
          fullCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("composite toBlob failed"))), "image/png");
        });
        newImageUrl = URL.createObjectURL(compositeBlob);
      }

      // Update image: append blocks and update image URL
      setImages((prev) =>
        prev.map((im) => {
          if (im.id !== imageId) return im;
          return {
            ...im,
            editableBlocks: [...im.editableBlocks, ...newBlocks],
            originalImageUrl: newImageUrl || im.originalImageUrl,
            originalFile: newImageUrl ? null : im.originalFile,
            isDirty: true,
          };
        })
      );

      // Push undo action
      pushAction({
        type: "manual-translate-apply",
        imageId,
        addedBlocks: newBlocks,
        previousImageUrl,
        newImageUrl: newImageUrl || previousImageUrl,
      });

      // Clear rect and switch to select tool
      clearManualTranslateRect(imageId);
      setActiveToolRaw("select");
    } catch (err) {
      console.error("Manual translate failed:", err);
      Sentry.captureException(err);
      setManualTranslateError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setIsManualTranslating(false);
    }
  }, [manualTranslateRect, images, pushAction, clearManualTranslateRect]);

  const applyMagicRemover = useCallback(async (imageId: string) => {
    const lines = magicRemoverLines.get(imageId);
    if (!lines || lines.length === 0) return;

    const img = images.find((im) => im.id === imageId);
    if (!img) return;

    // Load the background image to get its dimensions
    const bgSrc = img.originalFile
      ? URL.createObjectURL(img.originalFile)
      : img.originalImageUrl;
    if (!bgSrc) return;

    setIsInpainting(true);
    try {
      // Load image to get natural dimensions
      const bgImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = bgSrc;
      });

      // Render mask: black background, white strokes
      const offscreen = document.createElement("canvas");
      offscreen.width = bgImg.naturalWidth;
      offscreen.height = bgImg.naturalHeight;
      const ctx2d = offscreen.getContext("2d")!;
      ctx2d.fillStyle = "#000000";
      ctx2d.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx2d.strokeStyle = "#ffffff";
      ctx2d.lineCap = "round";
      ctx2d.lineJoin = "round";
      for (const line of lines) {
        ctx2d.lineWidth = line.size;
        ctx2d.beginPath();
        for (let j = 0; j < line.points.length; j += 2) {
          const px = line.points[j], py = line.points[j + 1];
          if (j === 0) ctx2d.moveTo(px, py);
          else ctx2d.lineTo(px, py);
        }
        ctx2d.stroke();
      }

      const maskBlob = await new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((b) => (b ? resolve(b) : reject(new Error("mask toBlob failed"))), "image/png");
      });

      // Fetch original image as blob
      const imageResp = await fetch(bgSrc);
      const imageBlob = await imageResp.blob();

      // Clean up object URL if we created one
      if (img.originalFile) URL.revokeObjectURL(bgSrc);

      const fd = new FormData();
      fd.append("image", imageBlob, "image.png");
      fd.append("mask", maskBlob, "mask.png");
      fd.append("inpainting_size", "2048");

      const resp = await apiFetch("/api/inpaint", {
        method: "POST",
        body: fd,
      });

      if (!resp.ok) {
        let detail = `${resp.status}`;
        try { const j = await resp.json(); detail = j.detail || detail; } catch {}
        throw new Error(`Inpaint failed: ${detail}`);
      }

      const resultBlob = await resp.blob();
      const resultUrl = URL.createObjectURL(resultBlob);

      // Capture previous URL for undo
      const previousImageUrl = img.originalFile ? "" : (img.originalImageUrl || "");

      // Push old URL to legacy history (max 5)
      setImageHistory((prev) => {
        const next = new Map(prev);
        const stack = [...(next.get(imageId) || [])];
        if (previousImageUrl) stack.push(previousImageUrl);
        if (stack.length > 5) stack.shift();
        next.set(imageId, stack);
        return next;
      });

      // Push to unified history
      if (previousImageUrl) {
        pushAction({
          type: "magic-remover-apply",
          imageId,
          previousImageUrl,
          newImageUrl: resultUrl,
        });
      }

      // Update image: set new originalImageUrl, clear originalFile
      setImages((prev) =>
        prev.map((im) =>
          im.id === imageId
            ? { ...im, originalImageUrl: resultUrl, originalFile: null }
            : im
        )
      );

      // Clear magic remover lines (without pushing to history since it's part of apply)
      setMagicRemoverLines((prev) => {
        const next = new Map(prev);
        next.set(imageId, []);
        return next;
      });
    } catch (err) {
      console.error("Magic remover failed:", err);
      Sentry.captureException(err);
      alert(err instanceof Error ? err.message : "Inpainting failed");
    } finally {
      setIsInpainting(false);
    }
  }, [magicRemoverLines, images, pushAction]);

  const undoMagicRemover = useCallback((imageId: string) => {
    const stack = imageHistory.get(imageId);
    if (!stack || stack.length === 0) return;

    const prevUrl = stack[stack.length - 1];
    setImageHistory((prev) => {
      const next = new Map(prev);
      next.set(imageId, stack.slice(0, -1));
      return next;
    });

    setImages((prev) =>
      prev.map((im) =>
        im.id === imageId
          ? { ...im, originalImageUrl: prevUrl, originalFile: null }
          : im
      )
    );
  }, [imageHistory]);

  // --- Unified undo/redo ---

  const applyActionInverse = useCallback((action: EditorAction) => {
    switch (action.type) {
      case "block-update":
        updateBlockInternal(action.imageId, action.blockId, action.before);
        break;
      case "drawing-line-add":
        setDrawingLines((prev) => {
          const lines = prev.get(action.imageId);
          if (!lines || lines.length === 0) return prev;
          const next = new Map(prev);
          next.set(action.imageId, lines.slice(0, -1));
          return next;
        });
        break;
      case "drawing-clear":
        setDrawingLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, [...(next.get(action.imageId) || []), ...action.lines]);
          return next;
        });
        break;
      case "magic-line-add":
        setMagicRemoverLines((prev) => {
          const lines = prev.get(action.imageId);
          if (!lines || lines.length === 0) return prev;
          const next = new Map(prev);
          next.set(action.imageId, lines.slice(0, -1));
          return next;
        });
        break;
      case "magic-clear":
        setMagicRemoverLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, [...(next.get(action.imageId) || []), ...action.lines]);
          return next;
        });
        break;
      case "magic-remover-apply":
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? { ...im, originalImageUrl: action.previousImageUrl, originalFile: null }
              : im
          )
        );
        // Also update legacy history
        setImageHistory((prev) => {
          const next = new Map(prev);
          const stack = next.get(action.imageId) || [];
          next.set(action.imageId, stack.slice(0, -1));
          return next;
        });
        break;
      case "manual-translate-apply": {
        const blockIds = new Set(action.addedBlocks.map((b) => b.id));
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? {
                  ...im,
                  editableBlocks: im.editableBlocks.filter((b) => !blockIds.has(b.id)),
                  originalImageUrl: action.previousImageUrl,
                  originalFile: null,
                }
              : im
          )
        );
        break;
      }
      case "clone-stamp-apply":
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? { ...im, originalImageUrl: action.previousImageUrl, originalFile: null }
              : im
          )
        );
        break;
    }
  }, [updateBlockInternal]);

  const applyActionForward = useCallback((action: EditorAction) => {
    switch (action.type) {
      case "block-update":
        updateBlockInternal(action.imageId, action.blockId, action.after);
        break;
      case "drawing-line-add":
        setDrawingLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, [...(next.get(action.imageId) || []), action.line]);
          return next;
        });
        break;
      case "drawing-clear":
        setDrawingLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, []);
          return next;
        });
        break;
      case "magic-line-add":
        setMagicRemoverLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, [...(next.get(action.imageId) || []), action.line]);
          return next;
        });
        break;
      case "magic-clear":
        setMagicRemoverLines((prev) => {
          const next = new Map(prev);
          next.set(action.imageId, []);
          return next;
        });
        break;
      case "magic-remover-apply":
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? { ...im, originalImageUrl: action.newImageUrl, originalFile: null }
              : im
          )
        );
        // Also update legacy history
        setImageHistory((prev) => {
          const next = new Map(prev);
          const stack = [...(next.get(action.imageId) || [])];
          if (action.previousImageUrl) stack.push(action.previousImageUrl);
          if (stack.length > 5) stack.shift();
          next.set(action.imageId, stack);
          return next;
        });
        break;
      case "manual-translate-apply":
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? {
                  ...im,
                  editableBlocks: [...im.editableBlocks, ...action.addedBlocks],
                  originalImageUrl: action.newImageUrl,
                  originalFile: null,
                }
              : im
          )
        );
        break;
      case "clone-stamp-apply":
        setImages((prev) =>
          prev.map((im) =>
            im.id === action.imageId
              ? { ...im, originalImageUrl: action.newImageUrl, originalFile: null }
              : im
          )
        );
        break;
    }
  }, [updateBlockInternal]);

  const undo = useCallback(() => {
    // Flush any in-flight coalesced edits before undoing
    flushPendingAction();

    const img = currentImage;
    if (!img) return;
    // Re-read history after flush (flush may have pushed a new action)
    const history = historyMap.get(img.id) || createEmptyHistory();
    if (history.undoStack.length === 0) return;

    const action = history.undoStack[history.undoStack.length - 1];
    setHistoryMap((prev) => {
      const next = new Map(prev);
      const h = next.get(img.id) || createEmptyHistory();
      next.set(img.id, {
        undoStack: h.undoStack.slice(0, -1),
        redoStack: [...h.redoStack, action],
      });
      return next;
    });
    applyActionInverse(action);
  }, [currentImage, historyMap, flushPendingAction, applyActionInverse]);

  const redo = useCallback(() => {
    // Flush any in-flight coalesced edits before redoing
    flushPendingAction();

    const img = currentImage;
    if (!img) return;
    const history = historyMap.get(img.id) || createEmptyHistory();
    if (history.redoStack.length === 0) return;

    const action = history.redoStack[history.redoStack.length - 1];
    setHistoryMap((prev) => {
      const next = new Map(prev);
      const h = next.get(img.id) || createEmptyHistory();
      next.set(img.id, {
        undoStack: [...h.undoStack, action],
        redoStack: h.redoStack.slice(0, -1),
      });
      return next;
    });
    applyActionForward(action);
  }, [currentImage, historyMap, flushPendingAction, applyActionForward]);

  const currentHistory = currentImage ? getHistory(currentImage.id) : createEmptyHistory();
  const canUndo = currentHistory.undoStack.length > 0 || pendingActionRef.current !== null;
  const canRedo = currentHistory.redoStack.length > 0;

  return (
    <EditorContext.Provider
      value={{
        images,
        setImages,
        currentImageIndex,
        setCurrentImageIndex,
        currentImage,
        selectedBlockId,
        setSelectedBlockId,
        updateBlock,
        activeTool,
        setActiveTool,
        drawingLines,
        addDrawingLine,
        undoDrawingLine,
        clearDrawingLines,
        penColor,
        setPenColor,
        penSize,
        setPenSize,
        magicRemoverLines,
        addMagicRemoverLine,
        undoMagicRemoverLine,
        clearMagicRemoverLines,
        magicRemoverSize,
        setMagicRemoverSize,
        isInpainting,
        imageHistory,
        applyMagicRemover,
        undoMagicRemover,
        manualTranslateRect,
        setManualTranslateRect,
        clearManualTranslateRect,
        isManualTranslating,
        applyManualTranslate,
        manualTranslateError,
        cloneStampSize,
        setCloneStampSize,
        cloneStampOpacity,
        setCloneStampOpacity,
        cloneStampSource: cloneStampSourceMap,
        setCloneStampSource,
        clearCloneStampSource,
        cloneStampStrokes,
        addCloneStampStroke,
        undoCloneStampStroke,
        clearCloneStampStrokes,
        isCloneStamping,
        applyCloneStamp,
        watermarkSettings,
        setWatermarkSettings,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}
