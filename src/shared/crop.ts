/**
 * AI "cut into photos": find the separate photos inside one composite image (a comparison chart, a collage)
 * and return one rectangle per photo. The caption is only the printed text next to the photo, transcribed,
 * e.g. "Counterfeit" or "Authentic"; it is a pre-fill for the uploader's own label, never the AI's verdict.
 */
import { rectFromDrag, type Rect } from './marks.ts';

export const MAX_CROPS = 12;
export const MIN_CROP_SIDE = 0.06; // smaller pieces are labels, arrows or icons, not photos

export interface CropRegion extends Rect { caption: string; part: string | null }

/** Parse an AI reply into crop regions. Accepts a JSON array, optionally wrapped in prose. Never throws. */
export function parseCropRegions(text: string, partCodes: string[] = []): CropRegion[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: CropRegion[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const { x, y, w, h, caption, part } = e as Record<string, unknown>;
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    const r = rectFromDrag(x as number, y as number, (x as number) + (w as number), (y as number) + (h as number));
    if (!r || r.w < MIN_CROP_SIDE || r.h < MIN_CROP_SIDE) continue;
    // drop near-duplicates (the same photo boxed twice)
    if (out.some((o) => overlap(o, r) > 0.8)) continue;
    out.push({
      ...r,
      caption: typeof caption === 'string' ? caption.trim().slice(0, 80) : '',
      part: typeof part === 'string' && partCodes.includes(part) ? part : null,
    });
    if (out.length === MAX_CROPS) break;
  }
  // reading order: top to bottom, then left to right
  return out.sort((a, b) => (Math.abs(a.y - b.y) > 0.05 ? a.y - b.y : a.x - b.x));
}

/** Intersection over the smaller box. */
function overlap(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.min(a.w * a.h, b.w * b.h);
}

/** Map a printed caption to the uploader's label pre-fill. Unclear captions stay 'unknown'. */
export function labelFromCaption(caption: string): 'authentic' | 'counterfeit' | 'unknown' {
  const c = caption.toLowerCase();
  const fake = /\b(counterfeit|fake|replica|knock-?off)\b|ក្លែង/.test(c);
  const real = /\b(authentic|genuine|real|original)\b|ពិត/.test(c);
  return fake && !real ? 'counterfeit' : real && !fake ? 'authentic' : 'unknown';
}
