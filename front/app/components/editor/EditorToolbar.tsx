import { useEditor } from "@/context/EditorContext";
import { useNavigate } from "react-router";
import { exportSingleImage, exportAllAsZip } from "@/utils/exportZip";
import { useCallback } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FolderArchive } from "lucide-react";
import { getEditorLocale, editorT } from "@/utils/editorI18n";

export function EditorToolbar() {
  const { images, currentImageIndex, setCurrentImageIndex, currentImage, setSelectedBlockId } =
    useEditor();
  const navigate = useNavigate();
  const locale = getEditorLocale();
  const i = editorT[locale];

  const handleBack = () => navigate("/");

  const handlePrev = () => {
    setSelectedBlockId(null);
    setCurrentImageIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    setSelectedBlockId(null);
    setCurrentImageIndex((i) => Math.min(images.length - 1, i + 1));
  };

  const handleExportCurrent = useCallback(() => {
    const stageEl = document.querySelector(".konva-stage canvas") as HTMLCanvasElement | null;
    if (stageEl && currentImage) {
      exportSingleImage(stageEl, currentImage.originalFilename);
    }
  }, [currentImage]);

  const handleExportAll = useCallback(() => {
    const getter = (_imageId: string) =>
      document.querySelector(".konva-stage canvas") as HTMLCanvasElement | null;
    exportAllAsZip(getter, images);
  }, [images]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 shrink-0">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {i.back}
      </button>

      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={handlePrev}
          disabled={currentImageIndex === 0}
          className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600" />
        </button>
        <span className="text-sm font-medium text-slate-600">
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
        <span className="text-xs text-slate-400 ml-2 truncate max-w-48">
          {currentImage.originalFilename}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleExportCurrent}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
        >
          <Download className="w-3.5 h-3.5" /> {i.exportImage}
        </button>
        <button
          onClick={handleExportAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg transition-colors"
        >
          <FolderArchive className="w-3.5 h-3.5" /> {i.exportAll}
        </button>
      </div>
    </div>
  );
}
