import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import {
  BookOpen,
  ArrowLeft,
  Settings2,
  Upload,
  Image as ImageIcon,
  X,
  Play,
  Trash2,
  Loader2,
  Languages,
  Focus,
  Maximize,
  Layers,
  AlertCircle,
  ExternalLink,
  User,
  Coins,
  ChevronDown,
  CreditCard,
  BarChart3,
  LogOut,
} from "lucide-react";
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
} from "@/types";
import {
  imageMimeTypes,
  detectionResolutions,
  textDetectorOptions,
  inpaintingSizes,
  inpainterOptions,
} from "@/config";
import { loadSettings, saveSettings } from "@/utils/localStorage";
import { initEditableBlocks } from "@/utils/initEditableBlocks";
import { useEditor } from "@/context/EditorContext";
import { useAuth } from "@/context/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";

export const clientLoader = async () => null;
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-600">
      <p>Loading...</p>
    </div>
  );
}

type Locale = "th" | "en";
const t = {
  th: {
    back: "กลับ",
    workspace: "พื้นที่ทำงาน",
    clear: "ล้าง",
    editor: "ตัวแก้ไข",
    runTranslation: "เริ่มแปล",
    dropTitle: "วางหน้ามังงะที่นี่",
    dropDesc: "รองรับอัปโหลดหลายไฟล์และ Ctrl+V วาง",
    queue: "คิว",
    ready: "พร้อม",
    uploaded: "อัปโหลดแล้ว",
    translating: "กำลังแปล",
    translated: "แปลแล้ว",
    error: "ผิดพลาด",
    config: "การตั้งค่า",
    detection: "การตรวจจับ",
    textDetector: "ตัวตรวจจับข้อความ",
    resolution: "ความละเอียด",
    translation: "การแปล",
    targetLang: "ภาษาเป้าหมาย",
    renderDir: "ทิศทางข้อความ",
    visuals: "ภาพ",
    boxThreshold: "ค่าขอบ",
    unclipRatio: "อัตรา Unclip",
    maskDilation: "ขยายมาสก์",
    inpainter: "ตัวลบข้อความ",
    inpaintingSize: "ขนาดลบข้อความ",
    warning: "ความละเอียดสูงช่วยให้ OCR แม่นยำขึ้น แต่ใช้เวลานานขึ้น",
    resetDefault: "รีเซ็ตค่าเริ่มต้น",
    insufficientTokens: "โทเค็นไม่เพียงพอ ต้องใช้ {need} โทเค็น แต่มี {have} กรุณาเติมเงิน",
    auto: "อัตโนมัติ",
    horizontal: "แนวนอน",
    vertical: "แนวตั้ง",
    uploading: "กำลังอัปโหลด...",
    images: "รูป",
    tokens: "โทเค็น",
    adminUnlimited: "ผู้ดูแล (ไม่จำกัด)",
    profile: "โปรไฟล์",
    subscription: "แพ็กเกจสมาชิก",
    tokenUsage: "การใช้โทเค็น",
    signOut: "ออกจากระบบ",
    hintTextDetector: "โมเดลที่ใช้ตรวจจับตำแหน่งข้อความในภาพ",
    hintResolution: "ความละเอียดที่ใช้ตรวจจับ ยิ่งสูงยิ่งแม่นแต่ช้าลง",
    hintTargetLang: "ภาษาที่ต้องการแปลเป็น",
    hintRenderDir: "ทิศทางการเรนเดอร์ข้อความแปล: อัตโนมัติ, แนวนอน หรือ แนวตั้ง",
    hintBoxThreshold: "ค่าขีดจำกัดความมั่นใจในการตรวจจับกล่องข้อความ ยิ่งสูงยิ่งเข้มงวด",
    hintUnclipRatio: "อัตราขยายกล่องข้อความ ค่าสูงจะได้กล่องใหญ่ขึ้น",
    hintMaskDilation: "ขยายมาสก์ลบข้อความ ค่าสูงจะลบพื้นที่รอบข้อความมากขึ้น",
    hintInpainter: "โมเดลที่ใช้ลบข้อความต้นฉบับออกจากภาพ",
    hintInpaintingSize: "ความละเอียดที่ใช้ในการลบข้อความ",
  },
  en: {
    back: "Back",
    workspace: "Workspace",
    clear: "Clear",
    editor: "Editor",
    runTranslation: "Run Translation",
    dropTitle: "Drop your manga pages here",
    dropDesc: "Supports batch upload and Ctrl+V clipboard paste",
    queue: "Queue",
    ready: "ready",
    uploaded: "Uploaded",
    translating: "Translating",
    translated: "Translated",
    error: "Error",
    config: "Configuration",
    detection: "Detection",
    textDetector: "Text Detector",
    resolution: "Resolution",
    translation: "Translation",
    targetLang: "Target Language",
    renderDir: "Render Direction",
    visuals: "Visuals",
    boxThreshold: "Box Threshold",
    unclipRatio: "Unclip Ratio",
    maskDilation: "Mask Dilation",
    inpainter: "Inpainter",
    inpaintingSize: "Inpainting Size",
    warning: "Higher resolution improves OCR accuracy but increases processing time.",
    resetDefault: "Reset to Default",
    insufficientTokens: "Insufficient tokens. You need {need} token(s) but have {have}. Please top up.",
    auto: "Auto",
    horizontal: "Horizontal",
    vertical: "Vertical",
    uploading: "Uploading...",
    images: "images",
    tokens: "Tokens",
    adminUnlimited: "Admin (Unlimited)",
    profile: "Profile",
    subscription: "Subscription",
    tokenUsage: "Token Usage",
    signOut: "Sign out",
    hintTextDetector: "Model used to detect text regions in the image",
    hintResolution: "Detection resolution — higher is more accurate but slower",
    hintTargetLang: "Language to translate into",
    hintRenderDir: "Text render direction: auto, horizontal, or vertical",
    hintBoxThreshold: "Confidence threshold for text box detection — higher is stricter",
    hintUnclipRatio: "Text box expansion ratio — higher gives larger boxes",
    hintMaskDilation: "Mask dilation around text — higher removes more surrounding area",
    hintInpainter: "Model used to remove original text from the image",
    hintInpaintingSize: "Resolution used for text removal inpainting",
  },
} as const;

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
  const { session, tokenBalance, isAdmin, refreshBalance } = useAuth();

  const [locale] = useState<Locale>(() => (localStorage.getItem("manga-translator-locale") as Locale) || "th");
  const i = t[locale];

  // Project data
  const [projectName, setProjectName] = useState("");
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);

  // Local files being translated (not yet in DB)
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [localFiles, setLocalFiles] = useState<Map<string, File>>(new Map());
  const [shouldTranslate, setShouldTranslate] = useState(false);
  const [uploading, setUploading] = useState(false);

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
  const [inpainter, setInpainter] = useState(savedSettings.inpainter || "default");

  const isProcessing = useMemo(() => {
    if (fileStatuses.size === 0) return false;
    return Array.from(fileStatuses.values()).some((fs) => fs?.status && processingStatuses.includes(fs.status));
  }, [fileStatuses]);

  // Save settings
  useEffect(() => {
    const settings: TranslationSettings = {
      detectionResolution, textDetector, renderTextDirection, translator,
      targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold,
      maskDilationOffset, inpainter,
    };
    saveSettings(settings);
  }, [detectionResolution, textDetector, renderTextDirection, targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold, maskDilationOffset, inpainter]);

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
  }, [session?.access_token, projectId]);

  // Load project
  useEffect(() => {
    if (!session?.access_token || !projectId) return;
    setLoadingProject(true);
    fetch(`/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        setProjectName(data.project.name);
        setProjectImages(data.images);
      })
      .catch(() => navigate("/"))
      .finally(() => setLoadingProject(false));
  }, [session?.access_token, projectId]);

  useEffect(() => {
    if (shouldTranslate) {
      processTranslation();
      setShouldTranslate(false);
    }
  }, [fileStatuses]);

  // Upload files to project
  const handleUploadFiles = async (files: File[]) => {
    if (!session?.access_token || !projectId || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("images", f));
      const res = await fetch(`/api/projects/${projectId}/images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      if (res.ok) {
        const newImages: ProjectImage[] = await res.json();
        setProjectImages((prev) => [...prev, ...newImages]);
      }
    } catch {
      // silent
    } finally {
      setUploading(false);
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
    if (!session?.access_token || !projectId) return;
    try {
      await fetch(`/api/projects/${projectId}/images/${imageId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
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
      navigate("/topup");
      return;
    }
    // Set up file statuses for untranslated images
    const m = new Map<string, FileStatus>();
    untranslatedImages.forEach((pi) => m.set(pi.id, { status: null, progress: null, queuePos: null, result: null, error: null }));
    setFileStatuses(m);
    setShouldTranslate(true);
  };

  const buildTranslationConfig = (): string => JSON.stringify({
    detector: { detector: textDetector, detection_size: detectionResolution, box_threshold: customBoxThreshold, unclip_ratio: customUnclipRatio },
    render: { direction: renderTextDirection },
    translator: { translator, target_lang: targetLanguage },
    inpainter: { inpainter, inpainting_size: inpaintingSize },
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
    try {
      await Promise.all(untranslatedImages.map((pi) => translateProjectImage(pi, config)));
    } catch (err) {
      console.error("Translation process failed:", err);
    } finally {
      refreshBalance();
      // Reload project to get updated image data with signed URLs
      if (session?.access_token && projectId) {
        const res = await fetch(`/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setProjectImages(data.images);
        }
      }
    }
  };

  const translateProjectImage = async (pi: ProjectImage, config: string) => {
    try {
      const formData = new FormData();
      formData.append("config", config);
      const response = await fetch(`/api/projects/${projectId}/images/${pi.id}/translate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session!.access_token}` },
        body: formData,
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
              if (session?.access_token) {
                try {
                  const edBlocks = initEditableBlocks(parsed.translations, targetLanguage);
                  await fetch(`/api/projects/${projectId}/images/${pi.id}/save-result`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                      translation_response: parsed,
                      editable_blocks: edBlocks,
                    }),
                  });
                } catch { /* silent */ }
              }
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
    navigate("/editor");
  };

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
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Title + Actions */}
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{projectName}</h2>
              <p className="text-sm text-slate-500">{projectImages.length} {i.images}</p>
            </div>
            <div className="flex gap-2">
              {translatedCount > 0 && (
                <button
                  onClick={openEditor}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> {i.editor} ({translatedCount})
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
                {uploading ? <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /> : <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{uploading ? i.uploading : i.dropTitle}</p>
                <p className="text-xs text-slate-400 mt-1">{i.dropDesc}</p>
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
                            {badge.status || pi.status}
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
                      <button
                        onClick={() => removeImage(pi.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Configuration Sidebar */}
        <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-20 overflow-y-auto">
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
                options={textDetectorOptions.map((o) => ({ value: o.value, label: o.label }))} hint={i.hintTextDetector} />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">{i.resolution}<InfoTooltip text={i.hintResolution} /></label>
                <div className="relative">
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm pl-8 text-slate-900"
                    value={detectionResolution} onChange={(e) => setDetectionResolution(e.target.value)}>
                    {detectionResolutions.map((r) => <option key={r} value={String(r)}>{r}px</option>)}
                  </select>
                  <Maximize className="w-3.5 h-3.5 text-slate-300 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
            {/* Translation */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Languages className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">{i.translation}</span>
              </div>
              <SidebarSelect label={i.targetLang} value={targetLanguage} onChange={setTargetLanguage}
                options={[
                  { value: "THA", label: locale === "th" ? "ไทย" : "Thai" },
                  { value: "ENG", label: locale === "th" ? "อังกฤษ" : "English" },
                  { value: "JPN", label: locale === "th" ? "ญี่ปุ่น" : "Japanese" },
                  { value: "CHS", label: locale === "th" ? "จีน (ตัวย่อ)" : "Chinese (Simplified)" },
                  { value: "KOR", label: locale === "th" ? "เกาหลี" : "Korean" },
                ]} hint={i.hintTargetLang} />
              <SidebarSelect label={i.renderDir} value={renderTextDirection} onChange={setRenderTextDirection}
                options={[{ value: "auto", label: i.auto }, { value: "horizontal", label: i.horizontal }, { value: "vertical", label: i.vertical }]} hint={i.hintRenderDir} />
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
                options={inpainterOptions.map((o) => ({ value: o.value, label: o.label }))} hint={i.hintInpainter} />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">{i.inpaintingSize}<InfoTooltip text={i.hintInpaintingSize} /></label>
                <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
                  value={inpaintingSize} onChange={(e) => setInpaintingSize(e.target.value)}>
                  {inpaintingSizes.map((s) => <option key={s} value={String(s)}>{s}px</option>)}
                </select>
              </div>
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
                  setCustomBoxThreshold(0.7); setMaskDilationOffset(30); setInpainter("default");
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
              >
                {i.resetDefault}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function SidebarSelect({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}{hint && <InfoTooltip text={hint} />}</label>
      <select
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900"
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
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
  const navigate = useNavigate();
  const { user, tokenBalance, isAdmin, signOut } = useAuth();
  const locale = (typeof window !== "undefined" ? localStorage.getItem("manga-translator-locale") as Locale : null) || "th";
  const i = t[locale];

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center gap-4 z-30 shrink-0">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {i.back}
          </button>
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <BookOpen className="text-white w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">Manga Translator</h1>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {isAdmin ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-100 rounded-full">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">{i.adminUnlimited}</span>
              </div>
            ) : (
              <button
                onClick={() => navigate("/topup")}
                className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full hover:bg-emerald-100 transition-colors"
              >
                <Coins className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">{tokenBalance} {i.tokens}</span>
              </button>
            )}
            <div className="h-6 w-px bg-slate-200" />
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-1.5 p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-700 truncate">{user?.email}</p>
                    {isAdmin && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">Admin</span>}
                  </div>
                  <div className="py-1">
                    <button onClick={() => { setProfileOpen(false); navigate("/profile"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                      <User className="w-4 h-4 text-slate-400" /> {i.profile}
                    </button>
                    <button onClick={() => { setProfileOpen(false); navigate("/topup"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                      <CreditCard className="w-4 h-4 text-slate-400" /> {i.subscription}
                    </button>
                    <button onClick={() => { setProfileOpen(false); navigate("/token-usage"); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                      <BarChart3 className="w-4 h-4 text-slate-400" /> {i.tokenUsage}
                      <span className="ml-auto text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {isAdmin ? "\u221e" : tokenBalance}
                      </span>
                    </button>
                  </div>
                  <div className="border-t border-slate-100 py-1">
                    <button onClick={() => { setProfileOpen(false); handleSignOut(); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                      <LogOut className="w-4 h-4" /> {i.signOut}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <ProjectContent />
      </div>
    </AuthGuard>
  );
}
