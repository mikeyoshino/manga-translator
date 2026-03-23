import { useEditor } from "@/context/EditorContext";
import { useNavigate } from "react-router";
import { exportSingleImage, exportAllAsZip } from "@/utils/exportZip";
import { useCallback } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FolderArchive, Pencil, Eraser, Undo2, Redo2, Sparkles, ScanSearch, Stamp, PanelRightOpen } from "lucide-react";
import { useT, useLocalePath } from "@/context/LocaleContext";
import { useHasFeature } from "@/context/AuthContext";

interface EditorToolbarProps {
  onTogglePanel?: () => void;
  panelOpen?: boolean;
}

export function EditorToolbar({ onTogglePanel, panelOpen }: EditorToolbarProps) {
  const {
    images, currentImageIndex, setCurrentImageIndex, currentImage,
    setSelectedBlockId, activeTool, setActiveTool,
    drawingLines, undoDrawingLine,
    magicRemoverLines, undoMagicRemoverLine,
    cloneStampStrokes, undoCloneStampStroke,
    undo, redo, canUndo, canRedo,
  } = useEditor();
  const navigate = useNavigate();
  const lp = useLocalePath();
  const i = useT().editor;
  const hasMagicRemover = useHasFeature("editor.magic_remover");
  const hasManualTranslate = useHasFeature("editor.manual_translate");
  const hasCloneStamp = useHasFeature("editor.clone_stamp");
  const hasBulkExportZip = useHasFeature("editor.bulk_export_zip");

  const handleBack = () => navigate(lp("/studio"));

  const handlePrev = () => {
    setSelectedBlockId(null);
    setCurrentImageIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setSelectedBlockId(null);
    setCurrentImageIndex((i) => Math.min(images.length - 1, i + 1));
  };

  const getCompositeCanvas = useCallback((): HTMLCanvasElement | null => {
    const stageContainer = document.querySelector(".konva-stage");
    if (!stageContainer) return null;
    const layerCanvases = stageContainer.querySelectorAll("canvas");
    if (layerCanvases.length === 0) return null;

    const first = layerCanvases[0];
    const composite = document.createElement("canvas");
    composite.width = first.width;
    composite.height = first.height;
    const ctx = composite.getContext("2d")!;
    layerCanvases.forEach((c) => ctx.drawImage(c, 0, 0));
    return composite;
  }, []);

  const handleExportCurrent = useCallback(() => {
    const canvas = getCompositeCanvas();
    if (canvas && currentImage) {
      exportSingleImage(canvas, currentImage.originalFilename);
    }
  }, [currentImage, getCompositeCanvas]);

  const handleExportAll = useCallback(() => {
    const getter = (_imageId: string) => getCompositeCanvas();
    exportAllAsZip(getter, images);
  }, [images, getCompositeCanvas]);

  const handleToolClick = (tool: "pen" | "eraser" | "magicRemover" | "manualTranslate" | "cloneStamp") => {
    setActiveTool(activeTool === tool ? "select" : tool);
  };

  const currentLines = currentImage ? (drawingLines.get(currentImage.id) || []) : [];
  const currentMagicLines = currentImage ? (magicRemoverLines.get(currentImage.id) || []) : [];
  const currentCloneStrokes = currentImage ? (cloneStampStrokes.get(currentImage.id) || []) : [];
  const isDrawing = activeTool === "pen" || activeTool === "eraser" || activeTool === "magicRemover" || activeTool === "manualTranslate" || activeTool === "cloneStamp";

  return (
    <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 bg-white border-b border-slate-200 shrink-0 overflow-x-auto">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">{i.back}</span>
      </button>

      <div className="flex items-center gap-2 ml-2 sm:ml-4 shrink-0">
        <button
          onClick={handlePrev}
          disabled={currentImageIndex === 0}
          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <span className="text-xs sm:text-sm font-medium text-slate-600 whitespace-nowrap">
          {i.image} {currentImageIndex + 1} / {images.length}
        </span>
        <button
          onClick={handleNext}
          disabled={currentImageIndex === images.length - 1}
          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {currentImage && (
        <span className="hidden md:inline text-xs text-slate-400 ml-2 truncate max-w-48">
          {currentImage.originalFilename}
        </span>
      )}

      {/* Drawing tools */}
      <div className="flex items-center gap-1 ml-2 sm:ml-4 border-l border-slate-200 pl-2 sm:pl-4">
        <button
          onClick={() => handleToolClick("pen")}
          title={i.pen}
          className={`p-1.5 rounded-lg transition-colors ${
            activeTool === "pen"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleToolClick("eraser")}
          title={i.eraser}
          className={`p-1.5 rounded-lg transition-colors ${
            activeTool === "eraser"
              ? "bg-indigo-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Eraser className="w-4 h-4" />
        </button>
        {hasMagicRemover && (
          <button
            onClick={() => handleToolClick("magicRemover")}
            title={i.magicRemover}
            className={`p-1.5 rounded-lg transition-colors ${
              activeTool === "magicRemover"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        )}
        {hasManualTranslate && (
          <button
            onClick={() => handleToolClick("manualTranslate")}
            title={i.manualTranslate}
            className={`p-1.5 rounded-lg transition-colors ${
              activeTool === "manualTranslate"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <ScanSearch className="w-4 h-4" />
          </button>
        )}
        {hasCloneStamp && (
          <button
            onClick={() => handleToolClick("cloneStamp")}
            title={i.cloneStamp}
            className={`p-1.5 rounded-lg transition-colors ${
              activeTool === "cloneStamp"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Stamp className="w-4 h-4" />
          </button>
        )}
        {isDrawing && (activeTool === "magicRemover" ? currentMagicLines.length > 0 : activeTool === "cloneStamp" ? currentCloneStrokes.length > 0 : currentLines.length > 0) && (
          <button
            onClick={() => {
              if (!currentImage) return;
              if (activeTool === "magicRemover") undoMagicRemoverLine(currentImage.id);
              else if (activeTool === "cloneStamp") undoCloneStampStroke(currentImage.id);
              else undoDrawingLine(currentImage.id);
            }}
            title={i.undo}
            className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-1 ml-2 sm:ml-4 border-l border-slate-200 pl-2 sm:pl-4">
        <button
          onClick={undo}
          disabled={!canUndo}
          title={`${i.undo} (Ctrl+Z)`}
          className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title={`${i.redo} (Ctrl+Y)`}
          className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onTogglePanel}
          className={`lg:hidden p-1.5 rounded-lg transition-colors ${panelOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          title="Toggle panel"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
        <button
          onClick={handleExportCurrent}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" /> <span className="hidden md:inline">{i.exportImage}</span>
        </button>
        {hasBulkExportZip && (
          <button
            onClick={handleExportAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <FolderArchive className="w-3.5 h-3.5" /> <span className="hidden md:inline">{i.exportAll}</span>
          </button>
        )}
      </div>
    </div>
  );
}
