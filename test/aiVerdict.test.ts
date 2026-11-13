import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, weightedScore, stepScores } from '../src/shared/aiVerdict.ts';

const f = (step: string, score: number | null, status: 'matches' | 'differs' | 'unclear' = 'matches', confidence = 0.9) => ({ step, score, status, confidence });
const all = (n: number) => ['logo', 'serial', 'material', 'hardware', 'zipper'].map((s) => f(s, n));

test('all key parts clear and 90+ → authentic with the weighted score', () => {
  const r = computeVerdict([f('logo', 98), f('serial', 95), f('material', 96), f('hardware', 94), f('zipper', 92)]);
  assert.equal(r.verdict, 'authentic');
  assert.equal(r.score, Math.round((98 * 30 + 95 * 25 + 96 * 20 + 94 * 15 + 92 * 10) / 100));
});

test('a clear, confident deviation on a weighted part → counterfeit', () => {
  const r = computeVerdict([...all(97).filter((x) => x.step !== 'logo'), f('logo', 35, 'differs', 0.85)]);
  assert.equal(r.verdict, 'counterfeit');
  assert.equal(r.reason, 'difference');
});

test('a doubtful (not confident) difference never says counterfeit', () => {
  const r = computeVerdict([...all(97).filter((x) => x.step !== 'logo'), f('logo', 40, 'differs', 0.4)]);
  assert.equal(r.verdict, 'unidentified');
});

test('missing or unclear key photo → unidentified (retake)', () => {
  assert.equal(computeVerdict(all(97).filter((x) => x.step !== 'serial')).reason, 'retake');
  assert.equal(computeVerdict([...all(97).filter((x) => x.step !== 'hardware'), f('hardware', null, 'unclear')]).verdict, 'unidentified');
  assert.equal(computeVerdict(all(97), [{ quality: 'unclear' }]).verdict, 'unidentified');
  assert.equal(computeVerdict([]).verdict, 'unidentified');
});

test('below 90 overall → unidentified (mixed), not authentic', () => {
  const r = computeVerdict(all(85));
  assert.equal(r.verdict, 'unidentified');
  assert.equal(r.reason, 'mixed');
});

test('old reviews without scores never pass', () => {
  assert.equal(computeVerdict(['logo', 'serial', 'hardware'].map((s) => ({ step: s, status: 'matches' as const, confidence: 0.9 }))).verdict, 'unidentified');
});

test('step score is the lowest point of that part; weights re-normalise over scored parts', () => {
  const st = stepScores([f('logo', 99), f('logo', 80), f('serial', 90)]);
  assert.equal(st.find((s) => s.step === 'logo')?.score, 80);
  assert.equal(weightedScore(st), Math.round((80 * 30 + 90 * 25) / 55));
});
