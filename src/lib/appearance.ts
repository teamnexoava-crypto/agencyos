/**
 * Accent colour themes and font styles (see src/styles/appearance.css). They are a personal
 * preference, kept in this browser, and applied to <html> as data attributes before first paint by
 * public/theme-init.js – keep the storage keys in sync with that file.
 */
export const ACCENT_STORAGE_KEY = "aos-accent";
export const FONT_STORAGE_KEY = "aos-font";

export const ACCENTS = [
  { id: "indigo", name: "Indigo", swatch: "#4f46e5" },
  { id: "violet", name: "Violet", swatch: "#7c3aed" },
  { id: "blue", name: "Ocean", swatch: "#2563eb" },
  { id: "teal", name: "Teal", swatch: "#0f766e" },
  { id: "emerald", name: "Emerald", swatch: "#059669" },
  { id: "rose", name: "Rose", swatch: "#e11d48" },
  { id: "saffron", name: "Saffron", swatch: "#d9480f" },
  { id: "graphite", name: "Graphite", swatch: "#27272a" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];

export const FONT_STYLES = [
  { id: "modern", name: "Modern", description: "Geist text, Plus Jakarta headings", sample: '"Plus Jakarta Sans Variable", sans-serif' },
  { id: "clean", name: "Clean", description: "Inter – crisp and neutral", sample: '"Inter Variable", sans-serif' },
  { id: "friendly", name: "Friendly", description: "Plus Jakarta Sans everywhere", sample: '"Plus Jakarta Sans Variable", sans-serif' },
  { id: "geometric", name: "Geometric", description: "Manrope – round and open", sample: '"Manrope Variable", sans-serif' },
] as const;
export type FontStyleId = (typeof FONT_STYLES)[number]["id"];

const isAccent = (value: string | null): value is AccentId => ACCENTS.some((accent) => accent.id === value);
const isFontStyle = (value: string | null): value is FontStyleId => FONT_STYLES.some((font) => font.id === value);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: the choice still applies until the page is closed.
  }
}

export const readAccent = (): AccentId => {
  const value = read(ACCENT_STORAGE_KEY);
  return isAccent(value) ? value : "indigo";
};
export const readFontStyle = (): FontStyleId => {
  const value = read(FONT_STORAGE_KEY);
  return isFontStyle(value) ? value : "modern";
};

export function applyAccent(accent: AccentId, persist = true): void {
  document.documentElement.dataset.accent = accent;
  if (persist) write(ACCENT_STORAGE_KEY, accent);
}

export function applyFontStyle(font: FontStyleId, persist = true): void {
  document.documentElement.dataset.font = font;
  if (persist) write(FONT_STORAGE_KEY, font);
}
