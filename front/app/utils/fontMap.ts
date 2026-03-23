export const defaultFontByLang: Record<string, string> = {
  THA: "Kanit",
  JPN: "Noto Sans JP",
  KOR: "Noto Sans KR",
  CHS: "Noto Sans SC",
  CHT: "Noto Sans SC",
  ENG: "Inter",
  VIE: "Inter",
  FRA: "Inter",
  DEU: "Inter",
  ESP: "Inter",
  ITA: "Inter",
  POR: "Inter",
  RUS: "Inter",
  ARA: "Noto Sans Arabic",
};

export const availableFonts = [
  "Kanit",
  "Itim",
  "Sarabun",
  "Prompt",
  "Mitr",
  "Niramit",
  "K2D",
  "Kodchasan",
  "Krub",
  "Bai Jamjuree",
  "Chakra Petch",
  "Pridi",
  "Charm",
  "Chonburi",
];

export function getFontForLang(lang: string): string {
  return defaultFontByLang[lang] || "Inter";
}
