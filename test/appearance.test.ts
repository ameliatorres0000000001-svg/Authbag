import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppearance } from '../src/shared/datecodeAppearance.ts';

test('parses a fenced AI reply and keeps the descriptive fields', () => {
  const r = parseAppearance('Here:\n```json\n{"transcription":"ca4109","characterCount":6,"lines":1,"method":"heat_stamped","font":"narrow sans-serif","size":"about half the height of the interior stamp","spacing":"even","alignment":"straight baseline","depthEdges":"clean, evenly pressed","placement":"leather tab in pocket seam","surface":"leather","scaleVisible":true,"sizeMm":2.1,"differences":[{"feature":"digit 4","inspected":"open top","reference":"closed top","photoCaveat":"angle"},{"feature":""}],"photoIssues":["slight glare"],"summary":"One line, six characters."}\n```')!;
  assert.equal(r.transcription, 'CA4109');
  assert.equal(r.method, 'heat_stamped');
  assert.equal(r.sizeMm, 2.1);
  assert.equal(r.differences.length, 1);
  assert.equal(r.differences[0].photoCaveat, 'angle');
  assert.deepEqual(r.photoIssues, ['slight glare']);
});

test('drops millimetre sizes when no scale is visible, and unknown methods', () => {
  const r = parseAppearance('{"transcription":"SD1234","scaleVisible":false,"sizeMm":3,"method":"laser","summary":"x"}')!;
  assert.equal(r.sizeMm, null);
  assert.equal(r.method, 'unclear');
});

test('never throws on junk', () => {
  assert.equal(parseAppearance('no json'), null);
  assert.equal(parseAppearance('{broken'), null);
  assert.equal(parseAppearance('[1,2]'), null);
  assert.equal(parseAppearance('{}'), null);
});
