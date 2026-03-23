import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { useLocale, useLocalePath, useT } from "@/context/LocaleContext";
import type { Locale } from "@/context/LocaleContext";
import { Navbar } from "@/components/Navbar";
import {
  Settings2,
  Upload,
  Image as ImageIcon,
  X,
  Play,
  Loader2,
  Languages,
  Focus,
  Layers,
  AlertCircle,
  ExternalLink,
  Info,
  ChevronDown,
  Check,
  RotateCcw,
} from "lucide-react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import {
  type StatusKey,
  processingStatuses,
  type TranslatorKey,
  type FileStatus,
  type ChunkProcessingResult,
  type TranslationSettings,
  type TranslationResponseJson,
  type EditorImage,
  type ProjectImage,
  type UploadFileTracker,
} from "@/types";
import {
  imageMimeTypes,
  textDetectorOptions,
  inpainterOptions,
  detectionResolutionOptions,
  inpaintingSizeOptions,
  type LocalizedOption,
} from "@/config";
import { loadSettings, saveSettings } from "@/utils/localStorage";
import { initEditableBlocks } from "@/utils/initEditableBlocks";
import { useEditor } from "@/context/EditorContext";
import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { UploadTracker } from "@/components/UploadTracker";
import { apiFetch } from "@/utils/api";

export const clientLoader = async () => null;
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
      <p>Loading...</p>
    </div>
  );
}


function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group/tip ml-1 inline-flex">
      <svg
        className="w-3.5 h-3.5 text-slate-400 cursor-help"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clipRule="evenodd"
        />
      </svg>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/tip:block bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-normal w-48 z-50 pointer-events-none shadow-lg">
        {text}
      </span>
    </span>
  );
}

const STATUS_PROGRESS: Record<string, number> = {
  pending: 5, detection: 20, ocr: 35, textline_merge: 45,
  "mask-generation": 55, inpainting: 65, translating: 80, rendering: 90, finished: 100,
};

