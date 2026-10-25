import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evalCheck, latestCounting, rulesSnapshotHash } from '../src/shared/engine.ts';
import { decodeDateCode } from '../src/shared/datecode.ts';
import { coverageForModel } from '../src/shared/coverage.ts';
import type { DateCodeFormat, EvalInput, FactoryCode, Observation, Rule } from '../src/shared/types.ts';

const rule = (o: Partial<Rule> & Pick<Rule, 'id' | 'observationKey' | 'polarity'>): Rule => ({
  code: o.id.toUpperCase(), version: 1, brandId: 'b', modelId: null, eraId: null, componentCode: 'c',
  check: { type: 'in', values: ['x'] }, severity: 'minor', required: false, status: 'approved',
  titleEn: o.id, titleKm: o.id, ...o,
});
const ob = (key: string, value: unknown, source: Observation['source'] = 'appraiser', t = '2026-01-01T00:00:00Z'): Observation => ({ key, value, source, createdAt: t });
const base = (over: Partial<EvalInput> = {}): EvalInput => ({
  brandId: 'b', modelId: 'm', eraId: null, rules: [], observations: [], captures: [], templates: [], minAuthenticSupports: 3, ...over,
});

test('no approved rules → insufficient_evidence, draft rules are hints only', () => {
  const r = evaluate(base({
    rules: [rule({ id: 'd1', observationKey: 'k', polarity: 'concern_indicator', severity: 'major', status: 'draft', check: { type: 'in', values: ['bad'] } })],
    observations: [ob('k', 'bad')],
  }));
  assert.equal(r.outcome, 'insufficient_evidence');
  assert.equal(r.reasons[0].code, 'NO_APPROVED_RULES');
  assert.equal(r.hints.length, 1);
  assert.equal(r.hints[0].counted, false);
  assert.equal(r.hints[0].state, 'triggered'); // visible to the human, but did not change the outcome
});

test('approved major concern → concerns_found', () => {
  const r = evaluate(base({
    rules: [rule({ id: 'c1', observationKey: 'k', polarity: 'concern_indicator', severity: 'major', check: { type: 'in', values: ['bad'] } })],
    observations: [ob('k', 'bad')],
  }));
  assert.equal(r.outcome, 'concerns_found');
});

test('major concern + major authentic support → requires_expert_review (conflict)', () => {
  const r = evaluate(base({
    rules: [
      rule({ id: 'c1', observationKey: 'k1', polarity: 'concern_indicator', severity: 'major', check: { type: 'in', values: ['bad'] } }),
      rule({ id: 'a1', observationKey: 'k2', polarity: 'authentic_indicator', severity: 'major', check: { type: 'in', values: ['good'] } }),
    ],
    observations: [ob('k1', 'bad'), ob('k2', 'good')],
  }));
  assert.equal(r.outcome, 'requires_expert_review');
  assert.ok(r.reasons.some((x) => x.code === 'CONFLICTING_SIGNALS'));
});

test('enough approved supports and nothing else → consistent_with_references, never a certificate', () => {
  const rules = ['k1', 'k2', 'k3'].map((k, i) => rule({ id: `a${i}`, observationKey: k, polarity: 'authentic_indicator', check: { type: 'in', values: ['good'] } }));
  const r = evaluate(base({ rules, observations: [ob('k1', 'good'), ob('k2', 'good'), ob('k3', 'good')] }));
  assert.equal(r.outcome, 'consistent_with_references');
  assert.equal(r.humanSignoffRequired, true);
  assert.equal(r.isCertificate, false);
});

test('two supports where three are required → insufficient_evidence', () => {
  const rules = ['k1', 'k2', 'k3'].map((k, i) => rule({ id: `a${i}`, observationKey: k, polarity: 'authentic_indicator', check: { type: 'in', values: ['good'] } }));
  const r = evaluate(base({ rules, observations: [ob('k1', 'good'), ob('k2', 'good')] }));
  assert.equal(r.outcome, 'insufficient_evidence');
  assert.equal(r.reasons[0].code, 'INSUFFICIENT_SUPPORT');
});

