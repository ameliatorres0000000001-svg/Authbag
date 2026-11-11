import test from 'node:test';
import assert from 'node:assert/strict';
import { inkOn, sharePercents } from '../src/shared/mixShares.ts';

test('shares always add up to 100 and follow the drops', () => {
  assert.deepEqual(sharePercents([6, 1, 1, 1]), [67, 11, 11, 11]);
  assert.deepEqual(sharePercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(sharePercents([2, 1, 1]), [50, 25, 25]);
  for (const p of [[3, 1], [7, 2, 2, 1], [1], [5, 5, 5, 5, 5, 5, 1]]) assert.equal(sharePercents(p).reduce((a, b) => a + b, 0), 100);
});

test('no drops, bad numbers', () => {
  assert.deepEqual(sharePercents([]), []);
  assert.deepEqual(sharePercents([0, 0]), [0, 0]);
  assert.deepEqual(sharePercents([NaN, 2]), [0, 100]);
});

test('text colour stays readable on light and dark paints', () => {
  assert.equal(inkOn('#ffffff'), '#000000');   // white
  assert.equal(inkOn('#e8c33a'), '#000000');   // yellow
  assert.equal(inkOn('#1a1a1a'), '#ffffff');   // black
  assert.equal(inkOn('#7f252e'), '#ffffff');   // bag red
  assert.equal(inkOn(null), '#ffffff');
  assert.equal(inkOn('red'), '#ffffff');
});