function ProjectContent() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { setImages: setEditorImages } = useEditor();
  const { user, tokenBalance, isAdmin, refreshBalance } = useAuth();

  const locale = useLocale();
  const lp = useLocalePath();
  const i = useT().project;

  // Project data
  const [projectName, setProjectName] = useState("");
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);

  // Local files being translated (not yet in DB)
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [localFiles, setLocalFiles] = useState<Map<string, File>>(new Map());
  const [shouldTranslate, setShouldTranslate] = useState(false);

  // Upload tracker
  const [uploadTrackerFiles, setUploadTrackerFiles] = useState<UploadFileTracker[]>([]);
  const [showUploadTracker, setShowUploadTracker] = useState(false);

  // Cancel support
  const abortRef = useRef<AbortController | null>(null);

  // Translation settings
  const [savedSettings] = useState(() => loadSettings());
  const [detectionResolution, setDetectionResolution] = useState(savedSettings.detectionResolution || "1536");
  const [textDetector, setTextDetector] = useState(savedSettings.textDetector || "default");
  const [renderTextDirection, setRenderTextDirection] = useState(savedSettings.renderTextDirection || "auto");
  const translator: TranslatorKey = "openai";
  const [targetLanguage, setTargetLanguage] = useState(savedSettings.targetLanguage || "THA");
  const [inpaintingSize, setInpaintingSize] = useState(savedSettings.inpaintingSize || "2048");
  const [customUnclipRatio, setCustomUnclipRatio] = useState<number>(savedSettings.customUnclipRatio ?? 2.3);
  const [customBoxThreshold, setCustomBoxThreshold] = useState<number>(savedSettings.customBoxThreshold ?? 0.7);
  const [maskDilationOffset, setMaskDilationOffset] = useState<number>(savedSettings.maskDilationOffset ?? 30);
  const [inpainter, setInpainter] = useState(savedSettings.inpainter || "lama_large");
  const [skipOutsideBubble, setSkipOutsideBubble] = useState(savedSettings.skipOutsideBubble ?? false);
  const [configOpen, setConfigOpen] = useState(false);

  const isProcessing = useMemo(() => {
    if (fileStatuses.size === 0) return false;
    return Array.from(fileStatuses.values()).some((fs) => fs?.status && processingStatuses.includes(fs.status));
  }, [fileStatuses]);

  // Save settings
  useEffect(() => {
    const settings: TranslationSettings = {
      detectionResolution, textDetector, renderTextDirection, translator,
      targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold,
      maskDilationOffset, inpainter, skipOutsideBubble,
    };
    saveSettings(settings);
  }, [detectionResolution, textDetector, renderTextDirection, targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold, maskDilationOffset, inpainter, skipOutsideBubble]);

  // Clipboard paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && imageMimeTypes.includes(f.type)) {
            handleUploadFiles([f]);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste as EventListener);
    return () => window.removeEventListener("paste", handlePaste as EventListener);
  }, [user, projectId]);

  // Load project
  useEffect(() => {
    if (!user || !projectId) return;
    setLoadingProject(true);
    apiFetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setProjectName(data.project.name);
        setProjectImages(data.images);
      })
      .catch(() => navigate(lp("/studio")))
      .finally(() => setLoadingProject(false));
  }, [user, projectId]);

  useEffect(() => {
    if (shouldTranslate) {
      processTranslation();
      setShouldTranslate(false);
    }
  }, [fileStatuses]);

  // Upload files to project (per-file with progress tracking)
  const handleUploadFiles = async (files: File[]) => {
    if (!user || !projectId || files.length === 0) return;

    const trackers: UploadFileTracker[] = files.map((f, idx) => ({
      id: `upload-${Date.now()}-${idx}`,
      filename: f.name,
      size: f.size,
      progress: 0,
      status: "uploading" as const,
    }));
    setUploadTrackerFiles(trackers);
    setShowUploadTracker(true);

    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const trackerId = trackers[idx].id;
      try {
        const newImage = await new Promise<ProjectImage>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = (e.loaded / e.total) * 100;
              setUploadTrackerFiles((prev) =>
                prev.map((t) => t.id === trackerId ? { ...t, progress: pct } : t)
              );
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const result: ProjectImage[] = JSON.parse(xhr.responseText);
                resolve(result[0]);
              } catch { reject(new Error("Parse error")); }
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network error"));
          const formData = new FormData();
          formData.append("images", file);
          xhr.open("POST", `/api/projects/${projectId}/images`);
          xhr.withCredentials = true;
          xhr.send(formData);
        });
        setUploadTrackerFiles((prev) =>
          prev.map((t) => t.id === trackerId ? { ...t, status: "success", progress: 100 } : t)
        );
        setProjectImages((prev) => [...prev, newImage]);
      } catch (err) {
        setUploadTrackerFiles((prev) =>
          prev.map((t) => t.id === trackerId ? { ...t, status: "error", error: err instanceof Error ? err.message : "Error" } : t)
        );
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => imageMimeTypes.includes(f.type));
    handleUploadFiles(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) => imageMimeTypes.includes(f.type));
    handleUploadFiles(selected);
    e.target.value = "";
  };

  const removeImage = async (imageId: string) => {
    if (!user || !projectId) return;
    try {
      await apiFetch(`/api/projects/${projectId}/images/${imageId}`, {
        method: "DELETE",
      });
      setProjectImages((prev) => prev.filter((pi) => pi.id !== imageId));
    } catch { /* silent */ }
  };

  // Translation logic
  const untranslatedImages = useMemo(() =>
    projectImages.filter((pi) => pi.status === "uploaded"),
    [projectImages]
  );

  const handleSubmit = () => {
    if (untranslatedImages.length === 0) return;
    if (!isAdmin && tokenBalance < untranslatedImages.length) {
      alert(i.insufficientTokens.replace("{need}", String(untranslatedImages.length)).replace("{have}", String(tokenBalance)));
      navigate(lp("/subscription"));
      return;
    }
    // Set up file statuses for untranslated images
    const m = new Map<string, FileStatus>();
    untranslatedImages.forEach((pi) => m.set(pi.id, { status: "pending", progress: null, queuePos: null, result: null, error: null }));
    setFileStatuses(m);
    setShouldTranslate(true);
  };

  const buildTranslationConfig = (): string => JSON.stringify({
    detector: { detector: textDetector, detection_size: detectionResolution, box_threshold: customBoxThreshold, unclip_ratio: customUnclipRatio },
    render: { direction: renderTextDirection },
    translator: { translator, target_lang: targetLanguage },
    inpainter: { inpainter, inpainting_size: inpaintingSize },
    ocr: { ignore_bubble: skipOutsideBubble ? 10 : 0 },
    mask_dilation_offset: maskDilationOffset,
  });

  const updateFileStatus = (fileId: string, update: Partial<FileStatus>) => {
    setFileStatuses((prev) => {
      const m = new Map(prev);
      const cur = m.get(fileId) || { status: null, progress: null, queuePos: null, result: null, error: null };
      m.set(fileId, { ...cur, ...update });
      return m;
    });
  };

  const processTranslation = async () => {
    const config = buildTranslationConfig();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      for (const pi of untranslatedImages) {
        if (controller.signal.aborted) break;
        await translateProjectImage(pi, config, controller.signal);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("Translation process failed:", err);
      }
    } finally {
      abortRef.current = null;
      refreshBalance();
      // Reload project to get updated image data with signed URLs
      if (user && projectId) {
        const res = await apiFetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProjectImages(data.images);
        }
      }
    }
  };

  const translateProjectImage = async (pi: ProjectImage, config: string, signal?: AbortSignal) => {
    try {
      const formData = new FormData();
      formData.append("config", config);
      const response = await apiFetch(`/api/projects/${projectId}/images/${pi.id}/translate`, {
        method: "POST",
        body: formData,
        signal,
      });
      if (response.status === 402) throw new Error("Insufficient tokens");
      if (response.status === 401) throw new Error("Not authenticated");
      if (!response.ok) throw new Error("Translation failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream reader");
      let fileBuffer = new Uint8Array();
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        const newBuffer = new Uint8Array(fileBuffer.length + value.length);
        newBuffer.set(fileBuffer);
        newBuffer.set(value, fileBuffer.length);
        fileBuffer = newBuffer;
        // Process chunks
        while (fileBuffer.length >= 5) {
          const dataSize = new DataView(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength).getUint32(1, false);
          const totalSize = 5 + dataSize;
          if (fileBuffer.length < totalSize) break;
          const statusCode = fileBuffer[0];
          const data = fileBuffer.slice(5, totalSize);
          const decoded = new TextDecoder("utf-8").decode(data);
          switch (statusCode) {
            case 0: {
              // Translation result JSON
              let parsed: TranslationResponseJson;
              try { parsed = JSON.parse(decoded); } catch { break; }
              updateFileStatus(pi.id, { status: "finished" });
              // Save result to project storage via backend
              try {
                const edBlocks = initEditableBlocks(parsed.translations, targetLanguage);
                await apiFetch(`/api/projects/${projectId}/images/${pi.id}/save-result`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    translation_response: parsed,
                    editable_blocks: edBlocks,
                  }),
                });
              } catch { /* silent */ }
              break;
            }
            case 1: updateFileStatus(pi.id, { status: decoded as StatusKey }); break;
            case 2: updateFileStatus(pi.id, { status: "error", error: decoded }); break;
            case 3: updateFileStatus(pi.id, { status: "pending", queuePos: decoded }); break;
            case 4: updateFileStatus(pi.id, { status: "pending", queuePos: null }); break;
          }
          fileBuffer = fileBuffer.slice(totalSize);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Cancelled — reset to uploaded
        updateFileStatus(pi.id, { status: null });
        try {
          await apiFetch(`/api/projects/${projectId}/images/${pi.id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "uploaded" }),
          });
        } catch { /* silent */ }
        throw err; // propagate to break the loop
      }
      updateFileStatus(pi.id, { status: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const openEditor = () => {
    const translatedImages = projectImages.filter(
      (pi) => pi.status === "translated" && pi.translation_metadata
    );
    if (translatedImages.length === 0) return;

    const editorImages: EditorImage[] = translatedImages.map((pi) => {
      const translationResponse: TranslationResponseJson = {
        translations: pi.translation_metadata!.translations.map((tb) => ({
          ...tb,
          background: (tb as any).background_url || (tb as any).background || "",
        })),
        inpainted_image: pi.inpainted_image_url || null,
        rendered_image: pi.rendered_image_url || null,
        debug_folder: pi.translation_metadata!.debug_folder,
      };
      return {
        id: pi.id,
        originalFile: null,
        originalImageUrl: pi.original_image_url,
        originalFilename: pi.original_filename,
        projectImageId: pi.id,
        translationResponse,
        editableBlocks: pi.editable_blocks ?? initEditableBlocks(translationResponse.translations, targetLanguage),
        isDirty: false,
      };
    });
    setEditorImages(editorImages);
    navigate(lp("/studio/editor"));
  };

  const handleCancel = useCallback(async () => {
    abortRef.current?.abort();
    // Reset any in-progress images back to uploaded
    for (const pi of projectImages) {
      const fs = fileStatuses.get(pi.id);
      if (fs?.status && processingStatuses.includes(fs.status)) {
        try {
          await apiFetch(`/api/projects/${projectId}/images/${pi.id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "uploaded" }),
          });
        } catch { /* silent */ }
      }
    }
    setFileStatuses(new Map());
    // Reload project
    if (user && projectId) {
      const res = await apiFetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProjectImages(data.images);
      }
    }
  }, [projectImages, fileStatuses, projectId, user]);

  const handleRetry = useCallback(async (imageId: string) => {
    try {
      await apiFetch(`/api/projects/${projectId}/images/${imageId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "uploaded" }),
      });
      // Clear local status
      setFileStatuses((prev) => {
        const m = new Map(prev);
        m.delete(imageId);
        return m;
      });
      // Update local state
      setProjectImages((prev) =>
        prev.map((pi) => pi.id === imageId ? { ...pi, status: "uploaded" as const } : pi)
      );
    } catch { /* silent */ }
  }, [projectId]);

  const getStatusBadge = (pi: ProjectImage) => {
    const fs = fileStatuses.get(pi.id);
    const status = fs?.status || pi.status;
    const progress = fs?.status ? (STATUS_PROGRESS[fs.status] ?? 0) : (pi.status === "translated" ? 100 : 0);
    const isError = String(status).startsWith("error");
    const isFinished = status === "finished" || status === "translated";
    return { status, progress, isError, isFinished, error: fs?.error };
  };

  const translatedCount = projectImages.filter((pi) => pi.status === "translated").length;

  if (loadingProject) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-8">
          {/* Title + Actions */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-0 justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{projectName}</h2>
              <p className="text-sm text-slate-500">{projectImages.length} {i.images}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfigOpen(v => !v)}
                className="md:hidden flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all"
              >
                <Settings2 className="w-4 h-4" />
              </button>
              {translatedCount > 0 && (
                <button
                  onClick={openEditor}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> {i.editor} ({translatedCount})
                </button>
              )}
              {isProcessing && (
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all"
                >
                  <X className="w-4 h-4" /> {i.cancel}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={isProcessing || untranslatedImages.length === 0}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                {i.runTranslation} {untranslatedImages.length > 0 && `(${untranslatedImages.length})`}
              </button>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="relative group border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/20 rounded-2xl p-12 transition-all cursor-pointer text-center"
          >
            <input type="file" multiple accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
            <div className="max-w-xs mx-auto space-y-3 pointer-events-none">
              <div className="bg-slate-50 group-hover:bg-indigo-100 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto transition-colors">
                {uploadTrackerFiles.some((f) => f.status === "uploading") ? <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> : <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{uploadTrackerFiles.some((f) => f.status === "uploading") ? i.uploading : i.dropTitle}</p>
                <p className="text-xs text-slate-400 mt-1">{i.dropDesc}</p>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 text-xs px-4 py-2 rounded-full">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{i.dropHint}</span>
              </div>
            </div>
          </div>

          {/* Image Queue */}
          {projectImages.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> {i.queue} ({projectImages.length})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {projectImages.map((pi) => {
                  const badge = getStatusBadge(pi);
                  return (
                    <div key={pi.id} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-4 group hover:border-indigo-200 transition-all">
                      <div className="w-10 h-14 bg-slate-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-100">
                        {pi.original_image_url ? (
                          <img src={pi.original_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="text-slate-300 w-5 h-5" />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-bold truncate text-slate-700">{pi.original_filename}</p>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            badge.isError ? "bg-red-100 text-red-500" :
                            badge.isFinished ? "bg-emerald-100 text-emerald-600" :
                            badge.status && processingStatuses.includes(badge.status as any) ? "bg-indigo-100 text-indigo-600" :
                            "bg-slate-100 text-slate-500"
                          }`}>
                            {(i.statusLabels as Record<string, string>)[String(badge.status || pi.status)] || badge.status || pi.status}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${badge.isError ? "bg-red-400" : badge.isFinished ? "bg-emerald-500" : "bg-indigo-500"}`}
                            style={{ width: `${badge.progress}%` }}
                          />
                        </div>
                        {badge.isError && badge.error && (
                          <p className="text-[10px] text-red-500 mt-1 truncate">{badge.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(badge.isError || (pi.status === "translating" && !fileStatuses.has(pi.id))) && (
                          <button
                            onClick={() => handleRetry(pi.id)}
                            title={i.retry}
                            className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => removeImage(pi.id)}
                          className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Backdrop for mobile config sidebar */}
        {configOpen && (
          <div className="fixed inset-0 bg-black/20 z-10 md:hidden" onClick={() => setConfigOpen(false)} />
        )}
        {/* Configuration Sidebar */}
        <aside className={`
          ${configOpen ? 'fixed right-0 top-14 bottom-0 z-20 shadow-xl' : 'hidden'}
          md:relative md:block md:shadow-none md:top-auto
          w-80 bg-white border-l border-slate-200 flex flex-col overflow-y-auto
        `}>
          <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50 sticky top-0 z-10">
            <Settings2 className="w-4 h-4 text-slate-500" />
            <h2 className="font-bold text-sm text-slate-700 uppercase tracking-tight">{i.config}</h2>
          </div>
          <div className="p-5 space-y-8">
            {/* Detection */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Focus className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">{i.detection}</span>
              </div>
              <SidebarSelect label={i.textDetector} value={textDetector} onChange={setTextDetector}
                options={textDetectorOptions} locale={locale} hint={i.hintTextDetector} />
              <SidebarSelect label={i.resolution} value={detectionResolution} onChange={setDetectionResolution}
                options={detectionResolutionOptions} locale={locale} hint={i.hintResolution} />
            </div>
            {/* Translation */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">{i.translation}</span>
              </div>
              <SidebarSelect label={i.targetLang} value={targetLanguage} onChange={setTargetLanguage}
                options={[
                  { value: "THA", label: { th: "ไทย", en: "Thai" } },
                  { value: "ENG", label: { th: "อังกฤษ", en: "English" } },
                  { value: "JPN", label: { th: "ญี่ปุ่น", en: "Japanese" } },
                  { value: "CHS", label: { th: "จีน (ตัวย่อ)", en: "Chinese (Simplified)" } },
                  { value: "KOR", label: { th: "เกาหลี", en: "Korean" } },
                ]} locale={locale} hint={i.hintTargetLang} />
              <SidebarSelect label={i.renderDir} value={renderTextDirection} onChange={setRenderTextDirection}
                options={[
                  { value: "auto", label: { th: "อัตโนมัติ", en: "Auto" } },
                  { value: "horizontal", label: { th: "แนวนอน", en: "Horizontal" } },
                  { value: "vertical", label: { th: "แนวตั้ง", en: "Vertical" } },
                ]} locale={locale} hint={i.hintRenderDir} />
            </div>
            {/* Visuals */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">{i.visuals}</span>
              </div>
              <SliderInput label={i.boxThreshold} value={customBoxThreshold} min={0} max={1} step={0.01} onChange={setCustomBoxThreshold} hint={i.hintBoxThreshold} />
              <SliderInput label={i.unclipRatio} value={customUnclipRatio} min={0} max={5} step={0.01} onChange={setCustomUnclipRatio} hint={i.hintUnclipRatio} />
              <SliderInput label={i.maskDilation} value={maskDilationOffset} min={0} max={100} step={1} onChange={setMaskDilationOffset} hint={i.hintMaskDilation} />
              <SidebarSelect label={i.inpainter} value={inpainter} onChange={setInpainter}
                options={inpainterOptions} locale={locale} hint={i.hintInpainter} />
              <SidebarSelect label={i.inpaintingSize} value={inpaintingSize} onChange={setInpaintingSize}
                options={inpaintingSizeOptions} locale={locale} hint={i.hintInpaintingSize} />
              <label className="flex items-center gap-3 cursor-pointer group">
                <input type="checkbox" checked={skipOutsideBubble} onChange={(e) => setSkipOutsideBubble(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-xs font-semibold text-slate-600">{i.skipOutsideBubble}<InfoTooltip text={i.hintSkipOutsideBubble} /></span>
              </label>
            </div>
            {/* Footer */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-normal">{i.warning}</p>
              </div>
              <button
                onClick={() => {
                  setDetectionResolution("1536"); setTextDetector("default"); setRenderTextDirection("auto");
                  setTargetLanguage("THA"); setInpaintingSize("2048"); setCustomUnclipRatio(2.3);
                  setCustomBoxThreshold(0.7); setMaskDilationOffset(30); setInpainter("lama_large"); setSkipOutsideBubble(false);
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
              >
                {i.resetDefault}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showUploadTracker && (
        <UploadTracker
          files={uploadTrackerFiles}
          onDismiss={() => setShowUploadTracker(false)}
          title={i.uploadTracker.title}
          completeText={i.uploadTracker.complete}
          failedText={i.uploadTracker.failed}
        />
      )}
    </>
  );
}

function SidebarSelect({ label, value, onChange, options, locale, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: LocalizedOption[]; locale: Locale; hint?: string;
}) {
  const selected = options.find((o) => o.value === value) || options[0];
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}{hint && <InfoTooltip text={hint} />}</label>
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <ListboxButton className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer hover:border-slate-300 transition-colors">
            <span>{selected?.label[locale]}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </ListboxButton>
          <ListboxOptions
            anchor="bottom"
            className="w-[var(--button-width)] rounded-xl bg-white shadow-lg ring-1 ring-slate-200 z-50 mt-1 p-1 max-h-60 overflow-auto focus:outline-none [--anchor-gap:4px]"
          >
            {options.map((o) => (
              <ListboxOption
                key={o.value}
                value={o.value}
                className="relative cursor-pointer select-none rounded-lg px-3 py-2 text-sm text-slate-700 data-[focus]:bg-indigo-50 data-[selected]:bg-indigo-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium data-[selected]:text-indigo-700">{o.label[locale]}</span>
                  {o.value === value && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                {o.description && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{o.description[locale]}</p>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
}

function SliderInput({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-slate-600">{label}{hint && <InfoTooltip text={hint} />}</label>
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function ProjectPage() {
  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <Navbar />
        <ProjectContent />
      </div>
    </AuthGuard>
  );
}
