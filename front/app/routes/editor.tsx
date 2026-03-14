import { useEditor } from "@/context/EditorContext";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { EditorPropertiesPanel } from "@/components/editor/EditorPropertiesPanel";
import { ClientOnlyCanvas } from "@/components/editor/ClientOnlyCanvas";
import { AuthGuard } from "@/components/AuthGuard";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { getEditorLocale, editorT } from "@/utils/editorI18n";

// Force client-side rendering for this route
export const clientLoader = async () => {
  return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  const locale = getEditorLocale();
  const i = editorT[locale];
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
      <p>{i.loadingEditor}</p>
    </div>
  );
}

export default function EditorPage() {
  return (
    <AuthGuard>
      <EditorContent />
    </AuthGuard>
  );
}

function EditorContent() {
  const { images, currentImage } = useEditor();
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);
  const locale = getEditorLocale();
  const i = editorT[locale];

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
      <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
        <p>{i.loadingEditor}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-900 overflow-hidden">
      <EditorToolbar />
      <div className="flex flex-1 min-h-0">
        <EditorSidebar />
        <div className="flex-1 min-w-0 bg-slate-200">
          <ClientOnlyCanvas />
        </div>
        <EditorPropertiesPanel />
      </div>
    </div>
  );
}
