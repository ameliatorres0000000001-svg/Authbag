// The teaching guide for one numbered box on an original (reference) photo: where to look, what the original shows,
// and the common red flag of a copy at that spot. Written once by the AI, stored on the point, shown to everyone
// without another AI call. Format v2 (owner's prompt, 2026-11-13): popup_text / where_to_look / original_trait /
// fake_red_flag. It teaches about the reference model; it never judges a customer's bag.

export interface GuideText { title: string; popup: string; look_at: string; match: string; differs: string }
export interface PointGuide { v?: number; km: GuideText; en: GuideText }
/** Current guide format; older stored guides are rewritten by the refresh job. */
export const GUIDE_VERSION = 2;

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Remove the robotic phrases the owner banned ("ក្នុងរូបនេះ៖ ឃើញ…", "ប្រៀបធៀប… ជាមួយរូបយោង", "in this photo:"). */
export function cleanGuideText(s: string): string {
  return s
    .replace(/(?:📷\s*)?ក្នុងរូបនេះ\s*[៖:]?\s*(?:ឃើញ\s*)?/g, '')
    .replace(/\s*(?:ជាមួយ|នឹង)\s*(?:រូបយោង|រូបគំរូ|ឯកសារយោង)(?:\s*(?:ច្បាស់ៗ\s*)?(?:របស់|នៃ)?\s*ម៉ូដែលនេះ)?/g, '')
    .replace(/^\s*ប្រៀបធៀប\s*/, 'មើល ')
    .replace(/\b(?:in this photo|compare (?:it )?with (?:the )?references?)\s*[:,]?\s*/gi, '')
    .replace(/\s+([។,.])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function side(o: Record<string, unknown>, lang: 'km' | 'en'): GuideText | null {
  // v2 names first; the v1 names are still read so a half-updated answer is not lost
  const pick = (a: string, b: string, max: number) => cleanGuideText(txt(o[`${a}_${lang}`] ?? o[`${b}_${lang}`], max));
  const g = {
    title: pick('title', 'title', 60),
    popup: pick('popup_text', 'popup', 220),
    look_at: pick('where_to_look', 'look_at', 220),
    match: pick('original_trait', 'match', 300),
    differs: pick('fake_red_flag', 'differs', 300),
  };
  return g.title && g.popup ? g : null;
}

/**
 * Read the AI's answer: {"model_summary_kh", "annotations":[{"box_id":1,"title_kh",…,"title_en",…}]} → box number → guide.
 * Khmer fields may be named _kh (owner's format) or _km. A box needs a title and a popup in both languages
 * (English falls back to Khmer). Never throws.
 */
export function parseGuides(text: string, boxes: number): Map<number, PointGuide> {
  const out = new Map<number, PointGuide>();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null;
  try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const list = Array.isArray(o?.annotations) ? o.annotations : [];
  for (const x of list) {
    const n = Number(x?.box_id);
    if (!x || typeof x !== 'object' || !Number.isInteger(n) || n < 1 || n > boxes || out.has(n)) continue;
    const kmObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) kmObj[k.replace(/_kh$/, '_km')] = v;
    const km = side(kmObj, 'km');
    const en = side(x, 'en') ?? km;
    if (km && en) out.set(n, { v: GUIDE_VERSION, km, en });
  }
  return out;
}

/** The model summary line of the answer (Khmer and English), if the AI wrote one. */
export function parseSummary(text: string): { km: string; en: string } | null {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  try {
    const o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null;
    const km = cleanGuideText(txt(o?.model_summary_kh ?? o?.model_summary_km, 300));
    return km ? { km, en: cleanGuideText(txt(o?.model_summary_en, 300)) || km } : null;
  } catch { return null; }
}

/** The guide in the viewer's language (Khmer for km, English otherwise), or null if the point has none. */
export function guideFor(json: string | null | undefined, locale: string): GuideText | null {
  if (!json) return null;
  try { const g = JSON.parse(json) as PointGuide; return (locale === 'km' ? g.km : g.en) ?? null; } catch { return null; }
}

/** True when a stored guide is in the current format. */
export const isCurrentGuide = (json: string | null | undefined) => {
  if (!json) return false;
  try { return (JSON.parse(json) as PointGuide).v === GUIDE_VERSION; } catch { return false; }
};
