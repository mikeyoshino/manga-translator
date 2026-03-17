/**
 * Shared text segmentation utilities using Intl.Segmenter.
 * Thai (and other scripts without spaces) need word-level segmentation
 * for correct line-wrapping and font-size fitting.
 */

// Cache Intl.Segmenter instances
let _graphemeSegmenter: any | null = null;
function getGraphemeSegmenter() {
  if (_graphemeSegmenter) return _graphemeSegmenter;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    _graphemeSegmenter = new (Intl as any).Segmenter(undefined, {
      granularity: "grapheme",
    });
  }
  return _graphemeSegmenter;
}

let _wordSegmenter: any | null = null;
function getWordSegmenter() {
  if (_wordSegmenter) return _wordSegmenter;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    _wordSegmenter = new (Intl as any).Segmenter("th", {
      granularity: "word",
    });
  }
  return _wordSegmenter;
}

export function segmentGraphemes(text: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s: any) => s.segment);
  }
  return [...text];
}

export function segmentWords(text: string): string[] {
  const segmenter = getWordSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(text), (s: any) => s.segment);
  }
  return text.split(/(\s+)/);
}
