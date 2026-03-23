/**
 * Directly load fonts via FontFace API with explicit URLs.
 * Each font loads both Thai and Latin subsets so that punctuation like "?", "!"
 * and numbers render in the same font instead of falling back to a system font.
 */

const FONT_URLS: Record<string, string[]> = {
  Kanit: [
    "https://fonts.gstatic.com/s/kanit/v17/nKKZ-Go6G5tXcraBGwCKd6xBDFs.woff2", // thai
    "https://fonts.gstatic.com/s/kanit/v17/nKKZ-Go6G5tXcraVGwCKd6xB.woff2",     // latin
  ],
  Itim: [
    "https://fonts.gstatic.com/s/itim/v16/0nknC9ziJOYe8BdAkOzaZwTSoQ.woff2", // thai
    "https://fonts.gstatic.com/s/itim/v16/0nknC9ziJOYe8ANAkOzaZwQ.woff2",     // latin
  ],
  Sarabun: [
    "https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aAFJn3YO5gjupg.woff2", // thai
    "https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9aBVJn3YO5gg.woff2",     // latin
  ],
  Prompt: [
    "https://fonts.gstatic.com/s/prompt/v12/-W__XJnvUD7dzB2KdNodREEje60k.woff2", // thai
    "https://fonts.gstatic.com/s/prompt/v12/-W__XJnvUD7dzB2KYNodREEjew.woff2",   // latin
  ],
  Mitr: [
    "https://fonts.gstatic.com/s/mitr/v13/pxiLypw5ucZF-Sg4Mbr8f1t9EQ.woff2", // thai
    "https://fonts.gstatic.com/s/mitr/v13/pxiLypw5ucZF-Tw4Mbr8f1s.woff2",     // latin
  ],
  Niramit: [
    "https://fonts.gstatic.com/s/niramit/v12/I_uuMpWdvgLdNxVLXadakwKso5f4bA.woff2", // thai
    "https://fonts.gstatic.com/s/niramit/v12/I_uuMpWdvgLdNxVLXbNakwKso5c.woff2",     // latin
  ],
  K2D: [
    "https://fonts.gstatic.com/s/k2d/v13/J7aTnpF2V0EjZKUsvrQw7qNL.woff2", // thai
    "https://fonts.gstatic.com/s/k2d/v13/J7aTnpF2V0EjcKUsvrQw7g.woff2",   // latin
  ],
  Kodchasan: [
    "https://fonts.gstatic.com/s/kodchasan/v20/1cXxaUPOAJv9sG4I-DJWnHGFq8Kk1doH.woff2", // thai
    "https://fonts.gstatic.com/s/kodchasan/v20/1cXxaUPOAJv9sG4I-DJWiHGFq8Kk1Q.woff2",   // latin
  ],
  Krub: [
    "https://fonts.gstatic.com/s/krub/v11/sZlLdRyC6CRYblUaDZtQS6AvcA.woff2", // thai
    "https://fonts.gstatic.com/s/krub/v11/sZlLdRyC6CRYbkEaDZtQS6A.woff2",     // latin
  ],
  "Bai Jamjuree": [
    "https://fonts.gstatic.com/s/baijamjuree/v13/LDI1apSCOBt_aeQQ7ftydoa8SsLLubg58xGL.woff2", // thai
    "https://fonts.gstatic.com/s/baijamjuree/v13/LDI1apSCOBt_aeQQ7ftydoa8XsLLubg58w.woff2",   // latin
  ],
  "Chakra Petch": [
    "https://fonts.gstatic.com/s/chakrapetch/v13/cIf6MapbsEk7TDLdtEz1BwkWi6pgar3I1D8t.woff2", // thai
    "https://fonts.gstatic.com/s/chakrapetch/v13/cIf6MapbsEk7TDLdtEz1BwkWn6pgar3I1A.woff2",   // latin
  ],
  Pridi: [
    "https://fonts.gstatic.com/s/pridi/v15/2sDQZG5JnZLfkcWJqWgJbU28O7w.woff2", // thai
    "https://fonts.gstatic.com/s/pridi/v15/2sDQZG5JnZLfkcWdqWgJbU28.woff2",     // latin
  ],
  Charm: [
    "https://fonts.gstatic.com/s/charm/v14/7cHmv4oii5K0MdY8K-4W4nIppT4.woff2", // thai
    "https://fonts.gstatic.com/s/charm/v14/7cHmv4oii5K0MdYoK-4W4nIp.woff2",     // latin
  ],
  Chonburi: [
    "https://fonts.gstatic.com/s/chonburi/v14/8AtqGs-wOpGRTBq66LWJHLz5ixfYPzM.woff2", // thai
    "https://fonts.gstatic.com/s/chonburi/v14/8AtqGs-wOpGRTBq66LWdHLz5ixfY.woff2",     // latin
  ],
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

  const urls = FONT_URLS[family];
  if (!urls || typeof document === "undefined") {
    // No direct URL known — fall back to document.fonts.ready
    const p = document.fonts.ready.then(() => {
      fontsLoaded.add(family);
    });
    fontLoadPromises.set(family, p);
    return p;
  }

  const p = (async () => {
    try {
      // Load all subsets (thai + latin) under the same family name.
      // The browser composites them so both Thai and Latin characters render correctly.
      const loadPromises = urls.map(async (url) => {
        const fontFace = new FontFace(family, `url(${url})`, {
          style: "normal",
          weight: "400",
        });
        const loaded = await fontFace.load();
        document.fonts.add(loaded);
      });
      await Promise.all(loadPromises);
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
 * Preload the default font (Kanit). Other fonts load on-demand when selected.
 */
export function preloadAllFonts(): Promise<void[]> {
  return Promise.all(["Kanit"].map(loadFont));
}
