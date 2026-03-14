import { useEditor } from "@/context/EditorContext";
import { useEffect, useState } from "react";

export function EditorSidebar() {
  const { images, currentImageIndex, setCurrentImageIndex, setSelectedBlockId } = useEditor();

  return (
    <div className="w-20 bg-white border-r border-slate-200 overflow-y-auto shrink-0">
      <div className="flex flex-col gap-1 p-1">
        {images.map((img, index) => (
          <SidebarThumb
            key={img.id}
            image={img}
            index={index}
            isActive={index === currentImageIndex}
            onClick={() => {
              setSelectedBlockId(null);
              setCurrentImageIndex(index);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarThumb({
  image,
  index,
  isActive,
  onClick,
}: {
  image: { id: string; originalFile: File | null; originalImageUrl: string | null; isDirty: boolean };
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string>("");

  useEffect(() => {
    if (image.originalFile) {
      const url = URL.createObjectURL(image.originalFile);
      setThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (image.originalImageUrl) {
      setThumbUrl(image.originalImageUrl);
    }
  }, [image.originalFile, image.originalImageUrl]);

  return (
    <button
      onClick={onClick}
      className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
        isActive ? "border-indigo-500 shadow-sm" : "border-transparent hover:border-slate-300"
      }`}
    >
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt={`Image ${index + 1}`}
          className="w-full h-auto object-cover"
        />
      )}
      {image.isDirty && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
      )}
      <span className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-white text-[10px] text-center py-0.5">
        {index + 1}
      </span>
    </button>
  );
}
