// Colour measurement for the paint mixer. Pure functions, shared by the browser (measuring a photo) and
// the worker (re-checking the numbers and matching recipes), so both apply exactly the same rules.
//
// A colour is only measured against a WHITE REFERENCE in the same photo (a sheet of white paper next to the
// bag): the paper tells us the colour of the light, so a bag photographed under a yellow lamp and the same bag
// in daylight give the same result. Without a usable white reference, or when the photo is blurry, the spot
// is uneven, too dark or shiny, there is NO result — the app never guesses a colour.

export type RGB = [number, number, number];
export type Lab = [number, number, number];

/** Paper white is mapped to this linear reflectance (typical office paper, L* ≈ 95). */
const PAPER = 0.88;
const D65 = [0.95047, 1, 1.08883] as const;

export const srgbToLinear = (c: number): number => {
  const v = Math.min(255, Math.max(0, c)) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export const linearToSrgb = (v: number): number => {
  const c = Math.min(1, Math.max(0, v));
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
};

const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fInv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

/** sRGB (0–255) → CIELAB (D65). With `white`, the colour is first corrected for the light (von Kries, linear RGB). */
export function rgbToLab(rgb: RGB, white?: RGB): Lab {
  let [r, g, b] = rgb.map(srgbToLinear);
  if (white) {
    const [wr, wg, wb] = white.map(srgbToLinear);
    r = Math.min(1, (r * PAPER) / Math.max(wr, 1e-4));
    g = Math.min(1, (g * PAPER) / Math.max(wg, 1e-4));
    b = Math.min(1, (b * PAPER) / Math.max(wb, 1e-4));
  }
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  const fx = f(x / D65[0]), fy = f(y / D65[1]), fz = f(z / D65[2]);
  return [round2(116 * fy - 16), round2(500 * (fx - fy)), round2(200 * (fy - fz))];
}

/** CIELAB → "#rrggbb" for showing a swatch on screen. */
export function labToHex([L, a, b]: Lab): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = fInv(fx) * D65[0], y = fInv(fy) * D65[1], z = fInv(fz) * D65[2];
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return '#' + [r, g, bl].map((v) => linearToSrgb(v).toString(16).padStart(2, '0')).join('');
}

const round2 = (n: number) => Math.round(n * 100) / 100 || 0; // never -0
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => { const d = (r * 180) / Math.PI; return d < 0 ? d + 360 : d; };

/** CIEDE2000 colour difference. Under ~2 most people see no difference; above ~6 it is clearly another colour. */
export function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a, [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = C1p === 0 ? 0 : deg(Math.atan2(b1, a1p)), h2p = C2p === 0 ? 0 : deg(Math.atan2(b2, a2p));
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) hpm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hpm - 30)) + 0.24 * Math.cos(rad(2 * hpm)) + 0.32 * Math.cos(rad(3 * hpm + 6)) - 0.2 * Math.cos(rad(4 * hpm - 63));
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/** Average colour of a round spot and how even it is. `data` is RGBA (canvas ImageData). */
export interface PatchStats { mean: RGB; sd: number; clipped: number; n: number }
export function patchStats(data: ArrayLike<number>, width: number, height: number, cx: number, cy: number, r: number): PatchStats {
  let n = 0, clipped = 0;
  const sum = [0, 0, 0], sq = [0, 0, 0];
  for (let y = Math.max(0, Math.round(cy - r)); y <= Math.min(height - 1, Math.round(cy + r)); y++) {
    for (let x = Math.max(0, Math.round(cx - r)); x <= Math.min(width - 1, Math.round(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * width + x) * 4;
      const px = [data[i], data[i + 1], data[i + 2]];
      if (px.some((v) => v >= 252)) clipped++;
      for (let k = 0; k < 3; k++) { sum[k] += px[k]; sq[k] += px[k] * px[k]; }
      n++;
    }
  }
  if (!n) return { mean: [0, 0, 0], sd: 999, clipped: 1, n: 0 };
  const mean = sum.map((s) => s / n) as RGB;
  const sd = sq.reduce((acc, s, k) => acc + Math.sqrt(Math.max(0, s / n - mean[k] ** 2)), 0) / 3;
  return { mean: mean.map(round2) as RGB, sd: round2(sd), clipped: round2(clipped / n), n };
}

/** Sharpness: variance of the Laplacian of a grayscale image (low = blurry). */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
    s += l; s2 += l * l; n++;
  }
  return n ? round2(s2 / n - (s / n) ** 2) : 0;
}

