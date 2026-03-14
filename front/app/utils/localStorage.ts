import type { TranslationSettings, FinishedImage } from '@/types';

const SETTINGS_KEY = 'manga-translator-settings';
const FINISHED_IMAGES_KEY = 'manga-translator-finished-images';

export const loadSettings = (): Partial<TranslationSettings> => {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error);
    return {};
  }
};

export const saveSettings = (settings: TranslationSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to save settings to localStorage:', error);
  }
};

// Note: FinishedImage contains Blob data which cannot be serialized to localStorage.
// These functions are kept as no-ops to avoid breaking callers.
// Finished images only persist within the current session.
export const loadFinishedImages = (): FinishedImage[] => {
  return [];
};

export const saveFinishedImages = (_images: FinishedImage[]): void => {
  // no-op: Blobs cannot be stored in localStorage
};

export const addFinishedImage = (_image: FinishedImage): void => {
  // no-op: Blobs cannot be stored in localStorage
}; 