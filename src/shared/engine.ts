import type {
  Check, EvalInput, EvalResult, Observation, Primitive, ReasonCode, Rule, RuleResult,
} from './types.ts';

export const ENGINE_VERSION = '1.0.0';

const COUNTING_SOURCES = new Set(['appraiser', 'ai_confirmed', 'system']);

/** Latest COUNTING observation per key. ai_suggested values are ignored until an appraiser confirms them. */
export function latestCounting(observations: Observation[]): Map<string, Observation> {
  const out = new Map<string, Observation>();
  for (const o of observations) {
    if (!COUNTING_SOURCES.has(o.source)) continue;
    const prev = out.get(o.key);
    if (!prev || o.createdAt >= prev.createdAt) out.set(o.key, o);
  }
  return out;
}

export function evalCheck(check: Check, value: unknown): boolean {
  switch (check.type) {
    case 'present': return value !== null && value !== undefined && value !== '';
    case 'equals': return value === check.value;
    case 'in': return check.values.includes(value as Primitive);
    case 'range': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return false;
      return (check.min == null || n >= check.min) && (check.max == null || n <= check.max);
    }
    case 'regex': {
      try { return new RegExp(check.pattern).test(String(value)); } catch { return false; }
    }
  }
}

function applicable(rule: Rule, i: EvalInput): boolean {
  if (rule.brandId !== i.brandId) return false;
  if (rule.modelId !== null && rule.modelId !== i.modelId) return false;
  if (rule.eraId !== null && rule.eraId !== i.eraId) return false;
  return true;
}

/**
 * Deterministic evaluation. The ONLY inputs are: approved rules, counting observations, captures and (approved-table) date-code result.
 * No model score, no probability, no guessing. Same input => same output.
 *
 * Precedence:
 *  1. no approved applicable rules            -> insufficient_evidence
 *  2. major concern (rule or date-code)       -> concerns_found, or requires_expert_review if major authentic support conflicts
 *  3. required captures / observations missing-> insufficient_evidence
 *  4. minor concern or unsupported required   -> requires_expert_review
 *  5. enough supports                         -> consistent_with_references
 *  6. otherwise                               -> insufficient_evidence
 * The result is NEVER a certificate and ALWAYS needs a named human sign-off.
 */
export function evaluate(input: EvalInput): EvalResult {
  const obs = latestCounting(input.observations);
  const pendingAi = [...new Set(
    input.observations.filter((o) => o.source === 'ai_suggested' && !obs.has(o.key)).map((o) => o.key),
  )];

  const scoped = input.rules.filter((r) => r.status !== 'retired' && applicable(r, input));
  const approved = scoped.filter((r) => r.status === 'approved');
  const unapproved = scoped.filter((r) => r.status === 'draft' || r.status === 'pending_review');

  const resultFor = (r: Rule, counted: boolean): RuleResult => {
    const o = obs.get(r.observationKey);
    const base = {
      ruleId: r.id, code: r.code, titleEn: r.titleEn, titleKm: r.titleKm, componentCode: r.componentCode,
      polarity: r.polarity, severity: r.severity, required: r.required, counted,
    };
    if (!o) return { ...base, state: 'unassessed' };
    const matched = evalCheck(r.check, o.value);
    if (r.polarity === 'concern_indicator') return { ...base, state: matched ? 'triggered' : 'not_matched', observed: o.value };
    return { ...base, state: matched ? 'supported' : 'not_matched', observed: o.value };
  };

  const ruleResults = approved.map((r) => resultFor(r, true));
  const hints = unapproved.map((r) => resultFor(r, false));

  const missingCaptures = input.templates
    .filter((t) => t.required && !input.captures.some((c) => c.templateCode === t.code))
    .map((t) => t.code);
  const missingRequiredObservations = approved
    .filter((r) => r.required && !obs.has(r.observationKey))
    .map((r) => r.code);

  const reasons: EvalResult['reasons'] = [];
  const add = (code: ReasonCode, detail?: string) => reasons.push({ code, detail });

  const dc = input.datecode ?? null;
  const dcMismatch = !!dc && dc.usable && dc.state === 'inconsistent';
  const dcSupport = !!dc && dc.usable && dc.state === 'consistent';

  const triggeredMajor = ruleResults.filter((r) => r.state === 'triggered' && r.severity === 'major');
  const triggeredMinor = ruleResults.filter((r) => r.state === 'triggered' && r.severity !== 'major');
  const supported = ruleResults.filter((r) => r.state === 'supported');
  const supportedMajor = supported.filter((r) => r.severity === 'major');
  const unsupportedRequired = ruleResults.filter((r) => r.required && r.polarity === 'authentic_indicator' && r.state === 'not_matched');

  const finish = (outcome: EvalResult['outcome']): EvalResult => ({
    engineVersion: ENGINE_VERSION, outcome, reasons, ruleResults, hints,
    missingCaptures, missingRequiredObservations, pendingAiObservations: pendingAi,
    datecode: dc, humanSignoffRequired: true, isCertificate: false,
  });

  if (approved.length === 0) {
    add('NO_APPROVED_RULES', 'No expert-approved rule applies to this brand/model/era. Draft rules are shown as unverified hints only.');
    return finish('insufficient_evidence');
  }

  if (triggeredMajor.length > 0 || dcMismatch) {
    triggeredMajor.forEach((r) => add('MAJOR_CONCERN', r.code));
    if (dcMismatch) add('DATECODE_MISMATCH', dc!.reason);
    if (supportedMajor.length > 0) {
      add('CONFLICTING_SIGNALS', `${supportedMajor.map((r) => r.code).join(', ')} support authenticity while a major concern is present`);
      return finish('requires_expert_review');
    }
    return finish('concerns_found');
  }

  if (missingCaptures.length > 0) add('MISSING_REQUIRED_CAPTURES', missingCaptures.join(', '));
  if (missingRequiredObservations.length > 0) add('MISSING_REQUIRED_OBSERVATIONS', missingRequiredObservations.join(', '));
  if (missingCaptures.length > 0 || missingRequiredObservations.length > 0) return finish('insufficient_evidence');

  if (triggeredMinor.length > 0 || unsupportedRequired.length > 0) {
    triggeredMinor.forEach((r) => add('MINOR_CONCERN', r.code));
    unsupportedRequired.forEach((r) => add('UNSUPPORTED_REQUIRED_FEATURE', r.code));
    return finish('requires_expert_review');
  }

  const supports = supported.length + (dcSupport ? 1 : 0);
  if (supports >= input.minAuthenticSupports) {
    add('SUFFICIENT_SUPPORT', `${supports} approved checks support consistency with references (minimum ${input.minAuthenticSupports}).`);
    return finish('consistent_with_references');
  }

  add('INSUFFICIENT_SUPPORT', `${supports} of ${input.minAuthenticSupports} required supporting checks.`);
  return finish('insufficient_evidence');
}

/** Hash of the exact approved rule set used (for the immutable evaluations table). Works in Node >=20, Workers and browsers. */
export async function rulesSnapshotHash(rules: Rule[]): Promise<string> {
  const stable = rules
    .filter((r) => r.status === 'approved')
    .map((r) => `${r.code}@${r.version}:${r.observationKey}:${JSON.stringify(r.check)}:${r.polarity}:${r.severity}:${r.required}`)
    .sort()
    .join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
