/**
 * Reference screen for Build Prototype: a screenshot the BA likes, read in the browser and shrunk
 * before upload so it stays small in the request and in the saved session.
 */

/** Longest side after shrinking. Enough for the AI to read layout and density. */
const MAX_SIDE = 1400;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export function isAcceptedReference(file: File): boolean {
  return ACCEPTED.includes(file.type);
}

/** Returns a JPEG data URL no larger than MAX_SIDE on its longest side. */
export async function readReferenceImage(file: File): Promise<string> {
  if (!isAcceptedReference(file)) throw new Error('Use a PNG, JPEG, WebP or GIF screenshot.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This image could not be opened.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot prepare the image.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
