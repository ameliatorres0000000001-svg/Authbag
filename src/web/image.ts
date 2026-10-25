// Client-side image preparation: re-encoding through a canvas strips EXIF/GPS/camera serials, and a quick blur/brightness check
// warns the user BEFORE a bad photo becomes (bad) evidence. Server re-checks type and size; quality here is advisory.

export interface Prepared {
  blob: Blob; width: number; height: number;
  quality: { blurScore: number; brightness: number; warnings: string[] };
}

const MAX_SIDE = 4096;

export async function prepareImage(file: File): Promise<Prepared> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode_failed'))), 'image/jpeg', 0.95));

  // analysis on a small grayscale copy
  const s = Math.min(1, 512 / Math.max(w, h));
  const sw = Math.max(8, Math.round(w * s)), sh = Math.max(8, Math.round(h * s));
  const small = document.createElement('canvas'); small.width = sw; small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const px = sctx.getImageData(0, 0, sw, sh).data;
  const g = new Float32Array(sw * sh);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i]; }
  const brightness = sum / g.length;
  // variance of the Laplacian: low value => blurry
  let lsum = 0, lsq = 0, n = 0;
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x;
    const l = g[i - 1] + g[i + 1] + g[i - sw] + g[i + sw] - 4 * g[i];
    lsum += l; lsq += l * l; n++;
  }
  const blurScore = lsq / n - (lsum / n) ** 2;

  const warnings: string[] = [];
  if (blurScore < 40) warnings.push('blurry');
  if (brightness < 50) warnings.push('too_dark');
  if (brightness > 225) warnings.push('too_bright');
  if (Math.min(w, h) < 1000) warnings.push('low_resolution');
  return { blob, width: w, height: h, quality: { blurScore: Math.round(blurScore), brightness: Math.round(brightness), warnings } };
}
