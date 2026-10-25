import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStages, summarizeStages } from '../src/shared/stages.ts';
import { createGate } from '../src/shared/autocapture.ts';
import type { RuleResult } from '../src/shared/types.ts';

const tpl = [
  { code: 'stamp_macro', componentCode: 'heat_stamp', required: true },
  { code: 'zip_macro', componentCode: 'zipper', required: true },
  { code: 'dc_macro', componentCode: 'date_code', required: true },
];
const rr = (componentCode: string, state: RuleResult['state'], polarity: RuleResult['polarity'], counted = true, required = false): RuleResult =>
  ({ ruleId: 'x' + Math.random(), code: 'C', titleEn: 't', titleKm: 't', componentCode, polarity, severity: 'minor', required, state, counted });

test('missing photos => pending', () => {
  const s = buildStages(tpl, ['stamp_macro'], []);
  assert.equal(s.find((x) => x.component === 'zipper')!.status, 'pending');
  assert.equal(summarizeStages(s).readyForSignoff, false);
});

test('photos but no approved rules => insufficient, never consistent', () => {
  const s = buildStages(tpl, ['stamp_macro', 'zip_macro', 'dc_macro'], []);
  assert.ok(s.every((x) => x.status === 'insufficient'));
  assert.equal(summarizeStages(s).readyForSignoff, false);
});

test('draft (uncounted) rules never make a stage consistent', () => {
  const s = buildStages(tpl, ['stamp_macro', 'zip_macro', 'dc_macro'], [rr('heat_stamp', 'supported', 'authentic_indicator', false)]);
  assert.equal(s.find((x) => x.component === 'heat_stamp')!.status, 'insufficient');
});

test('a concern in one stage does not block assessing the others', () => {
  const rules = [rr('heat_stamp', 'triggered', 'concern_indicator'), rr('zipper', 'supported', 'authentic_indicator'), rr('date_code', 'supported', 'authentic_indicator')];
  const s = buildStages(tpl, ['stamp_macro', 'zip_macro', 'dc_macro'], rules);
  assert.deepEqual(s.map((x) => x.status), ['concern', 'consistent', 'consistent']);
  const sum = summarizeStages(s);
  assert.equal(sum.readyForSignoff, false);
  assert.deepEqual(sum.concerns, ['heat_stamp']);
});

test('ready for sign-off only when every stage is consistent', () => {
  const rules = tpl.map((t) => rr(t.componentCode!, 'supported', 'authentic_indicator'));
  const s = buildStages(tpl, ['stamp_macro', 'zip_macro', 'dc_macro'], rules);
  assert.equal(summarizeStages(s).readyForSignoff, true);
});

test('auto-capture gate needs consecutive good frames and resets on any bad frame', () => {
  const g = createGate({ needFrames: 3 });
  const good = { sharpness: 100, brightness: 120, motion: 1 };
  assert.equal(g.push(good).ready, false);
  assert.equal(g.push(good).ready, false);
  assert.equal(g.push({ ...good, motion: 20 }).hint, 'hold_still'); // reset
  assert.equal(g.push(good).ready, false);
  assert.equal(g.push(good).ready, false);
  assert.equal(g.push(good).ready, true);
  assert.equal(createGate().push({ sharpness: 10, brightness: 120, motion: 0 }).hint, 'blurry');
  assert.equal(createGate().push({ sharpness: 100, brightness: 20, motion: 0 }).hint, 'too_dark');
});
