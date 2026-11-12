// The "photograph next" list the AI gives for an identified bag model (see identifyBag).

/** Which part of the bag a "photograph next" shot shows: the reference photo component codes, plus the whole bag. */
export const SHOT_PARTS = ['whole', 'canvas', 'heat_stamp', 'date_code', 'hardware', 'zipper', 'stitching', 'handles', 'lining', 'rivet', 'rfid', 'other'] as const;
export type ShotPart = (typeof SHOT_PARTS)[number];
export interface RequiredShot { step: number; part: ShotPart; title: string; hint: string }
/** Keep only well-formed shots: a known part, a title, at most 6, numbered 1..n. Never throws. */
export function parseShots(raw: unknown): RequiredShot[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '');
  const out: RequiredShot[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const title = str(o.part_text ?? o.title, 80);
    if (!title) continue;
    const part = (SHOT_PARTS as readonly string[]).includes(String(o.part)) ? (o.part as ShotPart) : 'other';
    out.push({ step: out.length + 1, part, title, hint: str(o.hint, 160) });
    if (out.length >= 6) break;
  }
  return out;
}
