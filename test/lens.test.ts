import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLens, fitSize } from '../src/shared/lens.ts';

// w x h RGBA image from a grey-level function
const img = (w: number, h: number, f: (x: number, y: number) => number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = f(x, y); d[i + 3] = 200; }
  return d;
};
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => d[(y * w + x) * 4];

test('contrast stretches a faint two-tone image to the full range', () => {
  const d = img(4, 4, (x) => (x < 2 ? 120 : 130));
  applyLens('contrast', d, 4, 4);
  assert.equal(px(d, 4, 0, 0), 0);
  assert.equal(px(d, 4, 3, 0), 255);
  assert.equal(d[3], 200, 'alpha untouched');
});

test('edges are dark on the boundary and white on flat areas', () => {
  const d = img(6, 6, (x) => (x < 3 ? 0 : 255));
  applyLens('edges', d, 6, 6);
  assert.equal(px(d, 6, 1, 3), 255);
  assert.ok(px(d, 6, 3, 3) < 50);
});

test('relief keeps flat areas mid-grey', () => {
  const d = img(5, 5, () => 77);
  applyLens('relief', d, 5, 5);
  assert.equal(px(d, 5, 2, 2), 128);
});

test('invert and original', () => {
  const d = img(2, 1, () => 10);
  applyLens('original', d, 2, 1); assert.equal(d[0], 10);
  applyLens('invert', d, 2, 1); assert.equal(d[0], 245);
});

test('fitSize caps the longest side and keeps proportions', () => {
  assert.deepEqual(fitSize(3000, 1500, 900), { w: 900, h: 450 });
  assert.deepEqual(fitSize(200, 100, 900), { w: 200, h: 100 });
});
