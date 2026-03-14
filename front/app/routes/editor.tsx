import { useEditor } from "@/context/EditorContext";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { EditorPropertiesPanel } from "@/components/editor/EditorPropertiesPanel";
import { ClientOnlyCanvas } from "@/components/editor/ClientOnlyCanvas";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";

// Force client-side rendering for this route
export const clientLoader = async () => {
  return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <p>Loading editor...</p>
    </div>
  );
}

export default function EditorPage() {
  const { images, currentImage } = useEditor();
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && images.length === 0) {
      navigate("/");
    }
  }, [images, navigate, isClient]);

  if (!isClient || !currentImage) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <p>Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white overflow-hidden">
      <EditorToolbar />
      <div className="flex flex-1 min-h-0">
        <EditorSidebar />
        <div className="flex-1 min-w-0">
          <ClientOnlyCanvas />
        </div>
        <EditorPropertiesPanel />
      </div>
    </div>
  );
}