/** Everything measured from one photo: the two tapped spots, sharpness, size and the spot radius. */
export interface Measurement { sample: PatchStats; white: PatchStats; blur: number; minSide: number; distance: number; r: number }

export const GATES = {
  minSide: 600,      // px, shortest side of the analysed photo
  blur: 35,          // Laplacian variance on a 512 px grayscale copy
  whiteMinLuma: 100, // the paper must be well lit
  whiteMaxClip: 0.25,
  whiteMaxTint: 0.35, // (max-min)/max of the raw paper colour: stronger = coloured light we cannot correct reliably
  whiteMaxSd: 14,
  sampleMaxSd: 14,
  sampleMaxClip: 0.05,
  sampleMinL: 6,
  minSpots: 3,       // the two spots must be at least 3 radii apart
} as const;

export type Issue = 'low_resolution' | 'blurry' | 'white_too_dark' | 'white_clipped' | 'white_tinted' | 'white_uneven'
  | 'sample_uneven' | 'sample_shiny' | 'sample_too_dark' | 'too_close' | 'missing';

/** Reasons the photo cannot give a reliable colour. Empty list = OK to measure. */
export function checkMeasurement(m: Measurement | null | undefined): Issue[] {
  if (!m || !m.sample || !m.white || m.sample.n < 20 || m.white.n < 20) return ['missing'];
  const out: Issue[] = [];
  if (!(m.minSide >= GATES.minSide)) out.push('low_resolution');
  if (!(m.blur >= GATES.blur)) out.push('blurry');
  const [wr, wg, wb] = m.white.mean;
  const luma = 0.2126 * wr + 0.7152 * wg + 0.0722 * wb;
  if (luma < GATES.whiteMinLuma) out.push('white_too_dark');
  if (m.white.clipped > GATES.whiteMaxClip) out.push('white_clipped');
  const mx = Math.max(wr, wg, wb), mn = Math.min(wr, wg, wb);
  if (mx <= 0 || (mx - mn) / mx > GATES.whiteMaxTint) out.push('white_tinted');
  if (m.white.sd > GATES.whiteMaxSd) out.push('white_uneven');
  if (m.sample.sd > GATES.sampleMaxSd) out.push('sample_uneven');
  if (m.sample.clipped > GATES.sampleMaxClip) out.push('sample_shiny');
  if (rgbToLab(m.sample.mean, m.white.mean)[0] < GATES.sampleMinL) out.push('sample_too_dark');
  if (!(m.distance >= GATES.minSpots * m.r)) out.push('too_close');
  return out;
}

/** The bag colour corrected for the light. Only call when checkMeasurement() returned no issues. */
export const measuredLab = (m: Measurement): Lab => rgbToLab(m.sample.mean, m.white.mean);

/** ΔE2000 bands: same colour, close (adjust slightly, test first), or no recipe (we do not guess). */
export const MATCH = { exact: 3, close: 6 } as const;
export const matchLevel = (dE: number): 'exact' | 'close' | 'none' => (dE <= MATCH.exact ? 'exact' : dE <= MATCH.close ? 'close' : 'none');

/** Lighter / darker, redder / greener, yellower / bluer: how the bag (measured) differs from the recipe colour, for the AI. */
export function colourDiff(measured: Lab, recipe: Lab): string {
  const [dL, da, db] = [measured[0] - recipe[0], measured[1] - recipe[1], measured[2] - recipe[2]];
  const part = (d: number, plus: string, minus: string) => (Math.abs(d) < 1.5 ? '' : `${d > 0 ? plus : minus} by ${Math.abs(d).toFixed(1)}`);
  const words = [part(dL, 'bag is lighter', 'bag is darker'), part(da, 'bag is redder', 'bag is greener'), part(db, 'bag is yellower', 'bag is bluer')].filter(Boolean);
  return `ΔE2000 ${deltaE2000(measured, recipe).toFixed(1)} (${words.length ? words.join(', ') : 'practically the same'}) — so the mix must move the same way to match the bag`;
}
