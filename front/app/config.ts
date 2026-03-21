export const languageOptions = [
  { value: "CHS", label: "简体中文" },
  { value: "CHT", label: "繁體中文" },
  { value: "CSY", label: "čeština" },
  { value: "NLD", label: "Nederlands" },
  { value: "ENG", label: "English" },
  { value: "FRA", label: "français" },
  { value: "DEU", label: "Deutsch" },
  { value: "HUN", label: "magyar nyelv" },
  { value: "ITA", label: "italiano" },
  { value: "JPN", label: "日本語" },
  { value: "KOR", label: "한국어" },
  { value: "POL", label: "polski" },
  { value: "PTB", label: "português" },
  { value: "ROM", label: "limba română" },
  { value: "RUS", label: "русский язык" },
  { value: "ESP", label: "español" },
  { value: "TRK", label: "Türk dili" },
  { value: "UKR", label: "українська мова" },
  { value: "VIN", label: "Tiếng Việt" },
  { value: "ARA", label: "العربية" },
  { value: "CNR", label: "crnogorski jezik" },
  { value: "SRP", label: "српски језик" },
  { value: "HRV", label: "hrvatski jezik" },
  { value: "THA", label: "ภาษาไทย" },
  { value: "IND", label: "Indonesia" },
  { value: "FIL", label: "Wikang Filipino" }
];

export type LocalizedOption = {
  value: string;
  label: { th: string; en: string };
  description?: { th: string; en: string };
};

export const detectionResolutions = [1024, 1536, 2048, 2560];

export const inpaintingSizes = [516, 1024, 2048, 2560];

export const textDetectorOptions: LocalizedOption[] = [
  {
    value: "default",
    label: { th: "ค่าเริ่มต้น", en: "Default" },
    description: { th: "ใช้ DBNET เหมาะกับมังงะทั่วไป", en: "DBNET — good all-round detector for manga" },
  },
  {
    value: "ctd",
    label: { th: "CTD", en: "CTD" },
    description: { th: "ตรวจจับข้อความแบบ Comic Text — แม่นยำกับบับเบิ้ลมังงะ", en: "Comic Text Detector — accurate for manga speech bubbles" },
  },
  {
    value: "paddle",
    label: { th: "Paddle", en: "Paddle" },
    description: { th: "PaddleOCR — ดีกับข้อความหลายภาษาและฉากจริง", en: "PaddleOCR — good for multilingual and real-scene text" },
  },
];

export const inpainterOptions: LocalizedOption[] = [
  {
    value: "lama_large",
    label: { th: "Lama Large", en: "Lama Large" },
    description: { th: "เร็ว ใช้ VRAM น้อย เหมาะกับงานส่วนใหญ่", en: "Fast, low VRAM — works well for most cases" },
  },
  {
    value: "sdxl",
    label: { th: "SDXL", en: "SDXL" },
    description: { th: "คุณภาพสูงสุด ใช้ VRAM มาก ช้ากว่า", en: "Highest quality, high VRAM, slower" },
  },
];

export const detectionResolutionOptions: LocalizedOption[] = [
  {
    value: "1024",
    label: { th: "1024px", en: "1024px" },
    description: { th: "เร็วที่สุด แต่อาจพลาดข้อความเล็ก", en: "Fastest, may miss small text" },
  },
  {
    value: "1536",
    label: { th: "1536px (แนะนำ)", en: "1536px (recommended)" },
    description: { th: "สมดุลระหว่างความเร็วและความแม่นยำ", en: "Balanced speed and accuracy" },
  },
  {
    value: "2048",
    label: { th: "2048px", en: "2048px" },
    description: { th: "แม่นยำขึ้น ใช้เวลามากขึ้น", en: "More accurate, slower" },
  },
  {
    value: "2560",
    label: { th: "2560px", en: "2560px" },
    description: { th: "แม่นยำสูงสุด ช้าที่สุด", en: "Most accurate, slowest" },
  },
];

export const inpaintingSizeOptions: LocalizedOption[] = [
  {
    value: "516",
    label: { th: "516px", en: "516px" },
    description: { th: "เร็วที่สุด คุณภาพต่ำ", en: "Fastest, lower quality" },
  },
  {
    value: "1024",
    label: { th: "1024px", en: "1024px" },
    description: { th: "สมดุลความเร็วและคุณภาพ", en: "Balanced speed and quality" },
  },
  {
    value: "2048",
    label: { th: "2048px (แนะนำ)", en: "2048px (recommended)" },
    description: { th: "คุณภาพดี เหมาะกับงานส่วนใหญ่", en: "Good quality, suits most cases" },
  },
  {
    value: "2560",
    label: { th: "2560px", en: "2560px" },
    description: { th: "คุณภาพสูงสุด ช้าที่สุด", en: "Highest quality, slowest" },
  },
];

export const imageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/bmp",
  "image/webp",
];
