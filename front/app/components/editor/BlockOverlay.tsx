import { useCallback, useRef, useEffect, useState } from "react";
import { Rect, Image as KonvaImage, Transformer } from "react-konva";
import type { EditableBlock } from "@/types";
import type Konva from "konva";
import { renderTextToCanvas, releaseCanvas } from "@/utils/renderTextToCanvas";
import { loadFont, isFontLoaded } from "@/utils/fontLoader";

interface BlockOverlayProps {
  block: EditableBlock;
  isSelected: boolean;
  isEditing?: boolean;
  interactive?: boolean;
  onSelect: () => void;
  onDblClick: () => void;
  onDragEnd: (x: number, y: number) => void;
  onTransformEnd: (width: number, height: number) => void;
}

export function BlockOverlay({
  block,
  isSelected,
  isEditing,
  interactive = true,
  onSelect,
  onDblClick,
  onDragEnd,
  onTransformEnd,
}: BlockOverlayProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mountedRef = useRef(true);
  const [textCanvas, setTextCanvas] = useState<HTMLCanvasElement | null>(null);
  const [fontReady, setFontReady] = useState(isFontLoaded(block.editedFontFamily));
  const [bgCropImage, setBgCropImage] = useState<HTMLImageElement | null>(null);

  // Track mount state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (canvasRef.current) {
        releaseCanvas(canvasRef.current);
        canvasRef.current = null;
      }
    };
  }, []);

  // Load the per-block inpainted background crop
  useEffect(() => {
    if (!block.background) {
      setBgCropImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setBgCropImage(img);
    };
    img.src = block.background;
    return () => {
      cancelled = true;
      img.onload = null;
      img.src = "";
    };
  }, [block.background]);

  // Load font directly via FontFace API
  useEffect(() => {
    const family = block.editedFontFamily;
    if (isFontLoaded(family)) {
      setFontReady(true);
      return;
    }
    let cancelled = false;
    setFontReady(false);
    loadFont(family).then(() => {
      if (!cancelled && mountedRef.current) setFontReady(true);
    });
    return () => { cancelled = true; };
  }, [block.editedFontFamily]);

  // Attach transformer to the Rect when selected
  useEffect(() => {
    if (isSelected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  // Render text to offscreen canvas
  useEffect(() => {
    if (!fontReady) return;
    if (block.hidden || block.editedWidth <= 0 || block.editedHeight <= 0) {
      setTextCanvas(null);
      return;
    }

    const fontStyle =
      [block.editedBold ? "bold" : "", block.editedItalic ? "italic" : ""]
        .filter(Boolean)
        .join(" ") || "normal";

    const newCanvas = renderTextToCanvas({
      text: block.editedText,
      width: block.editedWidth,
      height: block.editedHeight,
      fontSize: block.editedFontSize,
      fontFamily: block.editedFontFamily,
      fontStyle,
      color: block.editedColor,
      align: block.editedAlignment,
      letterSpacing: block.editedLetterSpacing,
      lineHeight: block.editedLineSpacing,
      strokeEnabled: block.editedStrokeEnabled,
      strokeColor: block.editedStrokeColor,
      strokeWidth: block.editedStrokeWidth,
    });

    const oldCanvas = canvasRef.current;
    canvasRef.current = newCanvas;
    setTextCanvas(newCanvas);

    if (oldCanvas) {
      queueMicrotask(() => releaseCanvas(oldCanvas));
    }
  }, [
    fontReady,
    block.hidden,
    block.editedText,
    block.editedWidth,
    block.editedHeight,
    block.editedFontSize,
    block.editedFontFamily,
    block.editedBold,
    block.editedItalic,
    block.editedColor,
    block.editedAlignment,
    block.editedLetterSpacing,
    block.editedLineSpacing,
    block.editedStrokeEnabled,
    block.editedStrokeColor,
    block.editedStrokeWidth,
  ]);

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onDragEnd(e.target.x(), e.target.y());
    },
    [onDragEnd]
  );

  const handleTransformEnd = useCallback(() => {
    const node = rectRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onTransformEnd(
      Math.max(20, node.width() * scaleX),
      Math.max(20, node.height() * scaleY)
    );
  }, [onTransformEnd]);

  if (block.hidden) return null;

  return (
    <>
      {/* Per-block inpainted background crop — only erases text in this region */}
      {bgCropImage && (
        <KonvaImage
          image={bgCropImage}
          x={block.minX}
          y={block.minY}
          width={block.maxX - block.minX}
          height={block.maxY - block.minY}
          listening={false}
        />
      )}
      {/* Transparent hit rect — draggable/transformable target */}
      <Rect
        ref={rectRef}
        x={block.editedX}
        y={block.editedY}
        width={block.editedWidth}
        height={block.editedHeight}
        fill="transparent"
        draggable={interactive}
        listening={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {/* Text rendered on canvas */}
      {textCanvas && !isEditing && (
        <KonvaImage
          image={textCanvas}
          x={block.editedX}
          y={block.editedY}
          width={block.editedWidth}
          height={block.editedHeight}
          listening={false}
        />
      )}
      {isSelected && interactive && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox;
            return newBox;
          }}
          anchorSize={8}
          anchorCornerRadius={2}
          borderStroke="#3b82f6"
          anchorStroke="#3b82f6"
          anchorFill="#ffffff"
        />
      )}
    </>
  );
}
