import { noVerdict, noVerdictKm } from './aiReview.ts';
// What a date code LOOKS like (shape, size, font, spacing, depth, placement), as described by the AI.
// Descriptive only: never a verdict, never a score. The rules engine never reads this.

export const STAMP_METHODS = ['heat_stamped', 'embossed', 'printed', 'engraved', 'unclear'] as const;
export type StampMethod = (typeof STAMP_METHODS)[number];

export interface AppearanceDifference { feature: string; inspected: string; reference: string; photoCaveat?: string }

export interface DateCodeAppearance {
  transcription: string;          // exactly what is visible, '?' for unreadable characters
  characterCount: number | null;
  lines: number | null;           // 1 = one line, 2 = split over two lines / two places
  method: StampMethod;
  placement: string;              // e.g. "leather tab sewn into interior pocket seam"
  surface: string;                // leather, canvas, cloth tab, metal …
  font: string;                   // serif / sans, narrow / wide, stroke weight, shapes of 0/1/4/7
  size: string;                   // relative size vs nearby features
  sizeMm: number | null;          // character height in mm, ONLY when a ruler/scale is visible
  scaleVisible: boolean;
  spacing: string;                // even / uneven gaps between characters
  alignment: string;              // baseline straight / tilted / wavy; centred on tab
  depthEdges: string;             // pressed depth, edge sharpness, ink/foil fill
  differences: AppearanceDifference[]; // vs reference date-code photos, when any were supplied
  photoIssues: string[];          // blur, glare, angle, crop that limit what can be said
  summary: string;
  /** owner's 4 typography checks, compared with references: weight, proportions (0 / 1), spacing, stamp */
  checks: TypoCheck[];
  fontSize: string;               // 1-2 sentences: font weight, size, shapes of 0 and 1
  spacingStyle: string;           // 1-2 sentences: spacing and stamp quality
}
export const TYPO_KEYS = ['weight', 'proportions', 'spacing', 'stamp'] as const;
export type TypoKey = (typeof TYPO_KEYS)[number];
export interface TypoCheck { key: TypoKey; status: 'matches' | 'differs' | 'unclear'; note: string }

/** these lines are shown to customers: no verdict words, in either language */
const clean = (s: string) => noVerdictKm(noVerdict(s));
const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

/** Parse an AI reply (JSON object, optionally wrapped in prose / a code fence). Never throws; returns null when unusable. */
export function parseAppearance(text: string): DateCodeAppearance | null {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(text.slice(a, b + 1)); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const scaleVisible = o.scaleVisible === true;
  const method = STAMP_METHODS.includes(o.method as StampMethod) ? (o.method as StampMethod) : 'unclear';
  const differences = (Array.isArray(o.differences) ? o.differences : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && typeof (d as any).feature === 'string' && !!(d as any).feature.trim())
    .slice(0, 12)
    .map((d) => ({ feature: str(d.feature, 80), inspected: str(d.inspected), reference: str(d.reference), ...(str(d.photoCaveat) ? { photoCaveat: str(d.photoCaveat) } : {}) }));
  const out: DateCodeAppearance = {
    transcription: str(o.transcription, 40).toUpperCase(),
    characterCount: num(o.characterCount, 0, 20),
    lines: num(o.lines, 1, 4),
    method,
    placement: str(o.placement), surface: str(o.surface, 120), font: str(o.font), size: str(o.size),
    // a millimetre figure without a visible scale is a guess: drop it
    sizeMm: scaleVisible ? num(o.sizeMm, 0.3, 20) : null,
    scaleVisible,
    spacing: str(o.spacing), alignment: str(o.alignment), depthEdges: str(o.depthEdges),
    differences,
    photoIssues: (Array.isArray(o.photoIssues) ? o.photoIssues : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 8),
    summary: str(o.summary, 600),
    checks: TYPO_KEYS.flatMap((k) => {
      const c = (Array.isArray(o.checks) ? o.checks : []).find((x: any) => x && x.key === k) as Record<string, unknown> | undefined;
      if (!c) return [];
      const status = (['matches', 'differs', 'unclear'] as const).includes(c.status as any) ? (c.status as TypoCheck['status']) : 'unclear';
      return [{ key: k, status, note: clean(str(c.note, 240)) }];
    }),
    fontSize: clean(str(o.fontSize, 300)),
    spacingStyle: clean(str(o.spacingStyle, 300)),
  };
  const anything = out.transcription || out.font || out.size || out.spacing || out.summary || out.differences.length;
  return anything ? out : null;
}
