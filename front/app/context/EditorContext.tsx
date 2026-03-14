import React, { createContext, useContext, useState, useCallback } from "react";
import type { EditorImage, EditableBlock } from "@/types";

interface EditorContextValue {
  images: EditorImage[];
  setImages: React.Dispatch<React.SetStateAction<EditorImage[]>>;
  currentImageIndex: number;
  setCurrentImageIndex: React.Dispatch<React.SetStateAction<number>>;
  currentImage: EditorImage | null;
  selectedBlockId: string | null;
  setSelectedBlockId: React.Dispatch<React.SetStateAction<string | null>>;
  updateBlock: (imageId: string, blockId: string, updates: Partial<EditableBlock>) => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<EditorImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const currentImage = images[currentImageIndex] ?? null;

  const updateBlock = useCallback(
    (imageId: string, blockId: string, updates: Partial<EditableBlock>) => {
      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== imageId) return img;
          return {
            ...img,
            isDirty: true,
            editableBlocks: img.editableBlocks.map((blk) =>
              blk.id === blockId ? { ...blk, ...updates } : blk
            ),
          };
        })
      );
    },
    []
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
