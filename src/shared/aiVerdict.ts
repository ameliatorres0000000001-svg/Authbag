// AI final verdict for the customer (owner decision, 2026-11-13): the AI scores each checkpoint 0–100 and the
// verdict is computed HERE, in code, from those scores — weighted, with hard rules — so the same scores always give
// the same verdict. The AI's own words never decide it. It is an AI result from photos, never a certificate.

export type AiVerdict = 'authentic' | 'counterfeit' | 'unidentified';
export type ScoreStatus = 'matches' | 'differs' | 'unclear';
export interface ScoredFinding { step: string; status: ScoreStatus; confidence: number; score?: number | null }
export interface PhotoQ { quality: 'clear' | 'soft' | 'unclear' }

/** Weight of each checkpoint in the final score (sums to 100). "model" (shape) and "extra" are shown but not weighted. */
export const STEP_WEIGHTS: Record<string, number> = { logo: 30, serial: 25, material: 20, hardware: 15, zipper: 10 };
/** Checkpoints that must be seen clearly before any verdict. */
export const KEY_STEPS = ['logo', 'serial', 'hardware'] as const;
export const AUTHENTIC_MIN = 90;
/** A clear difference this low on a weighted checkpoint, seen with this confidence, means counterfeit. */
export const COUNTERFEIT_MAX_SCORE = 60;
export const COUNTERFEIT_MIN_CONF = 0.6;

export interface StepScore { step: string; score: number | null; status: ScoreStatus; weight: number }
export interface VerdictResult { verdict: AiVerdict; score: number | null; reason: 'retake' | 'difference' | 'all_clear' | 'mixed'; steps: StepScore[] }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

/** One score per checkpoint: the lowest scored finding of that step (one bad point is enough to pull it down). */
export function stepScores(findings: ScoredFinding[]): StepScore[] {
  const order = ['logo', 'serial', 'material', 'hardware', 'zipper', 'model'];
  const out: StepScore[] = [];
  for (const step of order) {
    const fs = findings.filter((f) => f.step === step);
    if (!fs.length) continue;
    const seen = fs.filter((f) => f.status !== 'unclear' && num(f.score) !== null);
    const score = seen.length ? Math.min(...seen.map((f) => num(f.score) as number)) : null;
    const status: ScoreStatus = fs.some((f) => f.status === 'differs') ? 'differs' : seen.length ? 'matches' : 'unclear';
    out.push({ step, score, status, weight: STEP_WEIGHTS[step] ?? 0 });
  }
  return out;
}

/** Weighted total over the weighted checkpoints that have a score (re-normalised to 100). */
export function weightedScore(steps: StepScore[]): number | null {
  const w = steps.filter((s) => s.weight > 0 && s.score !== null);
  const sum = w.reduce((a, s) => a + s.weight, 0);
  return sum ? Math.round(w.reduce((a, s) => a + (s.score as number) * s.weight, 0) / sum) : null;
}

export function computeVerdict(findings: ScoredFinding[], photos: PhotoQ[] = []): VerdictResult {
  const steps = stepScores(findings);
  const score = weightedScore(steps);
  const differs = findings.some((f) => (STEP_WEIGHTS[f.step] ?? 0) > 0 && f.status === 'differs'
    && (num(f.score) ?? 0) <= COUNTERFEIT_MAX_SCORE && (Number(f.confidence) || 0) >= COUNTERFEIT_MIN_CONF);
  if (differs) return { verdict: 'counterfeit', score, reason: 'difference', steps };
  const keyMissing = KEY_STEPS.some((k) => { const s = steps.find((x) => x.step === k); return !s || s.score === null; });
  if (keyMissing || photos.some((p) => p.quality === 'unclear') || score === null) return { verdict: 'unidentified', score, reason: 'retake', steps };
  const anyDiff = steps.some((s) => s.status === 'differs');
  if (!anyDiff && score >= AUTHENTIC_MIN) return { verdict: 'authentic', score, reason: 'all_clear', steps };
  return { verdict: 'unidentified', score, reason: 'mixed', steps };
}
