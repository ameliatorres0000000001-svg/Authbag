import { GATES, patchStats, rgbToLab, type PatchStats } from './color.ts';

/**
 * Find the two spots of a colour photo automatically: the white paper and the bag colour.
 * Pure (works on raw RGBA), so it is unit-tested. It only proposes spots: the same quality checks as a manual
 * tap (checkMeasurement) still decide whether a colour is given, and the person can tap to move either spot.
 *
 * - White: a bright, neutral, even patch (the paper).
 * - Colour: among even, not-shiny, not-paper patches at least 4 radii from the paper, the most common colour,
 *   weighted towards the middle of the photo. Colours that touch the photo edges (table, wall, floor) are skipped
 *   when a sizeable colour stays inside the photo — the background touches the edges, the bag usually does not.
 */
export interface Pt { x: number; y: number }
interface Cand extends Pt { s: PatchStats; luma: number; tint: number }

const lumaOf = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const tintOf = ([r, g, b]: [number, number, number]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 0 ? (mx - mn) / mx : 1; };

export function autoSpots(data: ArrayLike<number>, w: number, h: number, r: number): { white: Pt; spot: Pt } | null {
  const cands = candidates(data, w, h, r);
  // the paper: bright, neutral, even
  let white: Cand | null = null, best = -Infinity;
  for (const c of cands) {
    if (c.luma < GATES.whiteMinLuma || c.tint > 0.2 || c.s.sd > GATES.whiteMaxSd * 0.8 || c.s.clipped > 0.1) continue;
    if (c.x < w * 0.06 || c.x > w * 0.94 || c.y < h * 0.06 || c.y > h * 0.94) continue; // a lamp or window in a corner, not the paper
    const score = c.luma - 4 * c.s.sd - 100 * c.tint;
    if (score > best) { best = score; white = c; }
  }
  if (!white) return null;
  const spot = colourSpot(cands, w, h, r, white);
  return spot ? { white: { x: white.x, y: white.y }, spot } : null;
}

/**
 * The bag colour alone (no paper): the most common even, not-shiny colour, weighted towards the middle of the photo,
 * background colours that touch the edges skipped. Used for the quick (approximate) colour.
 */
export function autoColour(data: ArrayLike<number>, w: number, h: number, r: number): Pt | null {
  return colourSpot(candidates(data, w, h, r), w, h, r, null);
}

function candidates(data: ArrayLike<number>, w: number, h: number, r: number): Cand[] {
  const step = Math.max(r, Math.round(Math.min(w, h) / 40));
  const cands: Cand[] = [];
  for (let y = r + 1; y < h - r - 1; y += step) {
    for (let x = r + 1; x < w - r - 1; x += step) {
      const s = patchStats(data, w, h, x, y, r);
      if (s.n < 20) continue;
      cands.push({ x, y, s, luma: lumaOf(s.mean), tint: tintOf(s.mean) });
    }
  }
  return cands;
}

function colourSpot(cands: Cand[], w: number, h: number, r: number, white: Cand | null): Pt | null {
  const minDist = (GATES.minSpots + 1) * r;
  const cx = w / 2, cy = h / 2, half = Math.hypot(cx, cy);
  const buckets = new Map<string, { weight: number; edge: number; items: { c: Cand; d: number }[] }>();
  const ex = w * 0.1, ey = h * 0.1;
  for (const c of cands) {
    if (white && Math.hypot(c.x - white.x, c.y - white.y) < minDist) continue;
    if (c.s.sd > GATES.sampleMaxSd * 0.8 || c.s.clipped > GATES.sampleMaxClip) continue;
    const [L, a, b] = white ? rgbToLab(c.s.mean, white.s.mean) : rgbToLab(c.s.mean);
    if (L < GATES.sampleMinL + 2) continue;
    if (white && L > 85 && Math.hypot(a, b) < 8) continue; // more paper, not the bag
    const d = Math.hypot(c.x - cx, c.y - cy) / half; // 0 centre … 1 corner
    const key = `${Math.round(L / 8)}|${Math.round(a / 8)}|${Math.round(b / 8)}`;
    const k = buckets.get(key) ?? { weight: 0, edge: 0, items: [] };
    k.weight += 1 + 1.5 * (1 - d);
    if (c.x < ex || c.x > w - ex || c.y < ey || c.y > h - ey) k.edge++;
    k.items.push({ c, d });
    buckets.set(key, k);
  }
  // background = colours that touch the photo edges; skip them when a sizeable colour stays inside the photo
  // (a close-up where the bag fills the frame has no such colour, and then every colour counts)
  const all = [...buckets.values()];
  const total = all.reduce((n, k) => n + k.items.length, 0);
  const inner = all.filter((k) => k.edge / k.items.length <= 0.2 && k.items.length >= Math.max(6, total * 0.05));
  let top: { weight: number; edge: number; items: { c: Cand; d: number }[] } | null = null;
  for (const k of inner.length ? inner : all) if (!top || k.weight > top.weight) top = k;
  if (!top) return null;
  const pick = top.items.reduce((p, q) => (q.c.s.sd + 20 * q.d < p.c.s.sd + 20 * p.d ? q : p)).c;
  return { x: pick.x, y: pick.y };
}
