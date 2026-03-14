export type StatusKey =
  | "upload"
  | "pending"
  | "detection"
  | "ocr"
  | "textline_merge"
  | "mask-generation"
  | "inpainting"
  | "upscaling"
  | "translating"
  | "rendering"
  | "finished"
  | "error"
  | "error-upload"
  | "error-lang"
  | "error-translating"
  | "error-too-large"
  | "error-disconnect"
  | null;

export interface ChunkProcessingResult {
  updatedBuffer: Uint8Array;
}

export const processingStatuses = [
  "upload",
  "pending",
  "detection",
  "ocr",
  "textline_merge",
  "mask-generation",
  "inpainting",
  "upscaling",
  "translating",
  "rendering",
];

export type TranslatorKey =  
  | "youdao"  
  | "baidu"  
  | "deepl"  
  | "papago"  
  | "caiyun"  
  | "sakura"  
  | "offline"  
  | "openai"  
  | "deepseek"  
  | "groq"  
  | "gemini"  
  | "custom_openai"  
  | "nllb"  
  | "nllb_big"  
  | "sugoi"  
  | "jparacrawl"  
  | "jparacrawl_big"  
  | "m2m100"  
  | "m2m100_big"  
  | "mbart50"  
  | "qwen2"  
  | "qwen2_big"  
  | "none";  

export const validTranslators: TranslatorKey[] = [  
  "youdao",  
  "baidu",  
  "deepl",  
  "papago",  
  "caiyun",  
  "sakura",  
  "offline",  
  "openai",  
  "deepseek",  
  "groq",  
  "gemini",  
  "custom_openai",  
  "nllb",  
  "nllb_big",  
  "sugoi",  
  "jparacrawl",  
  "jparacrawl_big",  
  "m2m100",  
  "m2m100_big",  
  "mbart50",  
  "qwen2",  
  "qwen2_big",  
  "none",  
];  

export interface FileStatus {
  status: StatusKey | null;
  progress: string | null;
  queuePos: string | null;
  result: Blob | null;
  error: string | null;
}

// New types for the improved UI
export interface QueuedImage {
  id: string;
  file: File;
  addedAt: Date;
  status: 'queued' | 'processing' | 'finished' | 'error';
  result?: Blob;
  error?: string;
}

export interface TranslationSettings {
  detectionResolution: string;
  textDetector: string;
  renderTextDirection: string;
  translator: TranslatorKey;
  targetLanguage: string;
  inpaintingSize: string;
  customUnclipRatio: number;
  customBoxThreshold: number;
  maskDilationOffset: number;
  inpainter: string;
}

export interface FinishedImage {
  id: string;
  originalName: string;
  result: Blob;
  finishedAt: Date;
  settings: TranslationSettings;
}

// --- Editor types ---

export interface TextColor {
  fg: [number, number, number];
  bg: [number, number, number];
}

export interface TranslationBlock {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  is_bulleted_list: boolean;
  angle: number;
  prob: number;
  text_color: TextColor;
  text: Record<string, string>;
  background: string;
  font_size: number;
  direction: string;
  alignment: string;
  line_spacing: number;
  letter_spacing: number;
  bold: boolean;
  italic: boolean;
  source_lang: string;
  target_lang: string;
}

export interface EditableBlock extends TranslationBlock {
  id: string;
  editedText: string;
  editedX: number;
  editedY: number;
  editedWidth: number;
  editedHeight: number;
  editedFontSize: number;
  editedFontFamily: string;
  editedColor: string;
  editedLetterSpacing: number;
  editedLineSpacing: number;
  editedBold: boolean;
  editedItalic: boolean;
  editedAlignment: string;
  editedStrokeEnabled: boolean;
  editedStrokeColor: string;
  editedStrokeWidth: number;
  hidden: boolean;
}

export interface TranslationResponseJson {
  translations: TranslationBlock[];
  inpainted_image: string | null;
  rendered_image: string | null;
  debug_folder: string | null;
}

export interface EditorImage {
  id: string;
  originalFile: File;
  translationResponse: TranslationResponseJson;
  editableBlocks: EditableBlock[];
  isDirty: boolean;
}
