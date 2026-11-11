// What the paint AI knows before the shop has written anything: a reference catalogue of Sakura Acrylic Color
// (the paints the owner works with) and the owner's own restoration notes (2026-11). Shop knowledge written in
// the admin "AI skills" tab and the shop's own paint list always come first; this only fills the gaps.

export interface CatalogPaint { code: string; name: string; opacity: 'opaque' | 'transparent' | null }

/**
 * Sakura Acrylic Color codes, checked against Sakura's product list (sakuracraypas.com/products/505) and the
 * printed tube labels. Opacity is given only where a tube label or retailer list states it.
 * Note: #36 is Cobalt Blue (the tube says so); Ultramarine Blue is #38. Silver is #53.
 */
export const SAKURA_ACRYLIC: CatalogPaint[] = [
  { code: '50', name: 'Titanium White', opacity: 'opaque' },
  { code: '3', name: 'Yellow', opacity: 'opaque' },
  { code: '7', name: 'Pale Orange', opacity: 'opaque' },
  { code: '15', name: 'Yellow Ochre', opacity: 'opaque' },
  { code: '112', name: 'Burnt Sienna', opacity: 'opaque' },
  { code: '18', name: 'Vermilion', opacity: 'transparent' },
  { code: '19', name: 'Red', opacity: 'opaque' },
  { code: '20', name: 'Pink', opacity: 'opaque' },
  { code: '23', name: 'Violet', opacity: 'transparent' },
  { code: '25', name: 'Cerulean Blue', opacity: 'opaque' },
  { code: '36', name: 'Cobalt Blue', opacity: 'opaque' },
  { code: '38', name: 'Ultramarine Blue', opacity: 'transparent' },
  { code: '143', name: 'Phthalo Blue', opacity: 'transparent' },
  { code: '27', name: 'Yellow Green', opacity: 'transparent' },
  { code: '131', name: 'Phthalo Green', opacity: 'transparent' },
  { code: '49', name: 'Carbon Black', opacity: 'opaque' },
  { code: '51', name: 'Gold', opacity: null },
  { code: '53', name: 'Silver', opacity: null },
];

const bare = (code: string) => String(code ?? '').replace(/[\s#.]+/g, '').replace(/^no/i, '');

/** The catalogue paint for a brand + code the AI wrote ("Sakura", "#15" / "15" / "No.15"), or null. Never guesses by name. */
export function catalogPaint(brand: string, code: string): CatalogPaint | null {
  if (!/^sakura\b/i.test(String(brand ?? '').trim())) return null;
  const c = bare(code);
  return c ? SAKURA_ACRYLIC.find((p) => p.code === c) ?? null : null;
}

/** One line for the prompt: "#50 Titanium White (opaque); #3 Yellow (opaque); …". */
export const catalogLine = (): string =>
  SAKURA_ACRYLIC.map((p) => `#${p.code} ${p.name}${p.opacity ? ` (${p.opacity})` : ''}`).join('; ');

/** The owner's restoration notes, as knowledge lines for the paint AI (it answers in the user's language). */
export const BUILTIN_PAINT_KNOWLEDGE = `### Second-hand bag repainting basics (built-in; shop knowledge above wins when they differ)
Preparation is most of the result:
- Real leather: wipe with deglazer or alcohol to remove factory finish, oil and wax; sand lightly only if needed.
- Faux leather / PU: mild soapy water or alcohol; no strong solvents (they melt it).
- Canvas / fabric: remove dirt and dust; prime with acrylic paint + fabric medium so the paint does not crack.
Painting:
- Over a dark bag, start with a white base coat (#50 Titanium White) or a light primer.
- 3–5 thin coats, never one thick coat; let each dry 15–20 minutes.
- Edges and small details: a small precise brush.
- Transparent paints (#18, #23, #27, #38, #131, #143) do not cover old colour in one coat: more coats, or a little #50.
Sealing:
- When fully dry (24 hours), apply an acrylic finisher: matte, satin or gloss. Canvas or leather: a water-repellent spray on top.
Troubleshooting:
- Cracking: coats too thick, or the surface was not cleaned / primed.
- Sticky: let it cure 48 hours in a dry, ventilated place, or apply an acrylic finisher.
- Faded colour: correct with small amounts of #3 Yellow, #19 Red and a blue (#36 Cobalt Blue or #38 Ultramarine Blue).

### Colour mixing for aged leather (built-in)
- Pure bright colours look unnatural on old leather. Mute them with #15 Yellow Ochre, #112 Burnt Sienna or #50 Titanium White.
- Pure #19 Red is too bright: always mute it with #15 or #112.
- Starting mixes (test first, adjust one drop at a time): vintage / brick red = #19 ×3 + #15 ×1 (deeper: a tiny drop of #112 or #49);
  warm tan / vintage brown = #15 ×2 + #112 ×1 + #50 ×1 (handles and edges); aged mustard = #3 + #15 + a tiny drop of #112;
  orange = #3 ×2 + #19 ×1; green = #3 ×1 + blue ×1; purple = #19 ×1 + blue ×1; pink = #50 ×3 + #19 ×1; sky blue = #50 ×4 + blue ×1;
  grey = #50 ×4 + #49 ×1; flesh = #50 + #7 + a tiny drop of #19; brown = #19 + #3 + a little #49 (or use #112).
- When matching an old or faded colour, give: the exact codes, the ratio, "add #15 or #112 drop by drop until it matches",
  and "test on a hidden spot (inside rim or bottom) before the outside".`;

/** Shop knowledge first, then the built-in notes. */
export const withBuiltinPaintKnowledge = (shopSkills: string): string =>
  [shopSkills.trim(), BUILTIN_PAINT_KNOWLEDGE].filter(Boolean).join('\n\n');
