import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  type StatusKey,
  processingStatuses,
  type TranslatorKey,
  type FileStatus,
  type ChunkProcessingResult,
  type QueuedImage,
  type TranslationSettings,
  type FinishedImage,
  type TranslationResponseJson,
  type EditorImage,
} from "@/types";
import { imageMimeTypes } from "@/config";
import { OptionsPanel } from "@/components/OptionsPanel";
import { ImageHandlingArea } from "@/components/ImageHandlingArea";
import { ImageQueue } from "@/components/ImageQueue";
import { ResultGallery } from "@/components/ResultGallery";
import { Header } from "@/components/Header";
import { loadSettings, saveSettings, loadFinishedImages, addFinishedImage } from "@/utils/localStorage";
import { translateWithJsonStream } from "@/utils/translateJson";
import { initEditableBlocks } from "@/utils/initEditableBlocks";
import { useEditor } from "@/context/EditorContext";

export const App: React.FC = () => {
  const navigate = useNavigate();
  const { setImages: setEditorImages } = useEditor();

  // State Hooks
  const [fileStatuses, setFileStatuses] = useState<Map<string, FileStatus>>(
    new Map()
  );
  const [shouldTranslate, setShouldTranslate] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  // New state for improved UI features
  const [queuedImages, setQueuedImages] = useState<QueuedImage[]>([]);
  const [finishedImages, setFinishedImages] = useState<FinishedImage[]>([]);
  const [currentProcessingImage, setCurrentProcessingImage] = useState<QueuedImage | null>(null);

  // Editor data collected during JSON translation
  const [editorImagesData, setEditorImagesData] = useState<EditorImage[]>([]);

  // Translation Options State Hooks
  // Initialize settings from localStorage to survive navigation
  const [savedSettings] = useState(() => loadSettings());
  const [detectionResolution, setDetectionResolution] = useState(savedSettings.detectionResolution || "1536");
  const [textDetector, setTextDetector] = useState(savedSettings.textDetector || "default");
  const [renderTextDirection, setRenderTextDirection] = useState(savedSettings.renderTextDirection || "auto");
  const [translator, setTranslator] = useState<TranslatorKey>(savedSettings.translator || "youdao");
  const [targetLanguage, setTargetLanguage] = useState(savedSettings.targetLanguage || "THA");

  const [inpaintingSize, setInpaintingSize] = useState(savedSettings.inpaintingSize || "2048");
  const [customUnclipRatio, setCustomUnclipRatio] = useState<number>(savedSettings.customUnclipRatio ?? 2.3);
  const [customBoxThreshold, setCustomBoxThreshold] = useState<number>(savedSettings.customBoxThreshold ?? 0.7);
  const [maskDilationOffset, setMaskDilationOffset] = useState<number>(savedSettings.maskDilationOffset ?? 30);
  const [inpainter, setInpainter] = useState(savedSettings.inpainter || "default");

  // Computed State (useMemo)
  const isProcessing = useMemo(() => {
    // If there are no files or no statuses, we're not processing
    if (files.length === 0 || fileStatuses.size === 0) return false;

    // Check if any file has a processing status
    return Array.from(fileStatuses.values()).some((fileStatus) => {
      if (!fileStatus || fileStatus.status === null) return false;
      return processingStatuses.includes(fileStatus.status);
    });
  }, [files, fileStatuses]);

  const isProcessingAllFinished = useMemo(() => {
    // If there are no files or no statuses, we're not finished
    if (files.length === 0 || fileStatuses.size === 0) return false;

    // Check if all files are finished
    return Array.from(fileStatuses.values()).every((status) => {
      if (!status || status.status === null) return false;
      return status.status === "finished";
    });
  }, [files, fileStatuses]);

  // Effects
  // Settings are loaded via useState initializers above (no useEffect needed)

  /** Save settings to localStorage whenever they change */
  useEffect(() => {
    const settings: TranslationSettings = {
      detectionResolution,
      textDetector,
      renderTextDirection,
      translator,
      targetLanguage,
      inpaintingSize,
      customUnclipRatio,
      customBoxThreshold,
      maskDilationOffset,
      inpainter,
    };
    saveSettings(settings);
  }, [
    detectionResolution,
    textDetector,
    renderTextDirection,
    translator,
    targetLanguage,
    inpaintingSize,
    customUnclipRatio,
    customBoxThreshold,
    maskDilationOffset,
    inpainter,
  ]);

  /** クリップボード ペースト対応 */
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.kind === "file") {
          const pastedFile = item.getAsFile();
          if (pastedFile && imageMimeTypes.includes(pastedFile.type)) {
            setFiles((prev) => [...prev, pastedFile]);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste as EventListener);
    return () =>
      window.removeEventListener("paste", handlePaste as EventListener);
  }, []);

  useEffect(() => {
    if (shouldTranslate) {
      processTranslation();
      setShouldTranslate(false);
    }
  }, [fileStatuses]);

  // Event Handlers
  /** フォーム再セット */
  const clearForm = () => {
    setFiles([]);
    setFileStatuses(() => new Map());
  };

  /** ドラッグ＆ドロップ対応 */
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    const validFiles = droppedFiles.filter((file) =>
      imageMimeTypes.includes(file.type)
    );
    setFiles((prev) => [...prev, ...validFiles]);
  };

  /** ファイル選択時 */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter((file) =>
      imageMimeTypes.includes(file.type)
    );
    setFiles((prev) => [...prev, ...validFiles]);
  };

  // Remove file handler
  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((file) => file.name !== fileName));
    setFileStatuses((prev) => {
      const newStatuses = new Map(prev);
      newStatuses.delete(fileName);
      return newStatuses;
    });
  };

  // Queue management functions
  const addToQueue = (newFiles: File[]) => {
    const newQueuedImages: QueuedImage[] = newFiles.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      addedAt: new Date(),
      status: 'queued' as const,
    }));
    setQueuedImages(prev => [...prev, ...newQueuedImages]);
  };

  const removeFromQueue = (id: string) => {
    setQueuedImages(prev => prev.filter(img => img.id !== id));
  };

  const clearGallery = () => {
    setFinishedImages([]);
    localStorage.removeItem('manga-translator-finished-images');
  };

  const openEditor = () => {
    if (editorImagesData.length > 0) {
      setEditorImages(editorImagesData);
      navigate("/editor");
    }
  };

  /**
   * フォーム送信 (翻訳リクエスト)
   */
  const handleSubmit = () => {
    if (files.length === 0) return;

    resetFileStatuses();
    setShouldTranslate(true);
  };

  // Translation Processing - Configeration
  const buildTranslationConfig = (): string => {
    return JSON.stringify({
      detector: {
        detector: textDetector,
        detection_size: detectionResolution,
        box_threshold: customBoxThreshold,
        unclip_ratio: customUnclipRatio,
      },
      render: {
        direction: renderTextDirection,
      },
      translator: {
        translator: translator,
        target_lang: targetLanguage,
      },
      inpainter: {
        inpainter: inpainter,
        inpainting_size: inpaintingSize,
      },
      mask_dilation_offset: maskDilationOffset,
    });
  };

  // Translation Processing - Network Request
  const requestTranslation = async (file: File, config: string) => {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("config", config);

    const response = await fetch(`/api/translate/with-form/json/stream`, {
      method: "POST",
      body: formData,
    });

    if (response.status !== 200) {
      throw new Error("Upload failed");
    }

    return response;
  };

  // Translation Processing - Chunk Processing
  const processChunk = async (
    value: Uint8Array,
    fileId: string,
    currentBuffer: Uint8Array
  ): Promise<ChunkProcessingResult> => {
    // Check for existing errors first
    if (fileStatuses.get(fileId)?.error) {
      throw new Error(
        `Processing stopped due to previous error for file ${fileId}`
      );
    }

    // Combine buffers
    const newBuffer = new Uint8Array(currentBuffer.length + value.length);
    newBuffer.set(currentBuffer);
    newBuffer.set(value, currentBuffer.length);
    let processedBuffer = newBuffer;

    // Process all complete messages in buffer
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

  // Translation Processing - Single File Stream Processing
  const processSingleFileStream = async (file: File, config: string) => {
    try {
      const response = await requestTranslation(file, config);
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get stream reader");
      }

      let fileBuffer = new Uint8Array();

      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;

        try {
          const result = await processChunk(value, file.name, fileBuffer);
          fileBuffer = result.updatedBuffer;
        } catch (error) {
          console.error(`Error processing chunk for ${file.name}:`, error);
          updateFileStatus(file.name, {
            status: "error",
            error:
              error instanceof Error ? error.message : "Error processing chunk",
          });
        }
      }
    } catch (err) {
      console.error("Error processing file: ", file.name, err);
      updateFileStatus(file.name, {
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  // Translation Processing - Overall Translation Batch Process
  const processTranslation = async () => {
    const config = buildTranslationConfig();

    // Process all files in parallel
    try {
      await Promise.all(
        files.map((file) => processSingleFileStream(file, config))
      );
    } catch (err) {
      console.error("Translation process failed:", err);
    }
  };

  // Helper to reset file statuses
  const resetFileStatuses = () => {
    // Initialize status for all files
    const newStatuses = new Map();
    files.forEach((file) => {
      newStatuses.set(file.name, {
        status: null,
        progress: null,
        queuePos: null,
        result: null,
        error: null,
      });
    });
    setFileStatuses(newStatuses);
  };

  // Helper to update status for a specific file
  const updateFileStatus = (fileId: string, update: Partial<FileStatus>) => {
    setFileStatuses((prev) => {
      const newStatuses = new Map(prev);
      const currentStatus = newStatuses.get(fileId) || {
        status: null,
        progress: null,
        queuePos: null,
        result: null,
        error: null,
      };
      const updatedStatus = { ...currentStatus, ...update };
      newStatuses.set(fileId, updatedStatus);
      return newStatuses;
    });
  };

  // Helper to process status updates
  const processStatusUpdate = (
    statusCode: number,
    decodedData: string,
    fileId: string,
    data: Uint8Array
  ): void => {
    switch (statusCode) {
      case 0: { // 結果が返ってきた — now JSON response
        const decodedJson = new TextDecoder("utf-8").decode(data);
        let parsed: TranslationResponseJson;
        try {
          parsed = JSON.parse(decodedJson);
          console.log("[case 0] Parsed JSON successfully, translations:", parsed.translations?.length, "has inpainted_image:", !!parsed.inpainted_image);
        } catch (e) {
          console.error("[case 0] JSON parse failed, falling back to blob. Error:", e, "data length:", data.length, "first 100 chars:", decodedJson.substring(0, 100));
          // Fallback: treat as image blob if JSON parse fails
          const resultBlob = new Blob([data], { type: "image/png" });
          updateFileStatus(fileId, { status: "finished", result: resultBlob });
          break;
        }

        // Create preview blob from rendered image (with translated text burned in)
        // Fall back to inpainted_image, then original file
        let resultBlob: Blob;
        const previewB64 = parsed.rendered_image || parsed.inpainted_image;
        if (previewB64) {
          const b64 = previewB64.split(",")[1];
          console.log("[case 0] preview image b64 length:", b64?.length, "source:", parsed.rendered_image ? "rendered" : "inpainted");
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resultBlob = new Blob([bytes], { type: "image/png" });
          console.log("[case 0] Created blob, size:", resultBlob.size, "type:", resultBlob.type);
        } else {
          console.warn("[case 0] No rendered/inpainted image in response, using original file");
          const matchingOriginal = files.find((f) => f.name === fileId);
          resultBlob = matchingOriginal ?? new Blob([], { type: "image/png" });
        }

        updateFileStatus(fileId, { status: "finished", result: resultBlob });

        // Collect editor data
        const matchingFile = files.find((f) => f.name === fileId);
        if (matchingFile) {
          const editorImage: EditorImage = {
            id: `${fileId}-${Date.now()}`,
            originalFile: matchingFile,
            translationResponse: parsed,
            editableBlocks: initEditableBlocks(parsed.translations, targetLanguage),
            isDirty: false,
          };
          setEditorImagesData((prev) => [...prev, editorImage]);
        }

        // Add to finished images gallery
        const settings: TranslationSettings = {
          detectionResolution,
          textDetector,
          renderTextDirection,
          translator,
          targetLanguage,
          inpaintingSize,
          customUnclipRatio,
          customBoxThreshold,
          maskDilationOffset,
          inpainter,
        };

        const finishedImage: FinishedImage = {
          id: `${fileId}-${Date.now()}`,
          originalName: fileId,
          result: resultBlob,
          finishedAt: new Date(),
          settings,
        };

        setFinishedImages((prev) => [finishedImage, ...prev]);
        addFinishedImage(finishedImage);
        break;
      }
      case 1: // 翻訳中
        const newStatus = decodedData as StatusKey;
        updateFileStatus(fileId, { status: newStatus });
        break;
      case 2: // エラー
        updateFileStatus(fileId, {
          status: "error",
          error: decodedData,
        });
        break;
      case 3: // キューに追加された
        updateFileStatus(fileId, {
          status: "pending",
          queuePos: decodedData,
        });
        break;
      case 4: // キューがクリアされた
        updateFileStatus(fileId, {
          status: "pending",
          queuePos: null,
        });
        break;
      default: // 未知のステータスコード
        console.warn(`Unknown status code ${statusCode} for file ${fileId}`);
        break;
    }
  };

  return (
    <div>
      <Header />
      <div className="bg-gray-100 min-h-screen flex flex-col pt-10 items-center">
        <div className="bg-white shadow-md rounded-lg p-6 w-full max-w-6xl space-y-6">
          <OptionsPanel
            detectionResolution={detectionResolution}
            textDetector={textDetector}
            renderTextDirection={renderTextDirection}
            translator={translator}
            targetLanguage={targetLanguage}
            inpaintingSize={inpaintingSize}
            customUnclipRatio={customUnclipRatio}
            customBoxThreshold={customBoxThreshold}
            maskDilationOffset={maskDilationOffset}
            inpainter={inpainter}
            setDetectionResolution={setDetectionResolution}
            setTextDetector={setTextDetector}
            setRenderTextDirection={setRenderTextDirection}
            setTranslator={setTranslator}
            setTargetLanguage={setTargetLanguage}
            setInpaintingSize={setInpaintingSize}
            setCustomUnclipRatio={setCustomUnclipRatio}
            setCustomBoxThreshold={setCustomBoxThreshold}
            setMaskDilationOffset={setMaskDilationOffset}
            setInpainter={setInpainter}
          />
          
          {/* Image Queue Section */}
          <div className="border-t pt-6">
            <ImageQueue
              queuedImages={queuedImages}
              onRemoveFromQueue={removeFromQueue}
              onAddToQueue={addToQueue}
              isProcessing={isProcessing}
            />
          </div>

          {/* Main Image Handling Area */}
          <div className="border-t pt-6">
            <ImageHandlingArea
              files={files}
              fileStatuses={fileStatuses}
              isProcessing={isProcessing}
              isProcessingAllFinished={isProcessingAllFinished}
              handleFileChange={handleFileChange}
              handleDrop={handleDrop}
              handleSubmit={handleSubmit}
              clearForm={clearForm}
              removeFile={removeFile}
            />
          </div>

          {/* Open in Editor */}
          {editorImagesData.length > 0 && (
            <div className="border-t pt-6 flex justify-center">
              <button
                onClick={openEditor}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors font-medium shadow-md"
              >
                Open in Editor ({editorImagesData.length} image{editorImagesData.length > 1 ? "s" : ""})
              </button>
            </div>
          )}

          {/* Results Gallery */}
          <div className="border-t pt-6">
            <ResultGallery
              finishedImages={finishedImages}
              onClearGallery={clearGallery}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
