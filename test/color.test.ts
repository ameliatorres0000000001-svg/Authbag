import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMeasurement, deltaE2000, labToHex, matchLevel, measuredLab, patchStats, rgbToLab, type Measurement, type RGB } from '../src/shared/color.ts';

test('sRGB white and black map to L* 100 and 0', () => {
  assert.deepEqual(rgbToLab([255, 255, 255]).map(Math.round), [100, 0, 0]);
  assert.deepEqual(rgbToLab([0, 0, 0]).map(Math.round), [0, 0, 0]);
});

test('Lab → hex round-trips', () => {
  for (const hex of ['#8b5a2b', '#1a1a1a', '#c5a059', '#2c4c38']) {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
    assert.equal(labToHex(rgbToLab(rgb)), hex);
  }
});

test('CIEDE2000 reference pairs (Sharma et al. 2005)', () => {
  assert.equal(Math.round(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) * 1e4) / 1e4, 2.0425);
  assert.equal(Math.round(deltaE2000([50, -1.3802, -84.2814], [50, 0, -82.7485]) * 1e4) / 1e4, 1.0);
  assert.equal(Math.round(deltaE2000([50, 2.5, 0], [50, 0, -2.5]) * 1e4) / 1e4, 4.3065);
  assert.equal(deltaE2000([40, 10, 20], [40, 10, 20]), 0);
});

test('white balance removes the colour of the light', () => {
  // the same brown bag under daylight (neutral paper) and under a warm lamp (yellow paper, warmer bag)
  const day = rgbToLab([120, 80, 50], [225, 225, 225]);
  const lamp = rgbToLab([120 * 1.0, 80 * 0.86, 50 * 0.68], [225, 225 * 0.86, 225 * 0.68]);
  assert.ok(deltaE2000(day, lamp) < 1.5, `ΔE ${deltaE2000(day, lamp)}`);
  // without correction the same bag reads as a visibly different colour
  const raw = deltaE2000(rgbToLab([120, 80, 50]), rgbToLab([120, 80 * 0.86, 50 * 0.68]));
  assert.ok(raw > 3 && deltaE2000(day, lamp) < raw / 2, `raw ΔE ${raw}`);
});

test('match bands', () => {
  assert.equal(matchLevel(1.2), 'exact');
  assert.equal(matchLevel(4.5), 'close');
  assert.equal(matchLevel(9), 'none');
});

function img(w: number, h: number, fill: (x: number, y: number) => RGB) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fill(x, y); d.set([r, g, b, 255], (y * w + x) * 4); }
  return d;
}

test('patchStats: flat spot is even, a striped spot is not', () => {
  const flat = patchStats(img(50, 50, () => [100, 60, 40]), 50, 50, 25, 25, 10);
  assert.deepEqual(flat.mean, [100, 60, 40]); assert.equal(flat.sd, 0); assert.equal(flat.clipped, 0);
  const striped = patchStats(img(50, 50, (x) => (x % 2 ? [200, 200, 200] : [20, 20, 20])), 50, 50, 25, 25, 10);
  assert.ok(striped.sd > 50);
});

const good: Measurement = {
  sample: { mean: [120, 80, 50], sd: 4, clipped: 0, n: 300 },
  white: { mean: [225, 222, 215], sd: 3, clipped: 0, n: 300 },
  blur: 120, minSide: 1200, distance: 300, r: 15,
};

test('a good photo passes and gives a colour', () => {
  assert.deepEqual(checkMeasurement(good), []);
  assert.ok(measuredLab(good)[0] > 30);
});

test('bad photos give no result, with the reason', () => {
  assert.deepEqual(checkMeasurement(null), ['missing']);
  assert.ok(checkMeasurement({ ...good, blur: 5 }).includes('blurry'));
  assert.ok(checkMeasurement({ ...good, minSide: 300 }).includes('low_resolution'));
  assert.ok(checkMeasurement({ ...good, white: { ...good.white, mean: [60, 60, 60] } }).includes('white_too_dark'));
  assert.ok(checkMeasurement({ ...good, white: { ...good.white, clipped: 0.9 } }).includes('white_clipped'));
  assert.ok(checkMeasurement({ ...good, white: { ...good.white, mean: [240, 160, 90] } }).includes('white_tinted'));
  assert.ok(checkMeasurement({ ...good, sample: { ...good.sample, sd: 40 } }).includes('sample_uneven'));
  assert.ok(checkMeasurement({ ...good, sample: { ...good.sample, clipped: 0.3 } }).includes('sample_shiny'));
  assert.ok(checkMeasurement({ ...good, sample: { ...good.sample, mean: [2, 2, 2] } }).includes('sample_too_dark'));
  assert.ok(checkMeasurement({ ...good, distance: 10 }).includes('too_close'));
});
