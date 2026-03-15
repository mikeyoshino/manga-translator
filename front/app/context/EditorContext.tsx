import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { EditorImage, EditableBlock } from "@/types";
import { useAuth } from "@/context/AuthContext";

export interface DrawingLine {
  points: number[];
  color: string;
  size: number;
  tool: "pen" | "eraser";
}

export type ActiveTool = "select" | "pen" | "eraser" | "magicRemover";

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
  const { session } = useAuth();
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const currentImage = images[currentImageIndex] ?? null;

  const setActiveTool = useCallback((tool: ActiveTool) => {
    setActiveToolRaw(tool);
    if (tool !== "select") {
      setSelectedBlockId(null);
    }
  }, []);

  const addDrawingLine = useCallback((imageId: string, line: DrawingLine) => {
    setDrawingLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, [...(next.get(imageId) || []), line]);
      return next;
    });
  }, []);

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
    setDrawingLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, []);
      return next;
    });
  }, []);

  const addMagicRemoverLine = useCallback((imageId: string, line: DrawingLine) => {
    setMagicRemoverLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, [...(next.get(imageId) || []), line]);
      return next;
    });
  }, []);

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
    setMagicRemoverLines((prev) => {
      const next = new Map(prev);
      next.set(imageId, []);
      return next;
    });
  }, []);

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

      const resp = await fetch("/api/inpaint", {
        method: "POST",
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: fd,
      });

      if (!resp.ok) throw new Error(`Inpaint failed: ${resp.status}`);

      const resultBlob = await resp.blob();
      const resultUrl = URL.createObjectURL(resultBlob);

      // Push old URL to history (max 5)
      setImageHistory((prev) => {
        const next = new Map(prev);
        const stack = [...(next.get(imageId) || [])];
        const oldUrl = img.originalFile
          ? "" // can't restore File, but URL was transient
          : img.originalImageUrl || "";
        if (oldUrl) stack.push(oldUrl);
        if (stack.length > 5) stack.shift();
        next.set(imageId, stack);
        return next;
      });

      // Update image: set new originalImageUrl, clear originalFile
      setImages((prev) =>
        prev.map((im) =>
          im.id === imageId
            ? { ...im, originalImageUrl: resultUrl, originalFile: null }
            : im
        )
      );

      // Clear magic remover lines
      clearMagicRemoverLines(imageId);
    } finally {
      setIsInpainting(false);
    }
  }, [magicRemoverLines, images, session?.access_token, clearMagicRemoverLines]);

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

  const updateBlock = useCallback(
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
          if (updated.projectImageId && session?.access_token) {
            clearTimeout(saveTimerRef.current[imageId]);
            saveTimerRef.current[imageId] = setTimeout(() => {
              fetch(`/api/projects/_/images/${updated.projectImageId}/blocks`, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session.access_token}`,
                },
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
    [session?.access_token]
  );

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
