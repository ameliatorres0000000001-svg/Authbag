// Parsing and checking an AI review of a verification request. The AI only compares photos with references and
// suggests one of the system's four outcomes; words that would read as a verdict are replaced.

export const OUTCOMES = ['consistent_with_references', 'concerns_found', 'insufficient_evidence', 'requires_expert_review'] as const;
export type Outcome4 = (typeof OUTCOMES)[number];
export type FindingStatus = 'matches' | 'differs' | 'unclear';
export interface Finding { step: string; feature_en: string; feature_km: string; status: FindingStatus; confidence: number; note_en: string; note_km: string }
export interface AiReview { suggestion: Outcome4; confidence: number; findings: Finding[]; summary_en: string; summary_km: string }

const STEPS = ['model', 'logo', 'serial', 'material', 'hardware', 'zipper', 'extra'];
const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Replace verdict words in English text: the expert decides, not the AI. */
export function noVerdict(s: string): string {
  return s
    .replace(/\b(100% )?(authentic|genuine|real)\b/gi, 'consistent with references')
    .replace(/\b(fake|counterfeit|replica|knock-?off|not authentic)\b/gi, 'concerning');
}

export function parseAiReview(text: string): AiReview | null {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any;
  try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { return null; }
  if (!o || !OUTCOMES.includes(o.suggestion)) return null;
  const findings: Finding[] = (Array.isArray(o.findings) ? o.findings : []).slice(0, 30).map((f: any) => ({
    step: STEPS.includes(f?.step) ? f.step : 'extra',
    feature_en: noVerdict(txt(f?.feature_en, 80)), feature_km: txt(f?.feature_km, 80),
    status: (['matches', 'differs', 'unclear'] as const).includes(f?.status) ? f.status : 'unclear',
    confidence: clamp01(f?.confidence),
    note_en: noVerdict(txt(f?.note_en, 300)), note_km: txt(f?.note_km, 300),
  })).filter((f: Finding) => f.feature_en || f.feature_km);
  return { suggestion: o.suggestion, confidence: clamp01(o.confidence), findings, summary_en: noVerdict(txt(o.summary_en, 1500)), summary_km: txt(o.summary_km, 1500) };
}

/** How often the AI's suggestion matched the expert's answer. */
export function trackRecord(rows: { suggested: string; expert: string }[]) {
  const n = rows.length;
  const agree = rows.filter((r) => r.suggested === r.expert).length;
  const by: Record<string, { n: number; agree: number }> = {};
  for (const r of rows) { by[r.suggested] ??= { n: 0, agree: 0 }; by[r.suggested].n++; if (r.suggested === r.expert) by[r.suggested].agree++; }
  return { n, agree, rate: n ? agree / n : null, bySuggestion: by };
}

// ── AI pre-check: what the CUSTOMER sees when expert review is paused ──────────────────────────────────────────
// The AI's comparison point by point (matches / differs / unclear) and a capped summary. It is never a
// verification: the AI can ask for photos, point out concerns or say it cannot tell, and at most that it saw
// no differences IN THESE PHOTOS — never "authentic", never a certificate.
export type PrecheckLevel = 'more_photos' | 'concerns' | 'unclear' | 'no_differences_seen';
export const precheckLevel = (o: string | null | undefined): PrecheckLevel =>
  o === 'insufficient_evidence' ? 'more_photos' : o === 'concerns_found' ? 'concerns' : o === 'consistent_with_references' ? 'no_differences_seen' : 'unclear';

/** Replace Khmer verdict words (counterfeit / genuine) in text shown to customers. "ស្បែកពិត" (real leather) is kept. */
export function noVerdictKm(s: string): string {
  return s
    .replace(/ក្លែង(?:ក្លាយ)?/g, 'មិនស្របនឹងរូបគំរូ')
    .replace(/កាបូប(?:ពិត|ដើម|សុទ្ធ)(?:ប្រាកដ)?/g, 'កាបូប')
    .replace(/ពិតប្រាកដ/g, 'ស្របនឹងរូបគំរូ');
}

export interface PrecheckFinding { step: string; feature_en: string; feature_km: string; status: FindingStatus; note_en: string; note_km: string }
export interface Precheck { level: PrecheckLevel; summary_en: string; summary_km: string; findings: PrecheckFinding[] }

/** Build the customer view from a stored AI review (verify_ai_reviews row). Null when the review failed. */
export function customerPrecheck(row: { suggested_outcome: string | null; findings_json: string | null; summary_en: string | null; summary_km: string | null }): Precheck | null {
  if (!row.suggested_outcome) return null;
  let fs: Finding[] = [];
  try { fs = JSON.parse(row.findings_json || '[]'); } catch { fs = []; }
  return {
    level: precheckLevel(row.suggested_outcome),
    summary_en: noVerdict(row.summary_en ?? ''), summary_km: noVerdictKm(row.summary_km ?? ''),
    findings: fs.map((f) => ({ step: f.step, feature_en: noVerdict(f.feature_en), feature_km: noVerdictKm(f.feature_km), status: f.status, note_en: noVerdict(f.note_en), note_km: noVerdictKm(f.note_km) })),
  };
}
