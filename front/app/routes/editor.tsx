import { useEditor } from "@/context/EditorContext";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { EditorSidebar } from "@/components/editor/EditorSidebar";
import { EditorPropertiesPanel } from "@/components/editor/EditorPropertiesPanel";
import { ClientOnlyCanvas } from "@/components/editor/ClientOnlyCanvas";
import { AuthGuard } from "@/components/AuthGuard";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { useT, useLocalePath } from "@/context/LocaleContext";

// Force client-side rendering for this route
export const clientLoader = async () => {
  return null;
};
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
      <p>กำลังโหลดตัวแก้ไข...</p>
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
  const { images, currentImage, undo, redo } = useEditor();
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const lp = useLocalePath();
  const i = useT().editor;

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (isClient && images.length === 0) {
      navigate(lp("/studio"));
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
      <EditorToolbar onTogglePanel={() => setPanelOpen(v => !v)} panelOpen={panelOpen} />
      <div className="flex flex-1 min-h-0 relative">
        {/* Sidebar: hidden on phone */}
        <div className="hidden sm:block">
          <EditorSidebar />
        </div>
        <div className="flex-1 min-w-0 bg-slate-200">
          <ClientOnlyCanvas />
        </div>
        {/* Properties panel: always visible on lg+, overlay below lg */}
        <div className={`
          ${panelOpen ? 'absolute right-0 top-0 bottom-0 z-10 shadow-xl' : 'hidden'}
          lg:relative lg:block lg:shadow-none
        `}>
          <EditorPropertiesPanel />
        </div>
      </div>
    </div>
  );
}
