/**
 * Guess brand, model, part and label for an upload from its file name, e.g.
 *   "04_lv-palm-springs-mini_4_heat_stamp.jpg" → Louis Vuitton · Palm Springs Mini · heat_stamp
 *   "25_compare1_gucci_date_code_counterfeit.jpg" → Gucci · date_code · counterfeit
 * Only a pre-fill: the admin sees every guess in the list and can change it before uploading.
 * The label is the uploader's own claim, never a system decision.
 */
export interface GuessBrand { id: string; name: string }
export interface GuessModel { id: string; brand_id: string; name: string }
export interface UploadGuess { brandId?: string; modelId?: string; componentCode?: string; label?: 'authentic' | 'counterfeit' }

export const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const BRAND_ALIASES: Record<string, string[]> = { 'louis-vuitton': ['lv'], hermes: ['hermes'], 'christian-dior': ['dior'] };

export function guessFromFilename(fileName: string, brands: GuessBrand[], models: GuessModel[], partCodes: string[]): UploadGuess {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  const s = `-${slug(base)}-`;
  const has = (word: string) => s.includes(`-${word}-`);
  const out: UploadGuess = {};

  for (const b of brands) {
    const names = [slug(b.name), ...(BRAND_ALIASES[slug(b.name)] ?? [])];
    if (names.some(has)) { out.brandId = b.id; break; }
  }
  // a model matches when the first two words of its name appear together (e.g. "nice-vanity" for "Nice (vanity case)")
  const candidates = models.filter((m) => !out.brandId || m.brand_id === out.brandId);
  let best: GuessModel | undefined;
  for (const m of candidates) {
    const key = slug(m.name).split('-').slice(0, 2).join('-');
    if (key && s.includes(`-${key}-`) && (!best || slug(m.name).length > slug(best.name).length)) best = m;
  }
  if (best) { out.modelId = best.id; out.brandId ??= best.brand_id; }

  // longest code first so "heat_stamp" wins over a shorter code inside it
  for (const code of [...partCodes].sort((a, b) => b.length - a.length)) {
    if (has(slug(code))) { out.componentCode = code; break; }
  }
  if (has('counterfeit') || has('fake')) out.label = 'counterfeit';
  else if (has('authentic') || has('genuine')) out.label = 'authentic';
  return out;
}
