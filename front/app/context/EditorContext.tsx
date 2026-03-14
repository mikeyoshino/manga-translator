import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import type { EditorImage, EditableBlock } from "@/types";
import { useAuth } from "@/context/AuthContext";

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
  const { session } = useAuth();
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const currentImage = images[currentImageIndex] ?? null;

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
