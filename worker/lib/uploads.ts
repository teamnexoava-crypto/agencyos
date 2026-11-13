import { sniffImage } from "./images";

export interface SniffedFile {
  mime: string;
  ext: string;
}

/** Real type of an uploaded receipt (image or PDF) from its first bytes – never from the filename or Content-Type. */
export function sniffReceipt(bytes: Uint8Array): SniffedFile | null {
  const image = sniffImage(bytes);
  if (image) return image;
  // "%PDF-"
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return { mime: "application/pdf", ext: "pdf" };
  return null;
}

/** Keeps a user-supplied filename safe to store and to echo back in a Content-Disposition header. */
export function cleanFileName(name: string, fallback: string): string {
  const cleaned = [...name]
    // Drop control characters and anything that could break out of a header value or a path.
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 && !'"\\/'.includes(char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
