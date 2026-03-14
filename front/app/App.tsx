import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import {
  BookOpen,
  LogOut,
  Coins,
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
  History,
  LayoutDashboard,
  User,
  CreditCard,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import {
  type StatusKey,
  processingStatuses,
  type TranslatorKey,
  type FileStatus,
  type ChunkProcessingResult,
  type TranslationSettings,
  type FinishedImage,
  type TranslationResponseJson,
  type EditorImage,
} from "@/types";
import {
  imageMimeTypes,
  detectionResolutions,
  textDetectorOptions,
  inpaintingSizes,
  inpainterOptions,
} from "@/config";
import { loadSettings, saveSettings, addFinishedImage } from "@/utils/localStorage";
import { initEditableBlocks } from "@/utils/initEditableBlocks";
import { useEditor } from "@/context/EditorContext";
import { useAuth } from "@/context/AuthContext";

// --- i18n ---
type Locale = "th" | "en";
const t = {
  th: {
    workspace: "พื้นที่ทำงาน",
    workspaceDesc: "จัดการคิวแปลและดูผลลัพธ์ของคุณ",
    clear: "ล้าง",
    editor: "ตัวแก้ไข",
    runTranslation: "เริ่มแปล",
    dropTitle: "วางหน้ามังงะที่นี่",
    dropDesc: "รองรับอัปโหลดหลายไฟล์และ Ctrl+V วาง",
    queue: "คิว",
    ready: "พร้อม",
    recentTranslations: "ผลแปลล่าสุด",
    clearAll: "ล้างทั้งหมด",
    download: "ดาวน์โหลด",
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
    apiConnected: "API: เชื่อมต่อแล้ว",
    lastProcessed: "ประมวลผลล่าสุด",
    noActivity: "ยังไม่มีกิจกรรม",
    adminUnlimited: "ผู้ดูแล (ไม่จำกัด)",
    tokens: "โทเค็น",
    signOut: "ออกจากระบบ",
    insufficientTokens: "โทเค็นไม่เพียงพอ ต้องใช้ {need} โทเค็น แต่มี {have} กรุณาเติมเงิน",
    profile: "โปรไฟล์",
    subscription: "แพ็กเกจสมาชิก",
    tokenUsage: "การใช้โทเค็น",
    topUp: "เติมโทเค็น",
    auto: "อัตโนมัติ",
    horizontal: "แนวนอน",
    vertical: "แนวตั้ง",
  },
  en: {
    workspace: "Workspace",
    workspaceDesc: "Manage your translation queue and review results.",
    clear: "Clear",
    editor: "Editor",
    runTranslation: "Run Translation",
    dropTitle: "Drop your manga pages here",
    dropDesc: "Supports batch upload and Ctrl+V clipboard paste",
    queue: "Queue",
    ready: "ready",
    recentTranslations: "Recent Translations",
    clearAll: "Clear All",
    download: "Download",
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
    apiConnected: "API: Connected",
    lastProcessed: "Last processed",
    noActivity: "No recent activity",
    adminUnlimited: "Admin (Unlimited)",
    tokens: "Tokens",
    signOut: "Sign out",
    insufficientTokens: "Insufficient tokens. You need {need} token(s) but have {have}. Please top up.",
    profile: "Profile",
    subscription: "Subscription",
    tokenUsage: "Token Usage",
    topUp: "Top Up Tokens",
    auto: "Auto",
    horizontal: "Horizontal",
    vertical: "Vertical",
  },
} as const;

// Status → progress percentage mapping
const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  detection: 20,
  ocr: 35,
  textline_merge: 45,
  "mask-generation": 55,
  inpainting: 65,
  translating: 80,
  rendering: 90,
  finished: 100,
};

