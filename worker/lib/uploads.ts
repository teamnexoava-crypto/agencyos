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

const OFFICE_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  fig: "application/octet-stream",
};
const LEGACY_OFFICE_TYPES: Record<string, string> = { doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint" };
const TEXT_TYPES: Record<string, string> = { txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", md: "text/plain; charset=utf-8" };

/**
 * Real type of a project file. The container format comes from the file's first bytes; the extension
 * only picks between formats that share a container (a .docx and a .zip are both ZIP archives).
 * Anything a browser could execute – HTML, SVG, scripts – matches nothing here and is rejected.
 */
export function sniffProjectFile(bytes: Uint8Array, fileName: string): SniffedFile | null {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(fileName)?.[1]?.toLowerCase() ?? "";
  const startsWith = (signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);

  const image = sniffImage(bytes);
  if (image) return image;
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: "gif" };
  // "%PDF-" – Illustrator files are PDFs inside.
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return ext === "ai" ? { mime: "application/octet-stream", ext: "ai" } : { mime: "application/pdf", ext: "pdf" };
  // ZIP container: Office documents, archives, Figma exports.
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) {
    const mime = OFFICE_TYPES[ext];
    return mime ? { mime, ext } : { mime: "application/zip", ext: "zip" };
  }
  // Legacy Office (OLE compound file).
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const mime = LEGACY_OFFICE_TYPES[ext];
    return mime ? { mime, ext } : null;
  }
  // MP4 / QuickTime: "ftyp" box at offset 4.
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) return ext === "mov" ? { mime: "video/quicktime", ext: "mov" } : { mime: "video/mp4", ext: "mp4" };
  // Photoshop: "8BPS".
  if (startsWith([0x38, 0x42, 0x50, 0x53])) return { mime: "image/vnd.adobe.photoshop", ext: "psd" };

  // Plain text has no signature: accept only known extensions, and only if it really is text.
  const textType = TEXT_TYPES[ext];
  if (textType) {
    const sample = bytes.subarray(0, 4096);
    if (sample.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)), { stream: true });
    } catch {
      return null;
    }
    return { mime: textType, ext };
  }
  return null;
}