test('missing required capture blocks consistency', () => {
  const rules = ['k1', 'k2', 'k3'].map((k, i) => rule({ id: `a${i}`, observationKey: k, polarity: 'authentic_indicator', check: { type: 'in', values: ['good'] } }));
  const r = evaluate(base({
    rules, observations: [ob('k1', 'good'), ob('k2', 'good'), ob('k3', 'good')],
    templates: [{ code: 'zipper_pull', required: true }, { code: 'front', required: true }], captures: [{ templateCode: 'front' }],
  }));
  assert.equal(r.outcome, 'insufficient_evidence');
  assert.deepEqual(r.missingCaptures, ['zipper_pull']);
});

test('required authentic feature that does not match → requires_expert_review', () => {
  const r = evaluate(base({
    rules: [rule({ id: 'a1', observationKey: 'k', polarity: 'authentic_indicator', required: true, check: { type: 'in', values: ['even'] } })],
    observations: [ob('k', 'uneven')],
  }));
  assert.equal(r.outcome, 'requires_expert_review');
  assert.ok(r.reasons.some((x) => x.code === 'UNSUPPORTED_REQUIRED_FEATURE'));
});

test('AI-suggested observations never count until confirmed', () => {
  const rules = [rule({ id: 'c1', observationKey: 'k', polarity: 'concern_indicator', severity: 'major', check: { type: 'in', values: ['bad'] } })];
  const suggested = evaluate(base({ rules, observations: [ob('k', 'bad', 'ai_suggested')] }));
  assert.notEqual(suggested.outcome, 'concerns_found');
  assert.deepEqual(suggested.pendingAiObservations, ['k']);
  const confirmed = evaluate(base({ rules, observations: [ob('k', 'bad', 'ai_suggested'), ob('k', 'bad', 'ai_confirmed', '2026-01-02T00:00:00Z')] }));
  assert.equal(confirmed.outcome, 'concerns_found');
});

test('latest observation wins; scope filters by model and era', () => {
  assert.equal(latestCounting([ob('k', 'a', 'appraiser', '2026-01-01T00:00:00Z'), ob('k', 'b', 'appraiser', '2026-01-02T00:00:00Z')]).get('k')!.value, 'b');
  const eraOnly = rule({ id: 'c1', observationKey: 'k', polarity: 'concern_indicator', severity: 'major', eraId: 'e1', check: { type: 'in', values: ['bad'] } });
  assert.equal(evaluate(base({ rules: [eraOnly], observations: [ob('k', 'bad')], eraId: 'e2' })).reasons[0].code, 'NO_APPROVED_RULES');
  assert.equal(evaluate(base({ rules: [eraOnly], observations: [ob('k', 'bad')], eraId: 'e1' })).outcome, 'concerns_found');
});

test('evalCheck variants', () => {
  assert.equal(evalCheck({ type: 'range', min: 21, max: 23 }, 22.4), true);
  assert.equal(evalCheck({ type: 'range', min: 21, max: 23 }, 'abc'), false);
  assert.equal(evalCheck({ type: 'regex', pattern: '^SD' }, 'SD0240'), true);
  assert.equal(evalCheck({ type: 'present' }, ''), false);
  assert.equal(evalCheck({ type: 'equals', value: true }, true), true);
});

// ───── date code (using the same draft data as the seed) ─────
const fmt = (status: DateCodeFormat['status']): DateCodeFormat[] => [
  { id: 'f90', name: '1990–2006', startYear: 1990, endYear: 2006, pattern: '^([A-Z]{2})(\\d)(\\d)(\\d)(\\d)$', status,
    extraction: { factoryGroup: 1, periodGroups: [2, 4], yearGroups: [3, 5], periodUnit: 'month', yearPivot: 90 } },
  { id: 'f07', name: '2007–2020', startYear: 2007, endYear: 2020, pattern: '^([A-Z]{2})(\\d)(\\d)(\\d)(\\d)$', status,
    extraction: { factoryGroup: 1, periodGroups: [2, 4], yearGroups: [3, 5], periodUnit: 'unconfirmed', yearPivot: 100 } },
];
const fac = (status: FactoryCode['status']): FactoryCode[] => [{ code: 'SD', country: 'United States', location: 'San Dimas, California', status }];

