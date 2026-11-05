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
