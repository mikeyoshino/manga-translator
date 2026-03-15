import { useRef, useEffect, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line } from "react-konva";
import { useEditor } from "@/context/EditorContext";
import { BlockOverlay } from "./BlockOverlay";
import type { DrawingLine } from "@/context/EditorContext";

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

  const isDrawingTool = activeTool === "pen" || activeTool === "eraser" || activeTool === "magicRemover";

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
      if (isDrawingTool) return;
      if (e.target === e.target.getStage() || e.target.getClassName() === "Image") {
        setSelectedBlockId(null);
        if (inlineEdit) commitInlineEdit();
      }
    },
    [setSelectedBlockId, inlineEdit, commitInlineEdit, isDrawingTool]
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
      style={{ cursor: isDrawingTool ? "crosshair" : undefined }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={!isDrawingTool}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={handleDrawStart}
        onMouseMove={handleDrawMove}
        onMouseUp={handleDrawEnd}
        onTouchStart={handleDrawStart}
        onTouchMove={handleDrawMove}
        onTouchEnd={handleDrawEnd}
        className="konva-stage"
      >
        <Layer>
          {bgImage && <KonvaImage image={bgImage} />}
          {currentImage.editableBlocks.map((block) => (
            <BlockOverlay
              key={block.id}
              block={block}
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
              onTransformEnd={(width, height) =>
                updateBlock(currentImage.id, block.id, {
                  editedWidth: Math.round(width),
                  editedHeight: Math.round(height),
                })
              }
            />
          ))}
        </Layer>

        {/* Drawing layer — on top of blocks */}
        <Layer>
          {existingLines.map((line, idx) => (
            <Line
              key={idx}
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
            color: inlineEdit.color,
            textAlign: inlineEdit.align as any,
            background: "rgba(0,0,0,0.15)",
            border: "2px solid #3b82f6",
            borderRadius: 4,
            padding: 4,
            resize: "both",
            overflow: "auto",
            zIndex: 50,
            outline: "none",
            lineHeight: 1.2,
          }}
        />
      )}
    </div>
  );
}
