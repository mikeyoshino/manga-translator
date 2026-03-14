import { useEditor } from "@/context/EditorContext";
import { useNavigate } from "react-router";
import { exportSingleImage, exportAllAsZip } from "@/utils/exportZip";
import { useCallback } from "react";

export function EditorToolbar() {
  const { images, currentImageIndex, setCurrentImageIndex, currentImage, setSelectedBlockId } =
    useEditor();
  const navigate = useNavigate();

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
      exportSingleImage(stageEl, currentImage.originalFile.name);
    }
  }, [currentImage]);

  const handleExportAll = useCallback(() => {
    const getter = (_imageId: string) =>
      document.querySelector(".konva-stage canvas") as HTMLCanvasElement | null;
    exportAllAsZip(getter, images);
  }, [images]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <button
        onClick={handleBack}
        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
      >
        &larr; Back
      </button>

      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={handlePrev}
          disabled={currentImageIndex === 0}
          className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 transition-colors"
        >
          &lt;
        </button>
        <span className="text-sm text-gray-300">
          Image {currentImageIndex + 1} / {images.length}
        </span>
        <button
          onClick={handleNext}
          disabled={currentImageIndex === images.length - 1}
          className="px-2 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 transition-colors"
        >
          &gt;
        </button>
      </div>

      {currentImage && (
        <span className="text-xs text-gray-400 ml-2 truncate max-w-48">
          {currentImage.originalFile.name}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleExportCurrent}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors"
        >
          Export Image
        </button>
        <button
          onClick={handleExportAll}
          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 rounded transition-colors"
        >
          Export All (ZIP)
        </button>
      </div>
    </div>
  );
}
