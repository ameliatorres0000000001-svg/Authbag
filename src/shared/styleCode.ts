/**
 * Brand style / article codes split into named parts (e.g. MCM "MWT4SED09PF001").
 * Meanings come from a dictionary table (style_code_parts); this file only knows where each part sits.
 * Identification aid for learning — a code that parses never proves a bag is genuine.
 */
export type StyleField = 'brand' | 'gender' | 'category' | 'year' | 'season' | 'collection' | 'model' | 'colour' | 'size';
export interface StylePart { field: StyleField; code: string }

const SCHEMES: Record<string, { re: RegExp; fields: StyleField[] }> = {
  // M · gender · type · year · season · line(2) · model(2) · colour(2) · size(3)
  mcm: { re: /^(M)([WMU])([A-Z])([0-9A-Z])([SA])([A-Z]{2})(\d{2})([A-Z0-9]{2})(\d{3})$/, fields: ['brand', 'gender', 'category', 'year', 'season', 'collection', 'model', 'colour', 'size'] },
};

export const normalizeStyleCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const hasStyleScheme = (brandSlug: string) => brandSlug in SCHEMES;

/** Split a code into parts for the brand's scheme, or null when it does not fit. */
export function parseStyleCode(brandSlug: string, raw: string): StylePart[] | null {
  const s = SCHEMES[brandSlug];
  if (!s) return null;
  const m = s.re.exec(normalizeStyleCode(raw));
  if (!m) return null;
  return s.fields.map((field, i) => ({ field, code: m[i + 1] }));
}
