/**
 * Leather types — one list for the whole app (picker, AI prompts, validation). To add a type: add an entry here,
 * add its labels in src/web/i18n.tsx (paint.surface.<key>, skill.leatherSub.<key>) and, if recipes should use it,
 * widen the CHECK on paint_recipes.surface in a new migration.
 */
export const LEATHERS = [
  { key: 'smooth_leather', mark: '◐', ai: 'smooth leather (calf, lambskin, box calf)' },
  { key: 'grained_leather', mark: '▦', ai: 'grained / pebbled leather (e.g. Epi, Saffiano, Togo-type grain)' },
  { key: 'vachetta', mark: '◒', ai: 'vachetta (untreated natural cowhide that darkens with age and oil)' },
  { key: 'coated_canvas', mark: '▤', ai: 'coated canvas (PVC-coated, e.g. Monogram / Damier canvas, Coach signature)' },
  { key: 'suede', mark: '≋', ai: 'suede / nubuck (napped leather)' },
  { key: 'edge', mark: '▭', ai: 'edges (edge paint / edge coat on straps and panels)' },
  { key: 'other', mark: '…', ai: 'other material' },
] as const;

export type LeatherKey = typeof LEATHERS[number]['key'];
export const LEATHER_KEYS = LEATHERS.map((l) => l.key) as unknown as readonly [LeatherKey, ...LeatherKey[]];
export const leatherAi = (key: string): string => LEATHERS.find((l) => l.key === key)?.ai ?? key;
export const isLeather = (key: unknown): key is LeatherKey => typeof key === 'string' && LEATHERS.some((l) => l.key === key);
