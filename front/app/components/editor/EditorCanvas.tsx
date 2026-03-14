import { useRef, useEffect, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage } from "react-konva";
import { useEditor } from "@/context/EditorContext";
import { BlockOverlay } from "./BlockOverlay";

interface InlineEdit {
  blockId: string;
  imageId: string;
  text: string;
  // Screen position & size for the textarea overlay
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
  } = useEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);

  // Load original image as base (text outside blocks stays visible)
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

  // Zoom with wheel — use native listener to avoid passive event issue
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
      if (e.target === e.target.getStage() || e.target.getClassName() === "Image") {
        setSelectedBlockId(null);
        if (inlineEdit) commitInlineEdit();
      }
    },
    [setSelectedBlockId, inlineEdit, commitInlineEdit]
  );

  // Double-click a block to start inline editing
  const handleBlockDblClick = useCallback(
    (blockId: string) => {
      if (!currentImage || !containerRef.current) return;
      const block = currentImage.editableBlocks.find((b) => b.id === blockId);
      if (!block) return;

      // Calculate screen position of the block
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

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-950 overflow-hidden konva-stage relative"
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onClick={handleStageClick}
        onTap={handleStageClick}
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
                setSelectedBlockId(block.id);
              }}
              onDblClick={() => handleBlockDblClick(block.id)}
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
