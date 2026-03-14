/**
 * Directly load fonts via FontFace API with explicit URLs.
 * This bypasses Google Fonts CSS unicode-range subsetting issues
 * where document.fonts.check() returns true for Latin but Thai subset isn't loaded.
 */

const FONT_URLS: Record<string, string> = {
  Kanit:
    "https://fonts.gstatic.com/s/kanit/v15/nKKZ-Go6G5tXcraBGwCKd6xBDFs.woff2",
  Itim:
    "https://fonts.gstatic.com/s/itim/v14/0nknC9ziJOYewARKkc7ZdwU.woff2",
};

// Track loading state
const fontLoadPromises = new Map<string, Promise<void>>();
const fontsLoaded = new Set<string>();

export function isFontLoaded(family: string): boolean {
  return fontsLoaded.has(family);
}

export function loadFont(family: string): Promise<void> {
  if (fontsLoaded.has(family)) return Promise.resolve();

  if (fontLoadPromises.has(family)) return fontLoadPromises.get(family)!;

  const url = FONT_URLS[family];
  if (!url || typeof document === "undefined") {
    // No direct URL known — fall back to document.fonts.ready
    const p = document.fonts.ready.then(() => {
      fontsLoaded.add(family);
    });
    fontLoadPromises.set(family, p);
    return p;
  }

  const p = (async () => {
    try {
      const fontFace = new FontFace(family, `url(${url})`, {
        style: "normal",
        weight: "400",
      });
      const loaded = await fontFace.load();
      document.fonts.add(loaded);
      fontsLoaded.add(family);
    } catch (err) {
      console.warn(`[fontLoader] Failed to load ${family}:`, err);
      // Still mark as "loaded" to avoid infinite retry
      fontsLoaded.add(family);
    }
  })();

  fontLoadPromises.set(family, p);
  return p;
}

/**
 * Preload all known fonts. Call this early (e.g., in root.tsx or on app init).
 */
export function preloadAllFonts(): Promise<void[]> {
  return Promise.all(Object.keys(FONT_URLS).map(loadFont));
}
