import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect, Circle, Text as KonvaText } from "react-konva";
import { useEditor } from "@/context/EditorContext";
import { BlockOverlay } from "./BlockOverlay";
import type { DrawingLine, CloneStampStroke } from "@/context/EditorContext";
import { computeWatermarkPosition, shouldApplyWatermark } from "@/utils/drawWatermark";
import { loadFont } from "@/utils/fontLoader";

interface InlineEdit {
  blockId: string;
  imageId: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: string;
  lineSpacing: number;
  bold: boolean;
  italic: boolean;
}

export function EditorCanvas() {
  const {
    currentImage,
    selectedBlockId,
    setSelectedBlockId,
    updateBlock,
    activeTool,
    drawingLines,
    addDrawingLine,
    penColor,
    penSize,
    magicRemoverLines,
    addMagicRemoverLine,
    magicRemoverSize,
    manualTranslateRect,
    setManualTranslateRect,
    cloneStampSource,
    setCloneStampSource,
    cloneStampStrokes,
    addCloneStampStroke,
    cloneStampSize,
    cloneStampOpacity,
    watermarkSettings,
  } = useEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const [currentLine, setCurrentLine] = useState<DrawingLine | null>(null);

  // Rectangle drawing state (manual translate)
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectCurrent, setRectCurrent] = useState<{ x: number; y: number } | null>(null);

  // Clone stamp state
  const [currentCloneStroke, setCurrentCloneStroke] = useState<CloneStampStroke | null>(null);
  const [cloneStampPreview, setCloneStampPreview] = useState<HTMLImageElement | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Watermark image preview
  const [watermarkImg, setWatermarkImg] = useState<HTMLImageElement | null>(null);

  const isDrawingTool = activeTool === "pen" || activeTool === "eraser" || activeTool === "magicRemover";
  const isRectTool = activeTool === "manualTranslate";
  const isCloneStampTool = activeTool === "cloneStamp";

  // Load original image as base
  useEffect(() => {
    const src = currentImage?.originalFile
      ? URL.createObjectURL(currentImage.originalFile)
      : currentImage?.originalImageUrl;
    if (!src) {
      setBgImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) setBgImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
      img.src = "";
      if (currentImage?.originalFile) URL.revokeObjectURL(src);
    };
  }, [currentImage?.originalFile, currentImage?.originalImageUrl]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Fit image on load
  useEffect(() => {
    if (!bgImage) return;
    const scaleX = dimensions.width / bgImage.width;
    const scaleY = dimensions.height / bgImage.height;
    const fitScale = Math.min(scaleX, scaleY, 1);
    setScale(fitScale);
    setPosition({
      x: (dimensions.width - bgImage.width * fitScale) / 2,
      y: (dimensions.height - bgImage.height * fitScale) / 2,
    });
  }, [bgImage, dimensions]);

  // Close inline edit when selecting different block
  useEffect(() => {
    if (inlineEdit && inlineEdit.blockId !== selectedBlockId) {
      commitInlineEdit();
    }
  }, [selectedBlockId]);

  // Zoom with wheel
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const scaleBy = 1.1;
      setScale((prev) => {
        const newScale = e.deltaY < 0 ? prev * scaleBy : prev / scaleBy;
        return Math.max(0.1, Math.min(5, newScale));
      });
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, []);

  // Load watermark image when dataUrl changes
  useEffect(() => {
    if (watermarkSettings.type !== "image" || !watermarkSettings.imageDataUrl) {
      setWatermarkImg(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setWatermarkImg(img);
    img.src = watermarkSettings.imageDataUrl;
  }, [watermarkSettings.type, watermarkSettings.imageDataUrl]);

  // Preload watermark font
  useEffect(() => {
    if (watermarkSettings.type === "text" && watermarkSettings.enabled) {
      loadFont(watermarkSettings.fontFamily);
    }
  }, [watermarkSettings.type, watermarkSettings.enabled, watermarkSettings.fontFamily]);

  // Compute watermark preview position
  const showWatermarkPreview = currentImage && shouldApplyWatermark(watermarkSettings, currentImage.id) && bgImage;
  const watermarkPos = useMemo(() => {
    if (!showWatermarkPreview || !bgImage) return { x: 0, y: 0 };
    if (watermarkSettings.type === "text") {
      // Approximate text width — Konva Text will handle actual rendering
      const approxW = watermarkSettings.text.length * watermarkSettings.fontSize * 0.6;
      return computeWatermarkPosition(
        bgImage.naturalWidth, bgImage.naturalHeight,
        approxW, watermarkSettings.fontSize,
        watermarkSettings.position, watermarkSettings.offsetX, watermarkSettings.offsetY,
      );
    }
    return computeWatermarkPosition(
      bgImage.naturalWidth, bgImage.naturalHeight,
      watermarkSettings.imageWidth, watermarkSettings.imageHeight,
      watermarkSettings.position, watermarkSettings.offsetX, watermarkSettings.offsetY,
    );
  }, [showWatermarkPreview, bgImage, watermarkSettings]);

  const commitInlineEdit = useCallback(() => {
    setInlineEdit((prev) => {
      if (prev && currentImage) {
        updateBlock(prev.imageId, prev.blockId, { editedText: prev.text });
      }
      return null;
    });
  }, [currentImage, updateBlock]);

  const handleStageClick = useCallback(
    (e: any) => {
      if (isDrawingTool || isCloneStampTool) return;
      if (e.target === e.target.getStage() || e.target.getClassName() === "Image") {
        setSelectedBlockId(null);
        if (inlineEdit) commitInlineEdit();
      }
    },
    [setSelectedBlockId, inlineEdit, commitInlineEdit, isDrawingTool, isCloneStampTool]
  );

  // Convert screen coords to image coords
  const getImageCoords = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - position.x) / scale,
      y: (pos.y - position.y) / scale,
    };
  }, [position, scale]);

  // Drawing handlers
  const handleDrawStart = useCallback(() => {
    if (!isDrawingTool || !currentImage) return;
    const coords = getImageCoords();
    if (!coords) return;
    isDrawingRef.current = true;
    if (activeTool === "magicRemover") {
      setCurrentLine({
        points: [coords.x, coords.y],
        color: "#ff3388",
        size: magicRemoverSize,
        tool: "pen",
      });
    } else {
      setCurrentLine({
        points: [coords.x, coords.y],
        color: penColor,
        size: penSize,
        tool: activeTool as "pen" | "eraser",
      });
    }
  }, [isDrawingTool, currentImage, getImageCoords, penColor, penSize, magicRemoverSize, activeTool]);

  const handleDrawMove = useCallback(() => {
    if (!isDrawingRef.current || !currentLine) return;
    const coords = getImageCoords();
    if (!coords) return;
    setCurrentLine((prev) =>
      prev ? { ...prev, points: [...prev.points, coords.x, coords.y] } : null
    );
  }, [currentLine, getImageCoords]);

  const handleDrawEnd = useCallback(() => {
    if (!isDrawingRef.current || !currentLine || !currentImage) return;
    isDrawingRef.current = false;
    if (currentLine.points.length >= 2) {
      if (activeTool === "magicRemover") {
        addMagicRemoverLine(currentImage.id, currentLine);
      } else {
        addDrawingLine(currentImage.id, currentLine);
      }
    }
    setCurrentLine(null);
  }, [currentLine, currentImage, addDrawingLine, addMagicRemoverLine, activeTool]);

  // Rectangle drawing handlers (manual translate)
  const handleRectStart = useCallback(() => {
    if (!isRectTool || !currentImage) return;
    const coords = getImageCoords();
    if (!coords) return;
    setRectStart(coords);
    setRectCurrent(coords);
  }, [isRectTool, currentImage, getImageCoords]);

  const handleRectMove = useCallback(() => {
    if (!rectStart) return;
    const coords = getImageCoords();
    if (!coords) return;
    setRectCurrent(coords);
  }, [rectStart, getImageCoords]);

  const handleRectEnd = useCallback(() => {
    if (!rectStart || !rectCurrent || !currentImage) {
      setRectStart(null);
      setRectCurrent(null);
      return;
    }
    const x = Math.min(rectStart.x, rectCurrent.x);
    const y = Math.min(rectStart.y, rectCurrent.y);
    const width = Math.abs(rectCurrent.x - rectStart.x);
    const height = Math.abs(rectCurrent.y - rectStart.y);

    // Minimum 10x10 to avoid accidental clicks
    if (width >= 10 && height >= 10) {
      setManualTranslateRect(currentImage.id, { x, y, width, height });
    }
    setRectStart(null);
    setRectCurrent(null);
  }, [rectStart, rectCurrent, currentImage, setManualTranslateRect]);

  // Clone stamp handlers
  const renderCloneStampPreview = useCallback((strokes: CloneStampStroke[], currentStroke: CloneStampStroke | null) => {
    if (!bgImage) return;
    if (!previewCanvasRef.current) {
      previewCanvasRef.current = document.createElement("canvas");
    }
    const canvas = previewCanvasRef.current;
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      const offsetX = stroke.sourceX - stroke.points[0];
      const offsetY = stroke.sourceY - stroke.points[1];
      const r = stroke.size / 2;

      for (let j = 0; j < stroke.points.length; j += 2) {
        const destX = stroke.points[j];
        const destY = stroke.points[j + 1];
        const srcX = destX + offsetX;
        const srcY = destY + offsetY;

        const sx = Math.max(0, Math.min(bgImage.naturalWidth, srcX - r));
        const sy = Math.max(0, Math.min(bgImage.naturalHeight, srcY - r));
        const sw = Math.min(bgImage.naturalWidth - sx, r * 2);
        const sh = Math.min(bgImage.naturalHeight - sy, r * 2);
        if (sw <= 0 || sh <= 0) continue;

        ctx.save();
        ctx.globalAlpha = stroke.opacity;
        ctx.beginPath();
        ctx.arc(destX, destY, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(bgImage, sx, sy, sw, sh, sx - offsetX, sy - offsetY, sw, sh);
        ctx.restore();
      }
    }

    const previewImg = new window.Image();
    previewImg.onload = () => setCloneStampPreview(previewImg);
    previewImg.src = canvas.toDataURL();
  }, [bgImage]);

  const handleCloneStampDown = useCallback((e: any) => {
    if (!isCloneStampTool || !currentImage) return;
    const coords = getImageCoords();
    if (!coords) return;

    if (e.evt?.altKey) {
      setCloneStampSource(currentImage.id, { x: coords.x, y: coords.y });
      return;
    }

    const source = cloneStampSource.get(currentImage.id);
    if (!source) return;

    const stroke: CloneStampStroke = {
      sourceX: source.x,
      sourceY: source.y,
      points: [coords.x, coords.y],
      size: cloneStampSize,
      opacity: cloneStampOpacity,
    };
    setCurrentCloneStroke(stroke);
    isDrawingRef.current = true;
  }, [isCloneStampTool, currentImage, getImageCoords, cloneStampSource, setCloneStampSource, cloneStampSize, cloneStampOpacity]);

  const handleCloneStampMove = useCallback(() => {
    const coords = getImageCoords();
    if (coords) setCursorPos(coords);

    if (!isDrawingRef.current || !currentCloneStroke) return;
    if (!coords) return;

    setCurrentCloneStroke((prev) => {
      if (!prev) return null;
      const updated = { ...prev, points: [...prev.points, coords.x, coords.y] };
      // Throttled preview update
      if (currentImage) {
        const strokes = cloneStampStrokes.get(currentImage.id) || [];
        requestAnimationFrame(() => renderCloneStampPreview(strokes, updated));
      }
      return updated;
    });
  }, [getImageCoords, currentCloneStroke, currentImage, cloneStampStrokes, renderCloneStampPreview]);

  const handleCloneStampEnd = useCallback(() => {
    if (!isDrawingRef.current || !currentCloneStroke || !currentImage) return;
    isDrawingRef.current = false;
    if (currentCloneStroke.points.length >= 2) {
      addCloneStampStroke(currentImage.id, currentCloneStroke);
      const strokes = [...(cloneStampStrokes.get(currentImage.id) || []), currentCloneStroke];
      renderCloneStampPreview(strokes, null);
    }
    setCurrentCloneStroke(null);
  }, [currentCloneStroke, currentImage, addCloneStampStroke, cloneStampStrokes, renderCloneStampPreview]);

  // Clear preview when strokes are cleared
  useEffect(() => {
    if (!currentImage) return;
    const strokes = cloneStampStrokes.get(currentImage.id) || [];
    if (strokes.length === 0 && !currentCloneStroke) {
      setCloneStampPreview(null);
    } else {
      renderCloneStampPreview(strokes, currentCloneStroke);
    }
  }, [currentImage?.id, cloneStampStrokes, currentCloneStroke, renderCloneStampPreview]);

  // Combined mouse handlers
  const handleMouseDown = useCallback((e: any) => {
    if (isCloneStampTool) handleCloneStampDown(e);
    else if (isRectTool) handleRectStart();
    else handleDrawStart();
  }, [isCloneStampTool, isRectTool, handleCloneStampDown, handleRectStart, handleDrawStart]);

  const handleMouseMove = useCallback(() => {
    if (isCloneStampTool) handleCloneStampMove();
    else if (isRectTool) handleRectMove();
    else handleDrawMove();
  }, [isCloneStampTool, isRectTool, handleCloneStampMove, handleRectMove, handleDrawMove]);

  const handleMouseUp = useCallback(() => {
    if (isCloneStampTool) handleCloneStampEnd();
    else if (isRectTool) handleRectEnd();
    else handleDrawEnd();
  }, [isCloneStampTool, isRectTool, handleCloneStampEnd, handleRectEnd, handleDrawEnd]);

  // Double-click a block to start inline editing
  const handleBlockDblClick = useCallback(
    (blockId: string) => {
      if (!currentImage || !containerRef.current) return;
      const block = currentImage.editableBlocks.find((b) => b.id === blockId);
      if (!block) return;

      const screenX = block.editedX * scale + position.x;
      const screenY = block.editedY * scale + position.y;
      const screenW = block.editedWidth * scale;
      const screenH = block.editedHeight * scale;

      setInlineEdit({
        blockId: block.id,
        imageId: currentImage.id,
        text: block.editedText,
        left: screenX,
        top: screenY,
        width: screenW,
        height: screenH,
        fontSize: block.editedFontSize * scale,
        fontFamily: block.editedFontFamily,
        color: block.editedColor,
        align: block.editedAlignment,
        lineSpacing: block.editedLineSpacing,
        bold: block.editedBold,
        italic: block.editedItalic,
      });
    },
    [currentImage, scale, position]
  );

  if (!currentImage) return null;

  const existingLines = drawingLines.get(currentImage.id) || [];
  const existingMagicLines = magicRemoverLines.get(currentImage.id) || [];

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-950 overflow-hidden konva-stage relative"
      style={{ cursor: (isDrawingTool || isRectTool || isCloneStampTool) ? "crosshair" : undefined }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={!isDrawingTool && !isRectTool && !isCloneStampTool}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={(e) => handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => handleMouseDown(e)}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        className="konva-stage"
      >
        {/* Background + drawing layer (pen strokes behind text) */}
        <Layer>
          {bgImage && <KonvaImage image={bgImage} />}
          {existingLines.map((line, idx) => (
            <Line
              key={`draw-${idx}`}
              points={line.points}
              stroke={line.tool === "eraser" ? "#000000" : line.color}
              strokeWidth={line.size}
              lineCap="round"
              lineJoin="round"
              tension={0.5}
              globalCompositeOperation={
                line.tool === "eraser" ? "destination-out" : "source-over"
              }
            />
          ))}
          {currentLine && activeTool !== "magicRemover" && (
            <Line
              points={currentLine.points}
              stroke={currentLine.tool === "eraser" ? "#000000" : currentLine.color}
              strokeWidth={currentLine.size}
              lineCap="round"
              lineJoin="round"
              tension={0.5}
              globalCompositeOperation={
                currentLine.tool === "eraser" ? "destination-out" : "source-over"
              }
            />
          )}
        </Layer>

        {/* Text blocks layer — on top of pen strokes */}
        <Layer>
          {currentImage.editableBlocks.map((block) => (
            <BlockOverlay
              key={block.id}
              block={block}
              interactive={!isDrawingTool && !isRectTool && !isCloneStampTool}
              isSelected={block.id === selectedBlockId}
              isEditing={inlineEdit?.blockId === block.id}
              onSelect={() => {
                if (!isDrawingTool) setSelectedBlockId(block.id);
              }}
              onDblClick={() => !isDrawingTool && handleBlockDblClick(block.id)}
              onDragEnd={(x, y) =>
                updateBlock(currentImage.id, block.id, {
                  editedX: Math.round(x),
                  editedY: Math.round(y),
                })
              }
              onTransformEnd={(x, y, width, height) =>
                updateBlock(currentImage.id, block.id, {
                  editedX: Math.round(x),
                  editedY: Math.round(y),
                  editedWidth: Math.round(width),
                  editedHeight: Math.round(height),
                })
              }
            />
          ))}
        </Layer>


        {/* Magic remover overlay layer — semi-transparent magenta */}
        <Layer>
          {existingMagicLines.map((line, idx) => (
            <Line
              key={`magic-${idx}`}
              points={line.points}
              stroke="#ff3388"
              strokeWidth={line.size}
              lineCap="round"
              lineJoin="round"
              tension={0.5}
              opacity={0.4}
              globalCompositeOperation="source-over"
            />
          ))}
          {currentLine && activeTool === "magicRemover" && (
            <Line
              points={currentLine.points}
              stroke="#ff3388"
              strokeWidth={currentLine.size}
              lineCap="round"
              lineJoin="round"
              tension={0.5}
              opacity={0.4}
              globalCompositeOperation="source-over"
            />
          )}
        </Layer>

        {/* Clone stamp preview + visual feedback layer */}
        <Layer>
          {isCloneStampTool && cloneStampPreview && (
            <KonvaImage image={cloneStampPreview} />
          )}
          {/* Source crosshair */}
          {isCloneStampTool && currentImage && (() => {
            const source = cloneStampSource.get(currentImage.id);
            if (!source) return null;
            const crossSize = 12 / scale;
            return (
              <>
                <Line
                  points={[source.x - crossSize, source.y, source.x + crossSize, source.y]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                />
                <Line
                  points={[source.x, source.y - crossSize, source.x, source.y + crossSize]}
                  stroke="#22c55e"
                  strokeWidth={2 / scale}
                />
              </>
            );
          })()}
          {/* Brush cursor */}
          {isCloneStampTool && cursorPos && (
            <Circle
              x={cursorPos.x}
              y={cursorPos.y}
              radius={cloneStampSize / 2}
              stroke="#d97706"
              strokeWidth={1 / scale}
              dash={[4 / scale, 3 / scale]}
              listening={false}
            />
          )}
          {/* Source tracking circle while painting */}
          {isCloneStampTool && currentCloneStroke && cursorPos && (() => {
            const offsetX = currentCloneStroke.sourceX - currentCloneStroke.points[0];
            const offsetY = currentCloneStroke.sourceY - currentCloneStroke.points[1];
            return (
              <Circle
                x={cursorPos.x + offsetX}
                y={cursorPos.y + offsetY}
                radius={cloneStampSize / 2}
                stroke="#22c55e"
                strokeWidth={1 / scale}
                dash={[4 / scale, 3 / scale]}
                listening={false}
              />
            );
          })()}
        </Layer>

        {/* Manual translate rectangle overlay */}
        <Layer>
          {/* In-progress rubber-band rect */}
          {rectStart && rectCurrent && (
            <Rect
              x={Math.min(rectStart.x, rectCurrent.x)}
              y={Math.min(rectStart.y, rectCurrent.y)}
              width={Math.abs(rectCurrent.x - rectStart.x)}
              height={Math.abs(rectCurrent.y - rectStart.y)}
              stroke="#0d9488"
              strokeWidth={2 / scale}
              dash={[8 / scale, 4 / scale]}
              fill="rgba(13, 148, 136, 0.1)"
            />
          )}
          {/* Finalized rect from context */}
          {currentImage && (() => {
            const finalRect = manualTranslateRect.get(currentImage.id);
            return finalRect ? (
              <Rect
                x={finalRect.x}
                y={finalRect.y}
                width={finalRect.width}
                height={finalRect.height}
                stroke="#0d9488"
                strokeWidth={2 / scale}
                dash={[8 / scale, 4 / scale]}
                fill="rgba(13, 148, 136, 0.15)"
              />
            ) : null;
          })()}
        </Layer>

        {/* Watermark preview layer */}
        {showWatermarkPreview && (
          <Layer listening={false}>
            {watermarkSettings.type === "text" && (
              <KonvaText
                x={watermarkPos.x}
                y={watermarkPos.y}
                text={watermarkSettings.text}
                fontSize={watermarkSettings.fontSize}
                fontFamily={watermarkSettings.fontFamily}
                fill={watermarkSettings.color}
                opacity={watermarkSettings.opacity}
                stroke={watermarkSettings.borderEnabled ? watermarkSettings.borderColor : undefined}
                strokeWidth={watermarkSettings.borderEnabled ? watermarkSettings.borderWidth : 0}
              />
            )}
            {watermarkSettings.type === "image" && watermarkImg && (
              <KonvaImage
                x={watermarkPos.x}
                y={watermarkPos.y}
                image={watermarkImg}
                width={watermarkSettings.imageWidth}
                height={watermarkSettings.imageHeight}
                opacity={watermarkSettings.opacity}
              />
            )}
          </Layer>
        )}
      </Stage>

      {/* Inline text editing overlay */}
      {inlineEdit && (
        <textarea
          autoFocus
          value={inlineEdit.text}
          onChange={(e) =>
            setInlineEdit((prev) => (prev ? { ...prev, text: e.target.value } : null))
          }
          onBlur={commitInlineEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              commitInlineEdit();
            }
          }}
          style={{
            position: "absolute",
            left: inlineEdit.left,
            top: inlineEdit.top,
            width: inlineEdit.width,
            height: inlineEdit.height,
            fontSize: inlineEdit.fontSize,
            fontFamily: inlineEdit.fontFamily,
            fontWeight: inlineEdit.bold ? "bold" : "normal",
            fontStyle: inlineEdit.italic ? "italic" : "normal",
            color: inlineEdit.color,
            textAlign: inlineEdit.align as any,
            background: "rgba(0,0,0,0.15)",
            border: "2px solid #3b82f6",
            borderRadius: 4,
            boxSizing: "border-box",
            padding: 0,
            resize: "both",
            overflow: "hidden",
            zIndex: 50,
            outline: "none",
            lineHeight: inlineEdit.lineSpacing,
          }}
        />
      )}
    </div>
  );
}