test('SD0240 decodes to year 2020 candidate; draft tables are shown but not usable', () => {
  const d = decodeDateCode('sd 0240', fmt('draft'), fac('draft'));
  assert.equal(d.normalized, 'SD0240');
  assert.equal(d.usable, false);
  assert.equal(d.state, 'unknown');
  const c = d.candidates.find((x) => x.formatId === 'f07')!;
  assert.equal(c.year, 2020);
  assert.equal(c.period, 4);
  assert.equal(c.factory, 'SD');
  assert.equal(c.country, 'United States');
  assert.equal(d.candidates.find((x) => x.formatId === 'f90')!.yearInFormatRange, false); // 2020 is outside 1990–2006
});

test('approved tables: consistent when year matches claim, inconsistent when era ends earlier', () => {
  const ok = decodeDateCode('SD0230', fmt('approved'), fac('approved'), { claimedYear: 2020, eraStart: 2019, eraEnd: 2023 });
  assert.equal(ok.usable, true); assert.equal(ok.state, 'consistent');
  const bad = decodeDateCode('SD0230', fmt('approved'), fac('approved'), { eraStart: 2007, eraEnd: 2019 });
  assert.equal(bad.state, 'inconsistent');
});

test('1990s two-digit year pivot', () => {
  const d = decodeDateCode('SD0997', fmt('approved'), fac('approved'));
  assert.equal(d.candidates.find((x) => x.formatId === 'f90')!.year, 1997);
});

test('date-code mismatch from approved tables is a major concern in the engine', () => {
  const dc = decodeDateCode('SD0230', fmt('approved'), fac('approved'), { eraStart: 2007, eraEnd: 2019 });
  const r = evaluate(base({ rules: [rule({ id: 'a1', observationKey: 'k', polarity: 'authentic_indicator' })], datecode: dc }));
  assert.equal(r.outcome, 'concerns_found');
  assert.ok(r.reasons.some((x) => x.code === 'DATECODE_MISMATCH'));
});

test('rules snapshot hash is stable and ignores non-approved rules', async () => {
  const a = rule({ id: 'a', observationKey: 'k', polarity: 'authentic_indicator' });
  const d = rule({ id: 'd', observationKey: 'k2', polarity: 'authentic_indicator', status: 'draft' });
  assert.equal(await rulesSnapshotHash([a]), await rulesSnapshotHash([d, a]));
});

// ───── coverage ─────
test('coverage levels and needs', () => {
  const t = { minApprovedRules: 3, retrievalMinAuthentic: 5, finetuneMinAuthentic: 30, finetuneMinCounterfeit: 10 };
  const e = (o: object) => ({ eraId: 'e', eraName: 'n', eraStatus: 'APPROVED' as const, identifierType: 'DATE_CODE' as const, approvedRules: 0, approvedAuthenticAssets: 0, approvedCounterfeitAssets: 0, approvedDateCodeFormats: 0, ...o });
  assert.equal(coverageForModel([], t)[0].level, 'L0_no_approved_era');
  const l1 = coverageForModel([e({})], t)[0];
  assert.equal(l1.level, 'L1_checklist_only');
  assert.ok(l1.needs.some((n) => n.need === 'date_code_format_approved'));
  assert.equal(coverageForModel([e({ approvedRules: 3, approvedDateCodeFormats: 1 })], t)[0].level, 'L2_rules_ready');
  assert.equal(coverageForModel([e({ approvedRules: 3, approvedAuthenticAssets: 5, approvedDateCodeFormats: 1 })], t)[0].level, 'L3_retrieval_ready');
  assert.equal(coverageForModel([e({ approvedRules: 3, approvedAuthenticAssets: 30, approvedCounterfeitAssets: 10, approvedDateCodeFormats: 1 })], t)[0].level, 'L4_finetune_ready');
});
