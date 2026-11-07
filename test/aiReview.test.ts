import test from 'node:test';
import assert from 'node:assert/strict';
import { noVerdict, parseAiReview, trackRecord } from '../src/shared/aiReview.ts';

test('AI review: only the four outcomes, verdict words replaced, values clamped', () => {
  const r = parseAiReview('x {"suggestion":"concerns_found","confidence":1.4,"summary_en":"Looks fake around the stamp","summary_km":"…","findings":[{"step":"logo","feature_en":"Heat stamp","status":"differs","confidence":0.8,"note_en":"Letters thicker than the authentic reference"},{"step":"zzz","feature_en":"Zip","status":"weird","confidence":-1}]} y');
  assert.ok(r);
  assert.equal(r!.suggestion, 'concerns_found');
  assert.equal(r!.confidence, 1);
  assert.equal(r!.summary_en, 'Looks concerning around the stamp');
  assert.equal(r!.findings[0].note_en, 'Letters thicker than the consistent with references reference');
  assert.equal(r!.findings[1].step, 'extra');
  assert.equal(r!.findings[1].status, 'unclear');
  assert.equal(r!.findings[1].confidence, 0);
  assert.equal(parseAiReview('{"suggestion":"authentic","confidence":0.9}'), null);
  assert.equal(noVerdict('100% genuine'), 'consistent with references');
});

test('track record counts agreement with the expert', () => {
  const t = trackRecord([{ suggested: 'concerns_found', expert: 'concerns_found' }, { suggested: 'concerns_found', expert: 'consistent_with_references' }, { suggested: 'consistent_with_references', expert: 'consistent_with_references' }]);
  assert.equal(t.n, 3); assert.equal(t.agree, 2); assert.equal(t.bySuggestion.concerns_found.n, 2);
});

import { customerPrecheck, noVerdictKm, precheckLevel } from '../src/shared/aiReview.ts';

test('pre-check levels never say authentic: the best is "no differences seen"', () => {
  assert.equal(precheckLevel('consistent_with_references'), 'no_differences_seen');
  assert.equal(precheckLevel('concerns_found'), 'concerns');
  assert.equal(precheckLevel('insufficient_evidence'), 'more_photos');
  assert.equal(precheckLevel('requires_expert_review'), 'unclear');
  assert.equal(precheckLevel(null), 'unclear');
});

test('Khmer verdict words are replaced, real leather is kept', () => {
  assert.equal(noVerdictKm('កាបូបនេះក្លែងក្លាយ'), 'កាបូបនេះមិនស្របនឹងរូបគំរូ');
  assert.ok(!noVerdictKm('នេះជាកាបូបពិតប្រាកដ').includes('ពិត'));
  assert.equal(noVerdictKm('ស្បែកពិត ស្អាត'), 'ស្បែកពិត ស្អាត');
});

test('customer pre-check hides verdict words and needs a successful review', () => {
  assert.equal(customerPrecheck({ suggested_outcome: null, findings_json: '[]', summary_en: null, summary_km: null }), null);
  const p = customerPrecheck({ suggested_outcome: 'concerns_found', summary_en: 'Looks fake around the logo', summary_km: 'ឡូហ្គោក្លែង',
    findings_json: JSON.stringify([{ step: 'logo', feature_en: 'Logo', feature_km: 'ឡូហ្គោ', status: 'differs', confidence: 0.8, note_en: 'counterfeit font', note_km: 'អក្សរក្លែង' }]) })!;
  assert.equal(p.level, 'concerns');
  assert.ok(!/fake|counterfeit/i.test(JSON.stringify(p)));
  assert.ok(!JSON.stringify(p).includes('ក្លែង'));
});
