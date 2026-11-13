// Parsing and checking an AI review of a verification request. The AI only compares photos with references and
// suggests one of the system's four outcomes; words that would read as a verdict are replaced.

import { computeVerdict, type VerdictResult } from './aiVerdict.ts';

export const OUTCOMES = ['consistent_with_references', 'concerns_found', 'insufficient_evidence', 'requires_expert_review'] as const;
export type Outcome4 = (typeof OUTCOMES)[number];
export type FindingStatus = 'matches' | 'differs' | 'unclear';
export interface Finding { step: string; feature_en: string; feature_km: string; status: FindingStatus; confidence: number; score?: number | null; note_en: string; note_km: string }
export type PhotoQuality = 'clear' | 'soft' | 'unclear';
/** How clear one customer photo was for the AI. `image` is the 1-based position among the customer photos sent. */
export interface PhotoCheck { image: number; quality: PhotoQuality; note_en: string; note_km: string }
export interface AiReview { suggestion: Outcome4; confidence: number; findings: Finding[]; summary_en: string; summary_km: string; photos: PhotoCheck[] }

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
    score: Number.isFinite(Number(f?.score)) && f?.score !== null && f?.score !== '' ? Math.max(0, Math.min(100, Math.round(Number(f.score)))) : null,
    note_en: noVerdict(txt(f?.note_en, 300)), note_km: txt(f?.note_km, 300),
  })).filter((f: Finding) => f.feature_en || f.feature_km);
  const seen = new Set<number>();
  const photos: PhotoCheck[] = (Array.isArray(o.photos) ? o.photos : []).flatMap((p: any) => {
    const n = Number(p?.image);
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) return [];
    seen.add(n);
    const quality: PhotoQuality = (['clear', 'soft', 'unclear'] as const).includes(p?.quality) ? p.quality : 'unclear';
    return [{ image: n, quality, note_en: noVerdict(txt(p?.note_en, 200)), note_km: noVerdictKm(txt(p?.note_km, 200)) }];
  }).slice(0, 12);
  return { suggestion: o.suggestion, confidence: clamp01(o.confidence), findings, summary_en: noVerdict(txt(o.summary_en, 1500)), summary_km: txt(o.summary_km, 1500), photos };
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

export interface PrecheckFinding { step: string; feature_en: string; feature_km: string; status: FindingStatus; score: number | null; note_en: string; note_km: string }
export interface PrecheckPhoto { photo_id: string; step: string; quality: PhotoQuality; note_en: string; note_km: string }
export interface Precheck { level: PrecheckLevel; summary_en: string; summary_km: string; findings: PrecheckFinding[]; photos: PrecheckPhoto[]; verdict: VerdictResult }

/** Build the customer view from a stored AI review (verify_ai_reviews row). Null when the review failed. */
export function customerPrecheck(row: { suggested_outcome: string | null; findings_json: string | null; summary_en: string | null; summary_km: string | null; photos_json?: string | null }): Precheck | null {
  if (!row.suggested_outcome) return null;
  let fs: Finding[] = [];
  try { fs = JSON.parse(row.findings_json || '[]'); } catch { fs = []; }
  const photos = readPhotos(row.photos_json);
  return {
    level: precheckLevel(row.suggested_outcome),
    summary_en: noVerdict(row.summary_en ?? ''), summary_km: noVerdictKm(row.summary_km ?? ''),
    findings: fs.map((f) => ({ step: f.step, feature_en: noVerdict(f.feature_en), feature_km: noVerdictKm(f.feature_km), status: f.status, score: f.score ?? null, note_en: noVerdict(f.note_en), note_km: noVerdictKm(f.note_km) })),
    photos,
    // the verdict is computed in code from the AI's per-point scores (see aiVerdict.ts); "insufficient" photos never pass
    verdict: row.suggested_outcome === 'insufficient_evidence'
      ? { ...computeVerdict(fs, photos), verdict: 'unidentified', reason: 'retake' }
      : computeVerdict(fs, photos),
  };
}

function readPhotos(json: string | null | undefined): PrecheckPhoto[] {
  let ps: unknown;
  try { ps = JSON.parse(json || '[]'); } catch { return []; }
  if (!Array.isArray(ps)) return [];
  return ps.filter((p) => p && typeof p.photo_id === 'string').map((p) => ({
    photo_id: p.photo_id, step: String(p.step ?? 'extra'), quality: (['clear', 'soft', 'unclear'] as const).includes(p.quality) ? p.quality : 'unclear',
    note_en: noVerdict(String(p.note_en ?? '')), note_km: noVerdictKm(String(p.note_km ?? '')),
  }));
}
