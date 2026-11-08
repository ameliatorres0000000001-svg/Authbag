/**
 * Which active AI skills (staff-written shop knowledge) the in-app AI reads at a given moment.
 * Pure, so it is unit-tested; the worker loads the active rows and records which ones were used.
 * - brand skills only when that brand is in play (the request's brand, or named in the text);
 *   brand recognition does not know the brand yet, so it reads every recognition tip;
 * - in chat, a skill with keywords is used only when one appears; a skill with no brand and no keywords always;
 * - recognition reads its own tips, plus "all" skills only on a keyword hit;
 * - most relevant first, at most 10, within a size budget (characters of body).
 */
export interface SkillRow { id: string; area: string; title: string; body: string; brand: string | null; keywords: string | null }
export type SkillUse = 'chat' | 'identify' | 'check';

export const skillWords = (k: string | null): string[] =>
  (k ?? '').split(/[,\n;、，]/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 2);

/** Latin words match whole words (so "bale" does not match "Balenciaga"; plurals allowed); Khmer / Thai, written without spaces, match inside the text. */
export function mentions(text: string, word: string): boolean {
  if (!/^[a-z0-9 .&'-]+$/.test(word)) return text.includes(word);
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es)?([^a-z0-9]|$)`).test(text);
}

export function chooseSkills(rows: SkillRow[], use: SkillUse, ctx: { text?: string; brand?: string | null; extra?: SkillRow | null }, budget: number, max = 10): SkillRow[] {
  const text = (ctx.text ?? '').toLowerCase();
  const brand = ctx.brand?.trim().toLowerCase() || null;
  const scored: { r: SkillRow; score: number; i: number }[] = [];
  rows.forEach((r, i) => {
    if (r.area !== 'all' && r.area !== use) return;
    if (ctx.extra && r.id === ctx.extra.id) return;
    const b = r.brand?.trim().toLowerCase() || null;
    const kws = skillWords(r.keywords);
    const hits = kws.filter((k) => mentions(text, k)).length;
    let score = hits;
    if (b) {
      if (brand && (brand === b || brand.includes(b) || b.includes(brand))) score += 3;
      else if (mentions(text, b)) score += 2;
      else if (use !== 'identify') return;
    } else if (kws.length && !hits && use === 'chat') return;
    if (use === 'identify' && r.area === 'all' && !hits) return;
    scored.push({ r, score: score + (r.area === use ? 0.5 : 0), i });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const out: SkillRow[] = ctx.extra ? [ctx.extra] : [];
  let used = ctx.extra ? ctx.extra.body.length : 0;
  for (const { r } of scored) {
    if (out.length >= max || used + r.body.length > budget) continue;
    out.push(r); used += r.body.length;
  }
  return out;
}
