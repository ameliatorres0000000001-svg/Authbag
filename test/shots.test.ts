import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShots } from '../src/shared/shots.ts';

test('shots: known parts kept, unknown parts become "other", numbered, at most 6', () => {
  const raw = [
    { part: 'whole', part_text: 'រូបរាងកាបូបទាំងមូល', hint: 'មុខ និងក្រោយ' },
    { part: 'heat_stamp', part_text: 'ត្រាម៉ាក (Heat Stamp)' },
    { part: 'strap_d_ring', part_text: 'D-ring', hint: 'ថតជិត' },
    { part: 'date_code', part_text: '' },               // no title → dropped
    'nonsense', null,
    ...Array.from({ length: 6 }, (_, i) => ({ part: 'hardware', part_text: `x${i}` })),
  ];
  const s = parseShots(raw);
  assert.equal(s.length, 6);
  assert.deepEqual(s.map((x) => x.step), [1, 2, 3, 4, 5, 6]);
  assert.equal(s[0].part, 'whole'); assert.equal(s[1].part, 'heat_stamp'); assert.equal(s[1].hint, '');
  assert.equal(s[2].part, 'other');
});

test('shots: anything that is not a list gives none', () => {
  assert.deepEqual(parseShots(undefined), []);
  assert.deepEqual(parseShots({ part: 'whole' }), []);
  assert.deepEqual(parseShots('[]'), []);
});
