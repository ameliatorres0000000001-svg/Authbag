import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoSpots } from '../src/shared/autoscan.ts';

/** A synthetic photo: dark table, a brown bag in the middle, a white paper at the left, a little noise. */
function photo(w: number, h: number, opts: { paper?: boolean; bag?: [number, number, number]; box?: [number, number, number, number] } = {}) {
  const d = new Uint8ClampedArray(w * h * 4);
  let seed = 7; const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 7) - 3; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c: [number, number, number] = [45, 42, 40]; // table
    const [bx0, bx1, by0, by1] = opts.box ?? [0.3, 0.9, 0.2, 0.85];
    if (x > w * bx0 && x < w * bx1 && y > h * by0 && y < h * by1) c = opts.bag ?? [120, 72, 40];
    if (opts.paper !== false && x > w * 0.04 && x < w * 0.22 && y > h * 0.3 && y < h * 0.7) c = [236, 234, 228];
    const i = (y * w + x) * 4;
    d[i] = c[0] + noise(); d[i + 1] = c[1] + noise(); d[i + 2] = c[2] + noise(); d[i + 3] = 255;
  }
  return d;
}

test('finds the paper and the bag colour', () => {
  const w = 800, h = 600, r = 12;
  const s = autoSpots(photo(w, h), w, h, r)!;
  assert.ok(s, 'spots found');
  assert.ok(s.white.x > w * 0.04 && s.white.x < w * 0.22 && s.white.y > h * 0.3 && s.white.y < h * 0.7, 'white on the paper');
  assert.ok(s.spot.x > w * 0.3 && s.spot.x < w * 0.9 && s.spot.y > h * 0.2 && s.spot.y < h * 0.85, 'colour on the bag');
});

test('no white paper in the photo → no automatic spots (the person is asked to add paper)', () => {
  const w = 800, h = 600;
  assert.equal(autoSpots(photo(w, h, { paper: false }), w, h, 12), null);
});

test('a light bag is not mistaken for the paper colour spot', () => {
  const w = 800, h = 600;
  const s = autoSpots(photo(w, h, { bag: [200, 170, 120] }), w, h, 12)!;
  assert.ok(s.white.x < w * 0.22, 'white stays on the paper');
  assert.ok(s.spot.x > w * 0.3, 'colour on the beige bag');
});

test('a small bag on a big table: the colour goes on the bag, not the table', () => {
  const w = 800, h = 600;
  const s = autoSpots(photo(w, h, { box: [0.45, 0.8, 0.35, 0.75] }), w, h, 12)!;
  assert.ok(s.spot.x > w * 0.45 && s.spot.x < w * 0.8 && s.spot.y > h * 0.35 && s.spot.y < h * 0.75, `colour on the bag (got ${s.spot.x},${s.spot.y})`);
});

test('a close-up where the bag fills the frame still gives the bag colour', () => {
  const w = 800, h = 600;
  const s = autoSpots(photo(w, h, { box: [0, 1, 0, 1] }), w, h, 12)!;
  assert.ok(s && s.white.x < w * 0.22, 'paper found');
  assert.ok(!(s.spot.x > w * 0.04 && s.spot.x < w * 0.22 && s.spot.y > h * 0.3 && s.spot.y < h * 0.7), 'colour not on the paper');
});

test('no paper: the bag colour is still found for the quick (approximate) colour', async () => {
  const { autoColour } = await import('../src/shared/autoscan.ts');
  const w = 800, h = 600;
  const p = autoColour(photo(w, h, { paper: false, box: [0.3, 0.8, 0.25, 0.8] }), w, h, 12)!;
  assert.ok(p && p.x > w * 0.3 && p.x < w * 0.8 && p.y > h * 0.25 && p.y < h * 0.8, `colour on the bag (got ${p?.x},${p?.y})`);
});

test('a bright lamp in the corner is not taken for the white paper', () => {
  const w = 800, h = 600;
  const d = photo(w, h, { paper: false, box: [0, 1, 0.1, 1] });
  for (let y = 0; y < h * 0.05; y++) for (let x = Math.round(w * 0.95); x < w; x++) { const i = (y * w + x) * 4; d[i] = 240; d[i + 1] = 240; d[i + 2] = 236; }
  assert.equal(autoSpots(d, w, h, 12), null);
});

test('quick colour checks: a sharp, even patch passes; a blurry photo does not', async () => {
  const { checkQuick, quickLab } = await import('../src/shared/color.ts');
  const sample = { mean: [120, 40, 50] as [number, number, number], sd: 4, clipped: 0, n: 400 };
  assert.deepEqual(checkQuick({ sample, blur: 80, minSide: 900, r: 12 }), []);
  assert.deepEqual(checkQuick({ sample, blur: 5, minSide: 900, r: 12 }), ['blurry']);
  assert.ok(quickLab({ sample, blur: 80, minSide: 900, r: 12 })[1] > 20, 'red has a positive a*');
});
