import type { AIImage } from "./llmRouter";

/** Largest reference screenshot accepted, after base64 decoding. The browser shrinks images well below this. */
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;

const TYPES = new Set<AIImage["mimeType"]>(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Reads the optional reference screen sent with Build Prototype, as a data URL
 * ("data:image/png;base64,...") or { mimeType, data }. Returns null when none was sent.
 */
export function parseReferenceImage(input: unknown): AIImage | { error: string } | null {
  if (input === undefined || input === null || input === "") return null;
  let mimeType: string | undefined;
  let data: string | undefined;
  if (typeof input === "string") {
    const m = /^data:([^;,]+);base64,(.*)$/s.exec(input);
    if (m) [mimeType, data] = [m[1], m[2]];
  } else if (typeof input === "object") {
    const o = input as { mimeType?: unknown; data?: unknown };
    if (typeof o.mimeType === "string" && typeof o.data === "string") [mimeType, data] = [o.mimeType, o.data];
  }
  if (!mimeType || !data) return { error: "The reference screen must be an image (PNG, JPEG, WebP or GIF)." };
  mimeType = mimeType.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!TYPES.has(mimeType as AIImage["mimeType"])) return { error: "The reference screen must be a PNG, JPEG, WebP or GIF image." };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return { error: "The reference screen image is damaged." };
  if (Math.floor((data.length * 3) / 4) > MAX_REFERENCE_BYTES) return { error: "The reference screen is too large; use an image under 4 MB." };
  return { mimeType: mimeType as AIImage["mimeType"], data };
}
