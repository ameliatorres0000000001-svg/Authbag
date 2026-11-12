// The teaching guide for one numbered box on an original (reference) photo: what to look at, what the original shows,
// and what differs from it. Written once by the AI, stored on the point, shown to everyone without another AI call.
import { noVerdict, noVerdictKm } from './aiReview.ts';

export interface GuideText { title: string; popup: string; look_at: string; match: string; differs: string }
export interface PointGuide { km: GuideText; en: GuideText }

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function side(o: Record<string, unknown>, lang: 'km' | 'en'): GuideText | null {
  const clean = lang === 'km' ? noVerdictKm : noVerdict;
  const g = {
    title: clean(txt(o[`title_${lang}`], 60)),
    popup: clean(txt(o[`popup_${lang}`], 200)),
    look_at: clean(txt(o[`look_at_${lang}`], 200)),
    match: clean(txt(o[`match_${lang}`], 300)),
    differs: clean(txt(o[`differs_${lang}`], 300)),
  };
  return g.title && g.popup ? g : null;
}

/**
 * Read the AI's answer: {"annotations":[{"box_id":1,"title_km",…,"title_en",…}]} → box number → guide.
 * A box needs a title and a popup in both languages; verdict words (authentic / fake, ពិតប្រាកដ / ក្លែង) are replaced,
 * because a reference photo teaches what to compare, it never judges a bag. Never throws.
 */
export function parseGuides(text: string, boxes: number): Map<number, PointGuide> {
  const out = new Map<number, PointGuide>();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null;
  try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const list = Array.isArray(o?.annotations) ? o.annotations : [];
  for (const x of list) {
    const n = Number(x?.box_id);
    if (!Number.isInteger(n) || n < 1 || n > boxes || out.has(n)) continue;
    const km = side(x, 'km'), en = side(x, 'en');
    if (km && en) out.set(n, { km, en });
  }
  return out;
}

/** The guide in the viewer's language (Khmer for km, English otherwise), or null if the point has none. */
export function guideFor(json: string | null | undefined, locale: string): GuideText | null {
  if (!json) return null;
  try { const g = JSON.parse(json) as PointGuide; return (locale === 'km' ? g.km : g.en) ?? null; } catch { return null; }
}