export const App: React.FC = () => {
  const navigate = useNavigate();
  const { setImages: setEditorImages } = useEditor();
  const { user, session, tokenBalance, isAdmin, signOut, refreshBalance } = useAuth();

  // Profile dropdown
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // State Hooks
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(new Map());
  const [shouldTranslate, setShouldTranslate] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [finishedImages, setFinishedImages] = useState<FinishedImage[]>([]);
  const [editorImagesData, setEditorImagesData] = useState<EditorImage[]>([]);

  // UI Language
  const [locale, setLocale] = useState<Locale>(() => (localStorage.getItem("manga-translator-locale") as Locale) || "th");
  const i = t[locale];

  // Translation Options
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

  // Computed
  const isProcessing = useMemo(() => {
    if (files.length === 0 || fileStatuses.size === 0) return false;
    return Array.from(fileStatuses.values()).some((fs) => fs?.status && processingStatuses.includes(fs.status));
  }, [files, fileStatuses]);

  // Save settings
  useEffect(() => {
    const settings: TranslationSettings = {
      detectionResolution, textDetector, renderTextDirection, translator,
      targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold,
      maskDilationOffset, inpainter,
    };
    saveSettings(settings);
  }, [detectionResolution, textDetector, renderTextDirection, targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold, maskDilationOffset, inpainter]);

  // Save locale
  useEffect(() => {
    localStorage.setItem("manga-translator-locale", locale);
  }, [locale]);

  // Clipboard paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f && imageMimeTypes.includes(f.type)) {
            setFiles((prev) => [...prev, f]);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handlePaste as EventListener);
    return () => window.removeEventListener("paste", handlePaste as EventListener);
  }, []);

  useEffect(() => {
    if (shouldTranslate) {
      processTranslation();
      setShouldTranslate(false);
    }
  }, [fileStatuses]);

  // --- Handlers ---
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => imageMimeTypes.includes(f.type));
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter((f) => imageMimeTypes.includes(f.type));
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setFileStatuses((prev) => { const m = new Map(prev); m.delete(name); return m; });
  };

  const handleSubmit = () => {
    if (files.length === 0) return;
    if (!isAdmin && tokenBalance < files.length) {
      alert(i.insufficientTokens.replace("{need}", String(files.length)).replace("{have}", String(tokenBalance)));
      navigate("/topup");
      return;
    }
    resetFileStatuses();
    setShouldTranslate(true);
  };

  const openEditor = () => {
    if (editorImagesData.length > 0) {
      setEditorImages(editorImagesData);
      navigate("/editor");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // --- Translation Logic ---
  const buildTranslationConfig = (): string => JSON.stringify({
    detector: { detector: textDetector, detection_size: detectionResolution, box_threshold: customBoxThreshold, unclip_ratio: customUnclipRatio },
    render: { direction: renderTextDirection },
    translator: { translator, target_lang: targetLanguage },
    inpainter: { inpainter, inpainting_size: inpaintingSize },
    mask_dilation_offset: maskDilationOffset,
  });

  const requestTranslation = async (file: File, config: string) => {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("config", config);
    const headers: Record<string, string> = {};
    if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
    const response = await fetch(`/api/translate/with-form/json/stream`, { method: "POST", headers, body: formData });
    if (response.status === 402) throw new Error("Insufficient tokens. Please top up your balance.");
    if (response.status === 401) throw new Error("Not authenticated. Please sign in again.");
    if (response.status !== 200) throw new Error("Upload failed");
    return response;
  };

  const processChunk = async (value: Uint8Array, fileId: string, currentBuffer: Uint8Array): Promise<ChunkProcessingResult> => {
    if (fileStatuses.get(fileId)?.error) throw new Error(`Stopped due to previous error for ${fileId}`);
    const newBuffer = new Uint8Array(currentBuffer.length + value.length);
    newBuffer.set(currentBuffer);
    newBuffer.set(value, currentBuffer.length);
    let processedBuffer = newBuffer;
    while (processedBuffer.length >= 5) {
      const dataSize = new DataView(processedBuffer.buffer, processedBuffer.byteOffset, processedBuffer.byteLength).getUint32(1, false);
      const totalSize = 5 + dataSize;
      if (processedBuffer.length < totalSize) break;
      const statusCode = processedBuffer[0];
      const data = processedBuffer.slice(5, totalSize);
      const decodedData = new TextDecoder("utf-8").decode(data);
      processStatusUpdate(statusCode, decodedData, fileId, data);
      processedBuffer = processedBuffer.slice(totalSize);
    }
    return { updatedBuffer: processedBuffer };
  };

  const processSingleFileStream = async (file: File, config: string) => {
    try {
      const response = await requestTranslation(file, config);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get stream reader");
      let fileBuffer = new Uint8Array();
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        try {
          const result = await processChunk(value, file.name, fileBuffer);
          fileBuffer = result.updatedBuffer;
        } catch (error) {
          updateFileStatus(file.name, { status: "error", error: error instanceof Error ? error.message : "Error processing chunk" });
        }
      }
    } catch (err) {
      updateFileStatus(file.name, { status: "error", error: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  const processTranslation = async () => {
    const config = buildTranslationConfig();
    try {
      await Promise.all(files.map((file) => processSingleFileStream(file, config)));
    } catch (err) {
      console.error("Translation process failed:", err);
    } finally {
      refreshBalance();
    }
  };

  const resetFileStatuses = () => {
    const m = new Map<string, FileStatus>();
    files.forEach((f) => m.set(f.name, { status: null, progress: null, queuePos: null, result: null, error: null }));
    setFileStatuses(m);
  };

  const updateFileStatus = (fileId: string, update: Partial<FileStatus>) => {
    setFileStatuses((prev) => {
      const m = new Map(prev);
      const cur = m.get(fileId) || { status: null, progress: null, queuePos: null, result: null, error: null };
      m.set(fileId, { ...cur, ...update });
      return m;
    });
  };

  const processStatusUpdate = (statusCode: number, decodedData: string, fileId: string, data: Uint8Array): void => {
    switch (statusCode) {
      case 0: {
        const decodedJson = new TextDecoder("utf-8").decode(data);
        let parsed: TranslationResponseJson;
        try { parsed = JSON.parse(decodedJson); } catch {
          const resultBlob = new Blob([data], { type: "image/png" });
          updateFileStatus(fileId, { status: "finished", result: resultBlob });
          break;
        }
        let resultBlob: Blob;
        const previewB64 = parsed.rendered_image || parsed.inpainted_image;
        if (previewB64) {
          const b64 = previewB64.split(",")[1];
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resultBlob = new Blob([bytes], { type: "image/png" });
        } else {
          const matchingOriginal = files.find((f) => f.name === fileId);
          resultBlob = matchingOriginal ?? new Blob([], { type: "image/png" });
        }
        updateFileStatus(fileId, { status: "finished", result: resultBlob });
        const matchingFile = files.find((f) => f.name === fileId);
        if (matchingFile) {
          const editorImage: EditorImage = {
            id: `${fileId}-${Date.now()}`, originalFile: matchingFile,
            translationResponse: parsed, editableBlocks: initEditableBlocks(parsed.translations, targetLanguage), isDirty: false,
          };
          setEditorImagesData((prev) => [...prev, editorImage]);
        }
        const settings: TranslationSettings = {
          detectionResolution, textDetector, renderTextDirection, translator,
          targetLanguage, inpaintingSize, customUnclipRatio, customBoxThreshold, maskDilationOffset, inpainter,
        };
        const finishedImage: FinishedImage = { id: `${fileId}-${Date.now()}`, originalName: fileId, result: resultBlob, finishedAt: new Date(), settings };
        setFinishedImages((prev) => [finishedImage, ...prev]);
        addFinishedImage(finishedImage);
        break;
      }
      case 1: updateFileStatus(fileId, { status: decodedData as StatusKey }); break;
      case 2: updateFileStatus(fileId, { status: "error", error: decodedData }); break;
      case 3: updateFileStatus(fileId, { status: "pending", queuePos: decodedData }); break;
      case 4: updateFileStatus(fileId, { status: "pending", queuePos: null }); break;
    }
  };

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-800">Manga Translator</h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocale(locale === "th" ? "en" : "th")}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full hover:bg-slate-200 transition-colors text-xs font-semibold text-slate-600"
          >
            <Languages className="w-3.5 h-3.5" />
            {locale === "th" ? "EN" : "TH"}
          </button>
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
                  <button
                    onClick={() => { setProfileOpen(false); /* TODO: profile page */ }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    {i.profile}
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate("/topup"); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    {i.subscription}
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); navigate("/token-usage"); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    {i.tokenUsage}
                    <span className="ml-auto text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {isAdmin ? "∞" : tokenBalance}
                    </span>
                  </button>
                </div>
                <div className="border-t border-slate-100 py-1">
                  <button
                    onClick={() => { setProfileOpen(false); handleSignOut(); }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {i.signOut}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Title + Actions */}
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{i.workspace}</h2>
              <p className="text-sm text-slate-500">{i.workspaceDesc}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setFiles([]); setFileStatuses(new Map()); setEditorImagesData([]); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
              >
                <Trash2 className="w-4 h-4" /> {i.clear}
              </button>
              {editorImagesData.length > 0 && (
                <button
                  onClick={openEditor}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> {i.editor} ({editorImagesData.length})
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={isProcessing || files.length === 0}
                className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                {i.runTranslation}
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
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{i.dropTitle}</p>
                <p className="text-xs text-slate-400 mt-1">{i.dropDesc}</p>
              </div>
            </div>
          </div>

          {/* Queue */}
          {files.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> {i.queue} ({files.length})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {files.map((file) => {
                  const status = fileStatuses.get(file.name);
                  const progress = status?.status ? (STATUS_PROGRESS[status.status] ?? 0) : 0;
                  const isError = status?.status?.startsWith("error");
                  const isFinished = status?.status === "finished";
                  return (
                    <div key={file.name} className="bg-white border border-slate-200 p-4 rounded-xl flex items-center gap-4 group hover:border-indigo-200 transition-all">
                      <div className="w-10 h-14 bg-slate-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-100">
                        <ImageIcon className="text-slate-300 w-5 h-5" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-bold truncate text-slate-700">{file.name}</p>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                            isError ? "bg-red-100 text-red-500" : isFinished ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                          }`}>
                            {status?.status || i.ready}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${isError ? "bg-red-400" : isFinished ? "bg-emerald-500" : "bg-indigo-500"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        {isError && status?.error && (
                          <p className="text-[10px] text-red-500 mt-1 truncate">{status.error}</p>
                        )}
                      </div>
                      {isFinished && status?.result && (
                        <a
                          href={URL.createObjectURL(status.result)}
                          download={`translated_${file.name}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                        >
                          {i.download}
                        </a>
                      )}
                      <button
                        onClick={() => removeFile(file.name)}
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

          {/* Gallery */}
          {finishedImages.length > 0 && (
            <div className="pt-8 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4" /> {i.recentTranslations}
                </h3>
                <button
                  onClick={() => { setFinishedImages([]); localStorage.removeItem("manga-translator-finished-images"); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  {i.clearAll}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {finishedImages.map((item) => {
                  const url = URL.createObjectURL(item.result);
                  return (
                    <div key={item.id} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden aspect-[3/4] shadow-sm hover:shadow-md transition-all">
                      <img src={url} alt={item.originalName} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4 gap-2">
                        <p className="text-white text-xs font-bold truncate w-full text-center">{item.originalName}</p>
                        <a href={url} download={`translated_${item.originalName}`} className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg text-center">
                          {i.download}
                        </a>
                      </div>
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
                options={textDetectorOptions.map((o) => ({ value: o.value, label: o.label }))} />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">{i.resolution}</label>
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
                ]} />
              <SidebarSelect label={i.renderDir} value={renderTextDirection} onChange={setRenderTextDirection}
                options={[{ value: "auto", label: i.auto }, { value: "horizontal", label: i.horizontal }, { value: "vertical", label: i.vertical }]} />
            </div>

            {/* Visuals */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase">{i.visuals}</span>
              </div>
              <SliderInput label={i.boxThreshold} value={customBoxThreshold} min={0} max={1} step={0.01}
                onChange={setCustomBoxThreshold} />
              <SliderInput label={i.unclipRatio} value={customUnclipRatio} min={0} max={5} step={0.01}
                onChange={setCustomUnclipRatio} />
              <SliderInput label={i.maskDilation} value={maskDilationOffset} min={0} max={100} step={1}
                onChange={setMaskDilationOffset} />
              <SidebarSelect label={i.inpainter} value={inpainter} onChange={setInpainter}
                options={inpainterOptions.map((o) => ({ value: o.value, label: o.label }))} />
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">{i.inpaintingSize}</label>
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
                <p className="text-[10px] text-amber-700 leading-normal">
                  {i.warning}
                </p>
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

      {/* Status Bar */}
      <footer className="h-8 bg-slate-100 border-t border-slate-200 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {i.apiConnected}
          </span>
        </div>
        <div className="text-[10px] font-medium text-slate-400">
          {i.lastProcessed}: {finishedImages[0]?.originalName || i.noActivity}
        </div>
      </footer>
    </div>
  );
};

// --- Sidebar helper components ---

function SidebarSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <select
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-900"
        value={value} onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SliderInput({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <label className="text-xs font-semibold text-slate-600">{label}</label>
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

export default App;
