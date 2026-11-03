import { api } from './api.ts';
import { prepareImage } from './image.ts';
import type { CropRegion } from '../shared/crop.ts';

/**
 * Ask the AI where the separate photos are in one composite image, then cut them out here in the browser.
 * Nothing is uploaded as a post: the pieces come back as Files for the admin to review.
 */
export async function aiCropPhotos(file: File): Promise<{ file: File; region: CropRegion }[]> {
  const p = await prepareImage(file); // re-encoded JPEG, EXIF stripped
  const fd = new FormData();
  fd.append('file', new File([p.blob], 'composite.jpg', { type: 'image/jpeg' }));
  const { regions } = await api.post<{ regions: CropRegion[] }>('/api/ai/crop-regions', fd);
  if (!regions.length) return [];
  const bmp = await createImageBitmap(p.blob);
  const base = file.name.replace(/\.[a-z0-9]+$/i, '');
  const out: { file: File; region: CropRegion }[] = [];
  for (const [i, r] of regions.entries()) {
    const sx = Math.round(r.x * bmp.width), sy = Math.round(r.y * bmp.height);
    const sw = Math.max(1, Math.round(r.w * bmp.width)), sh = Math.max(1, Math.round(r.h * bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = sw; canvas.height = sh;
    canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode_failed'))), 'image/jpeg', 0.95));
    out.push({ file: new File([blob], `${base}_cut${i + 1}.jpg`, { type: 'image/jpeg' }), region: r });
  }
  return out;
}
