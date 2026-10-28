// "Lenses": image filters that make details already in the photo easier for a person to see
// (faint debossing, engraving dots, edges of letters). They add no information the camera did not capture,
// and they never judge anything. Pure functions on RGBA pixel buffers so they run in the browser and in tests.

export type LensMode = 'original' | 'contrast' | 'edges' | 'relief' | 'invert';
export const LENS_MODES: LensMode[] = ['original', 'contrast', 'edges', 'relief', 'invert'];

const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

function grey(d: Uint8ClampedArray, n: number): Float32Array {
  const g = new Float32Array(n);
  for (let p = 0; p < n; p++) g[p] = luma(d, p * 4);
  return g;
}

function writeGrey(d: Uint8ClampedArray, g: ArrayLike<number>) {
  for (let p = 0; p < g.length; p++) {
    const v = Math.max(0, Math.min(255, Math.round(g[p])));
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
  }
}

/** Greyscale histogram equalisation: spreads faint tone differences (shallow stamps, worn engraving) over the full range. */
function contrast(d: Uint8ClampedArray, n: number) {
  const g = grey(d, n);
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) hist[g[p] | 0]++;
  const cdf = new Uint32Array(256);
  let acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = acc; }
  let min = 0;
  while (min < 256 && cdf[min] === 0) min++;
  const lo = cdf[Math.min(min, 255)], span = n - lo;
  writeGrey(d, Array.from(g, (v) => (span > 0 ? ((cdf[v | 0] - lo) / span) * 255 : v)));
}

/** Sobel edge strength, drawn dark on white: outlines of letters, dots and stitches. */
function edges(d: Uint8ClampedArray, w: number, h: number) {
  const g = grey(d, w * h);
  const out = new Float32Array(w * h);
  let max = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const at = (dx: number, dy: number) => g[(y + dy) * w + (x + dx)];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const m = Math.hypot(gx, gy);
      out[y * w + x] = m;
      if (m > max) max = m;
    }
  }
  writeGrey(d, Array.from(out, (m) => 255 - (max > 0 ? (m / max) * 255 : 0)));
}

/** Emboss (light from top-left): raised and pressed-in shapes read as 3-D relief, e.g. heat-stamp depth. */
function relief(d: Uint8ClampedArray, w: number, h: number) {
  const g = grey(d, w * h);
  const out = new Float32Array(w * h).fill(128);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) out[y * w + x] = 128 + 2 * (g[(y + 1) * w + (x + 1)] - g[(y - 1) * w + (x - 1)]);
  }
  writeGrey(d, out);
}

function invert(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
}

/** Apply a lens in place. Alpha is left untouched. */
export function applyLens(mode: LensMode, d: Uint8ClampedArray, w: number, h: number): void {
  if (mode === 'contrast') contrast(d, w * h);
  else if (mode === 'edges') edges(d, w, h);
  else if (mode === 'relief') relief(d, w, h);
  else if (mode === 'invert') invert(d);
}

/** Output size for a crop: keeps proportions, longest side at most `max` px (filters are O(pixels)). */
export function fitSize(w: number, h: number, max = 900): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
