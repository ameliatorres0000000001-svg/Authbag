// What the paint AI knows before the shop has written anything: a reference catalogue of Sakura Acrylic Color
// (the paints the owner works with) and the owner's own restoration notes (2026-11). Shop knowledge written in
// the admin "AI skills" tab and the shop's own paint list always come first; this only fills the gaps.

export interface CatalogPaint { code: string; name: string; /** everyday Khmer colour name, as the owner calls it */ km: string; opacity: 'opaque' | 'transparent' | null }

/**
 * Sakura Acrylic Color codes, checked against Sakura's product list (sakuracraypas.com/products/505) and the
 * printed tube labels. Opacity is given only where a tube label or retailer list states it.
 * Note: #36 is Cobalt Blue (the tube says so); Ultramarine Blue is #38. Silver is #53.
 */
export const SAKURA_ACRYLIC: CatalogPaint[] = [
  { code: '50', name: 'Titanium White', km: 'ស', opacity: 'opaque' },
  { code: '3', name: 'Yellow', km: 'លឿង', opacity: 'opaque' },
  { code: '7', name: 'Pale Orange', km: 'ទឹកក្រូចខ្ចី (សាច់)', opacity: 'opaque' },
  { code: '15', name: 'Yellow Ochre', km: 'លឿងដី', opacity: 'opaque' },
  { code: '112', name: 'Burnt Sienna', km: 'ត្នោត', opacity: 'opaque' },
  { code: '18', name: 'Vermilion', km: 'ក្រហមទឹកក្រូច', opacity: 'transparent' },
  { code: '19', name: 'Red', km: 'ក្រហម', opacity: 'opaque' },
  { code: '20', name: 'Pink', km: 'ផ្កាឈូក', opacity: 'opaque' },
  { code: '23', name: 'Violet', km: 'ស្វាយ', opacity: 'transparent' },
  { code: '25', name: 'Cerulean Blue', km: 'ខៀវមេឃ', opacity: 'opaque' },
  { code: '36', name: 'Cobalt Blue', km: 'ខៀវ', opacity: 'opaque' },
  { code: '38', name: 'Ultramarine Blue', km: 'ខៀវចាស់', opacity: 'transparent' },
  { code: '143', name: 'Phthalo Blue', km: 'ខៀវស្រងាត់', opacity: 'transparent' },
  { code: '27', name: 'Yellow Green', km: 'បៃតងខ្ចី', opacity: 'transparent' },
  { code: '131', name: 'Phthalo Green', km: 'បៃតងចាស់', opacity: 'transparent' },
  { code: '49', name: 'Carbon Black', km: 'ខ្មៅ', opacity: 'opaque' },
  { code: '51', name: 'Gold', km: 'មាស', opacity: null },
  { code: '53', name: 'Silver', km: 'ប្រាក់', opacity: null },
];

const bare = (code: string) => String(code ?? '').replace(/[\s#.]+/g, '').replace(/^no/i, '');

/** The catalogue paint for a brand + code the AI wrote ("Sakura", "#15" / "15" / "No.15"), or null. Never guesses by name. */
export function catalogPaint(brand: string, code: string): CatalogPaint | null {
  if (!/^sakura\b/i.test(String(brand ?? '').trim())) return null;
  const c = bare(code);
  return c ? SAKURA_ACRYLIC.find((p) => p.code === c) ?? null : null;
}

/**
 * How a paint is written on screen. In Khmer, a catalogue paint leads with its Khmer colour name and code
 * ("លឿងដី #15") and keeps the label's own words small ("Sakura Yellow Ochre"); otherwise brand, code and name as given.
 */
export function paintLabel(p: { brand: string; code?: string | null; name: string }, locale: string): { main: string; code: string; sub: string } {
  const cat = catalogPaint(p.brand, p.code ?? '');
  if (cat && locale === 'km') return { main: cat.km, code: `#${cat.code}`, sub: `Sakura ${cat.name}` };
  return { main: [p.brand, p.name].filter(Boolean).join(' '), code: p.code ?? '', sub: '' };
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
  and "test on a hidden spot (inside rim or bottom) before the outside".

### Reading the bag and correcting a mix that does not match (built-in)
- Describe the bag's colour as it is on old leather (aged red, faded brown, vintage yellow), and whether it is darker, lighter or more
  faded than the plain paint colour; note the surface (glossy, matte, textured). The measured colour given with the job is the reference:
  never replace it with a guess from the photo.
- Bag DARKER than the mixed paint: add #112 Burnt Sienna a drop at a time (a natural aged darkening). Only if it must go much darker,
  add #49 Carbon Black in the tiniest amount (the tip of a toothpick): black takes over quickly.
- Bag LIGHTER or more FADED than the mixed paint: add #50 Titanium White a drop at a time to lighten; if the result looks too fresh or
  chalky, bring it back with a drop of #15 Yellow Ochre.
- After every change: stir, paint a small swatch, let it DRY (acrylic dries a little darker), then compare next to the bag in daylight.
  Change one paint at a time and say how many drops.

### How this shop mixes (owner's working rules, built-in)
- There is no fixed formula in bag painting. Every mix given is a STARTING POINT; the painter adjusts by eye on the real bag, and
  should feel free to blend. Say so plainly, and never present a mix as exact or guaranteed.
- Sakura acrylic dries a little DARKER than it looks wet. So aim the wet mix slightly LIGHTER than the bag: when the wet paint looks
  exactly like the bag, it will dry too dark. Judge only a dry swatch.
- A single paint almost never matches. Blending 3–4 paints gets to the bag's colour faster than fighting with 2: a main colour, an
  earth colour to age it (#15 Yellow Ochre or #112 Burnt Sienna), and #50 Titanium White or a touch of #49 Carbon Black to set how
  light or dark it is. Example for an aged red-brown: #19 Red + #112 Burnt Sienna + #15 Yellow Ochre + a little #50 Titanium White.`;

/** Shop knowledge first, then the built-in notes. */
export const withBuiltinPaintKnowledge = (shopSkills: string): string =>
  [shopSkills.trim(), BUILTIN_PAINT_KNOWLEDGE].filter(Boolean).join('\n\n');
