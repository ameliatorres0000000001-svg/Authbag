// Numbers for the "paints to mix" card: each paint's share of the mix, and a readable text colour on a paint swatch.

/** Whole-number percentages that add up to exactly 100 (largest remainder). Empty or all-zero input → all 0. */
export function sharePercents(parts: number[]): number[] {
  const p = parts.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = p.reduce((a, b) => a + b, 0);
  if (!total) return p.map(() => 0);
  const raw = p.map((n) => (n * 100) / total);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; if (p[i] > 0) { out[i] += 1; left -= 1; } }
  return out;
}

/** Black or white text, whichever reads better on this #rrggbb (WCAG relative luminance). Unknown colour → white. */
export function inkOn(hex: string | null | undefined): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return '#ffffff';
  const lin = (i: number) => { const c = parseInt(m[1].slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? '#000000' : '#ffffff';
}
