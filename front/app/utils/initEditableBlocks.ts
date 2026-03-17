import type { TranslationBlock, EditableBlock } from "@/types";
import { getFontForLang } from "./fontMap";
import { segmentWords } from "./textSegment";

// Map config language codes to full names used by the translation backend
const LANG_CODE_TO_NAME: Record<string, string> = {
  CHS: "Chinese (Simplified)",
  CHT: "Chinese (Traditional)",
  ENG: "English",
  JPN: "Japanese",
  KOR: "Korean",
  THA: "Thai",
  VIN: "Vietnamese",
  FRA: "French",
  DEU: "German",
  ESP: "Spanish",
  ITA: "Italian",
  PTB: "Portuguese",
  RUS: "Russian",
  ARA: "Arabic",
  IND: "Indonesian",
  FIL: "Filipino (Tagalog)",
};

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function findTranslatedText(
  textDict: Record<string, string>,
  targetLang: string,
  sourceLang?: string
): string {
  // Try exact code match first (e.g. "THA")
  if (textDict[targetLang]) return textDict[targetLang];

  // Try full language name (e.g. "Thai")
  const fullName = LANG_CODE_TO_NAME[targetLang];
  if (fullName && textDict[fullName]) return textDict[fullName];

  // Try case-insensitive match
  const targetLower = targetLang.toLowerCase();
  for (const [key, value] of Object.entries(textDict)) {
    if (key.toLowerCase() === targetLower) return value;
  }

  // Fall back to any non-source language entry
  if (sourceLang) {
    const sourceFullName = LANG_CODE_TO_NAME[sourceLang];
    for (const [key, value] of Object.entries(textDict)) {
      if (key !== sourceLang && key !== sourceFullName) return value;
    }
  }

  // Last resort: last entry (translations are usually appended after source)
  const values = Object.values(textDict);
  return values[values.length - 1] ?? "";
}

/**
 * Shrink font size until the translated text fits within the given dimensions.
 * Uses canvas measureText + word-wrap simulation to estimate line count.
 */
function autoFitFontSize(
  text: string,
  width: number,
  height: number,
  startSize: number,
  fontFamily: string,
  lineSpacing: number = 1.5,
  minSize: number = 8
): number {
  if (typeof document === "undefined" || !text) return startSize;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return startSize;

  let fontSize = startSize;

  while (fontSize > minSize) {
    ctx.font = `${fontSize}px "${fontFamily}"`;
    const words = segmentWords(text);
    let lines = 1;
    let currentLineWidth = 0;

    for (const word of words) {
      const wordWidth = ctx.measureText(word).width;
      if (currentLineWidth + wordWidth > width && currentLineWidth > 0) {
        lines++;
        currentLineWidth = word.trim() === "" ? 0 : wordWidth;
      } else {
        currentLineWidth += wordWidth;
      }
    }

    const totalHeight = lines * fontSize * lineSpacing;
    if (totalHeight <= height) break;
    fontSize -= 1;
  }

  canvas.width = 0;
  canvas.height = 0;
  return Math.max(fontSize, minSize);
}

export function initEditableBlocks(
  blocks: TranslationBlock[],
  targetLang: string
): EditableBlock[] {
  return blocks.map((block, index) => {
    const translatedText = findTranslatedText(
      block.text,
      targetLang,
      block.source_lang
    );
    const [fr, fg, fb] = block.text_color.fg;

    return {
      ...block,
      id: `block-${index}`,
      editedText: translatedText,
      editedX: block.minX,
      editedY: block.minY,
      editedWidth: block.maxX - block.minX,
      editedHeight: block.maxY - block.minY,
      editedFontSize: autoFitFontSize(
        translatedText,
        block.maxX - block.minX,
        block.maxY - block.minY,
        block.font_size > 0 ? block.font_size : 24,
        getFontForLang(targetLang || block.target_lang)
      ),
      editedFontFamily: getFontForLang(targetLang || block.target_lang),
      editedColor: rgbToHex(fr, fg, fb),
      editedLetterSpacing: block.letter_spacing,
      editedLineSpacing: 1.5,
      editedBold: block.bold,
      editedItalic: block.italic,
      editedAlignment: block.alignment === "auto" ? "center" : block.alignment,
      editedStrokeEnabled: false,
      editedStrokeColor: "#000000",
      editedStrokeWidth: 3,
      hidden: false,
    };
  });
}
