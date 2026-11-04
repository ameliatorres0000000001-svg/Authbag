// Analysis points ("marks"): rectangles on an inspection photo, in fractions of the image (0..1).
// Annotation only. The engine never reads marks, so they cannot change an outcome.

export interface Rect { x: number; y: number; w: number; h: number }
export interface PointText { label: string; note?: string }
export interface SuggestedMark extends Rect { label: string; note?: string; i18n?: { en?: PointText; km?: PointText } }

export const MIN_SIDE = 0.02;   // smaller boxes are almost always accidental taps
export const MAX_AI_MARKS = 4;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Rectangle spanned by two drag points (any direction), clamped to the image. Null if too small. */
export function rectFromDrag(ax: number, ay: number, bx: number, by: number): Rect | null {
  const x1 = clamp01(Math.min(ax, bx)), x2 = clamp01(Math.max(ax, bx));
  const y1 = clamp01(Math.min(ay, by)), y2 = clamp01(Math.max(ay, by));
  const r = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  return r.w >= MIN_SIDE && r.h >= MIN_SIDE ? r : null;
}

/** True when the rectangle lies inside the image and is not degenerate. Mirrors the DB CHECKs. */
export function isValidRect(r: Rect): boolean {
  return [r.x, r.y, r.w, r.h].every(Number.isFinite)
    && r.x >= 0 && r.y >= 0 && r.w >= MIN_SIDE && r.h >= MIN_SIDE
    && r.x + r.w <= 1 + 1e-6 && r.y + r.h <= 1 + 1e-6;
}

/**
 * Parse an AI reply into suggested marks. Accepts a JSON array (optionally wrapped in prose or a code fence).
 * Boxes are clamped to the image; invalid or unlabeled entries are dropped. Never throws.
 */
export function parseSuggestedMarks(text: string): SuggestedMark[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: SuggestedMark[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const { label, x, y, w, h, note } = e as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) continue;
    if (![x, y, w, h].every((n) => typeof n === 'number')) continue;
    const r = rectFromDrag(x as number, y as number, (x as number) + (w as number), (y as number) + (h as number));
    if (r) out.push({ ...r, label: label.trim().slice(0, 80), ...(typeof note === 'string' && note.trim() ? { note: note.trim().slice(0, 1000) } : {}) });
    if (out.length === MAX_AI_MARKS) break;
  }
  return out;
}

/**
 * Show only the marked area of an image: the crop box gets `aspectRatio`, and the full image inside it is absolutely
 * positioned with `img` (percentages of the box). `imgW`/`imgH` are the displayed image's natural size, so the crop
 * keeps the photo's real proportions instead of stretching.
 */
export function cropBox(r: Rect, imgW: number, imgH: number): { aspectRatio: string; img: { width: string; height: string; left: string; top: string } } {
  const pct = (n: number) => `${n * 100}%`;
  return {
    aspectRatio: `${r.w * imgW} / ${r.h * imgH}`,
    img: { width: pct(1 / r.w), height: pct(1 / r.h), left: pct(-r.x / r.w), top: pct(-r.y / r.h) },
  };
}

const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');

/**
 * Parse teaching points written in English and Khmer:
 * [{"x","y","w","h","label_en","note_en","label_km","note_km"}]. label/note keep the English text
 * (or Khmer when English is missing); i18n carries both. Never throws.
 */
export function parseBilingualMarks(text: string): SuggestedMark[] {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const out: SuggestedMark[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    if (![o.x, o.y, o.w, o.h].every((n) => typeof n === 'number')) continue;
    const en = { label: txt(o.label_en ?? o.label, 80), note: txt(o.note_en ?? o.note, 1000) };
    const km = { label: txt(o.label_km, 80), note: txt(o.note_km, 1000) };
    const label = en.label || km.label;
    if (!label) continue;
    const r = rectFromDrag(o.x as number, o.y as number, (o.x as number) + (o.w as number), (o.y as number) + (o.h as number));
    if (!r) continue;
    const i18n: SuggestedMark['i18n'] = {};
    if (en.label) i18n.en = { label: en.label, ...(en.note ? { note: en.note } : {}) };
    if (km.label) i18n.km = { label: km.label, ...(km.note ? { note: km.note } : {}) };
    const note = en.note || km.note;
    out.push({ ...r, label, ...(note ? { note } : {}), i18n });
    if (out.length === MAX_AI_MARKS) break;
  }
  return out;
}

const area = (r: Rect) => r.w * r.h;
/** Intersection over union of two rectangles (0 = apart, 1 = identical). */
export function iou(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  return inter / (area(a) + area(b) - inter || 1);
}

/**
 * Keep only useful AI boxes: drop a box that covers most of the photo (it points at nothing in particular)
 * and a box that mostly repeats an earlier one, or a point already on the photo. Order is kept.
 */
export function refineMarks<T extends Rect>(marks: T[], existing: Rect[] = [], maxArea = 0.55, maxOverlap = 0.5): T[] {
  const kept: T[] = [];
  for (const m of marks) {
    if (area(m) > maxArea) continue;
    if ([...existing, ...kept].some((k) => iou(k, m) > maxOverlap)) continue;
    kept.push(m);
  }
  return kept;
}
