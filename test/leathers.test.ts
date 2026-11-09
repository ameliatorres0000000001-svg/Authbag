import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEATHERS, LEATHER_KEYS, isLeather, leatherAi } from '../src/shared/leathers.ts';

test('one leather list for the whole app: keys match the recipe CHECK, each has a mark and an AI description', () => {
  assert.deepEqual([...LEATHER_KEYS], ['smooth_leather', 'grained_leather', 'vachetta', 'coated_canvas', 'suede', 'edge', 'other']);
  for (const l of LEATHERS) { assert.ok(l.mark && l.ai.length > 3, l.key); }
  assert.equal(isLeather('suede'), true);
  assert.equal(isLeather('patent'), false);
  assert.match(leatherAi('coated_canvas'), /canvas/);
});
