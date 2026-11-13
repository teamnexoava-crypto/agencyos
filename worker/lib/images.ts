import { type LOGO_MIME_TYPES } from "../../shared/constants";

type ImageMime = (typeof LOGO_MIME_TYPES)[number];

const EXTENSIONS: Record<ImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Detects the real image type from magic bytes — the client-supplied Content-Type and filename are
 * never trusted. SVG is deliberately unsupported (it can carry scripts).
 */
export function sniffImage(bytes: Uint8Array): { mime: ImageMime; ext: string } | null {
  const startsWith = (sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);

  let mime: ImageMime | null = null;
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) mime = "image/png";
  else if (startsWith([0xff, 0xd8, 0xff])) mime = "image/jpeg";
  else if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) mime = "image/webp";

  return mime ? { mime, ext: EXTENSIONS[mime] } : null;
}
