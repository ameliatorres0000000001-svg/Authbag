// Draws the AI inspection report as a PNG (1080 px wide, ivory sheet with a gold frame) so a customer can keep it or
// send it on. Plain canvas, no library. It is an AI report from photos: the sheet says so and is never a certificate.

export type ReportVerdict = 'authentic' | 'counterfeit' | 'unidentified';
export interface ReportPngPart { label: string; score: number | null; weight: string; note: string }
export interface ReportPngData {
  brandName: string; title: string; subtitle: string;
  no: string; noLabel: string; date: string; dateLabel: string;
  itemLabel: string; item: string;
  verdict: ReportVerdict; verdictLabel: string; score: number | null; scoreLabel: string; why: string;
  partsTitle: string; noScore: string; parts: ReportPngPart[];
  summary: string; disclaimer: string; footer: string;
}

export const REPORT_TONE: Record<ReportVerdict, { color: string; icon: string }> = {
  authentic: { color: '#2f7d4f', icon: '✓' },
  counterfeit: { color: '#9b2c2c', icon: '✕' },
  unidentified: { color: '#b8892a', icon: '!' },
};

const W = 1080, PAD = 84;
const GOLD = '#b8922e', INK = '#1d1b16', MUTED = '#6b665a', PAPER = '#fbf8f1', TRACK = '#e6dfcf';
const SANS = '"Noto Sans Khmer", Manrope, system-ui, sans-serif';
const SERIF = '"EB Garamond", "Noto Serif Khmer", serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

/** Break text into lines that fit `maxW`. Khmer has no spaces, so the browser's word segmenter finds the break points. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const seg = Seg ? new Seg(undefined, { granularity: 'word' }) : null;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const tokens = seg ? Array.from(seg.segment(para), (s) => s.segment) : Array.from(para);
    let line = '';
    const push = (tk: string) => {
      if (ctx.measureText(tk).width <= maxW) { line = tk.trimStart(); return; }
      for (const ch of Array.from(tk)) { // a single word wider than the sheet: break it by letter
        if (line && ctx.measureText(line + ch).width > maxW) { out.push(line); line = ch; } else line += ch;
      }
    };
    for (const tk of tokens) {
      if (line && ctx.measureText(line + tk).width > maxW) { out.push(line.trimEnd()); line = ''; push(tk); } else if (!line) push(tk); else line += tk;
    }
    if (line) out.push(line.trimEnd());
  }
  return out;
}

/** Wrapped paragraph; returns the y below it. */
function block(ctx: CanvasRenderingContext2D, dry: boolean, text: string, x: number, y: number, maxW: number, font: string, color: string, lh: number, align: CanvasTextAlign = 'left'): number {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  const lines = wrap(ctx, text, maxW);
  const ax = align === 'center' ? x + maxW / 2 : align === 'right' ? x + maxW : x;
  lines.forEach((l, i) => { if (!dry) ctx.fillText(l, ax, y + lh * (i + 0.78)); });
  return y + lh * lines.length;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paint(ctx: CanvasRenderingContext2D, d: ReportPngData, photo: ImageBitmap | null, logo: ImageBitmap | null, dry: boolean): number {
  const inner = W - PAD * 2;
  const tone = REPORT_TONE[d.verdict];
  if (!dry) {
    const H = ctx.canvas.height;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.strokeStyle = `${GOLD}88`; ctx.lineWidth = 1.5; ctx.strokeRect(44, 44, W - 88, H - 88);
  }
  let y = 96;

  // header
  if (logo && !dry) { ctx.save(); roundRect(ctx, W / 2 - 48, y, 96, 96, 22); ctx.clip(); ctx.drawImage(logo, W / 2 - 48, y, 96, 96); ctx.restore(); }
  y += logo ? 124 : 0;
  ctx.font = `500 44px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillStyle = INK;
  if (!dry) { (ctx as unknown as { letterSpacing: string }).letterSpacing = '6px'; ctx.fillText(d.brandName, W / 2, y + 36); (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px'; }
  y += 58;
  if (!dry) { ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 60, y, 120, 2); }
  y += 30;
  y = block(ctx, dry, d.title.toUpperCase(), PAD, y, inner, `500 34px ${SERIF}`, INK, 46, 'center');
  y = block(ctx, dry, d.subtitle, PAD, y + 2, inner, `500 28px ${SANS}`, INK, 44, 'center');

  // number + date
  y += 22;
  if (!dry) { ctx.fillStyle = `${GOLD}77`; ctx.fillRect(PAD, y, inner, 1.5); ctx.fillRect(PAD, y + 64, inner, 1.5); }
  ctx.font = `500 22px ${MONO}`; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
  if (!dry) { ctx.textAlign = 'left'; ctx.fillText(`${d.noLabel}: ${d.no}`, PAD, y + 41); ctx.textAlign = 'right'; ctx.fillText(`${d.dateLabel}: ${d.date}`, W - PAD, y + 41); }
  y += 64 + 36;

  // item: the customer's own bag
  const ph = 300;
  if (!dry) {
    ctx.fillStyle = '#fff'; ctx.fillRect(PAD, y, ph, ph);
    if (photo) {
      const s = Math.max(ph / photo.width, ph / photo.height);
      const sw = ph / s, sh = ph / s;
      ctx.save(); ctx.beginPath(); ctx.rect(PAD, y, ph, ph); ctx.clip();
      ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, PAD, y, ph, ph);
      ctx.restore();
    }
    ctx.strokeStyle = `${GOLD}99`; ctx.lineWidth = 2; ctx.strokeRect(PAD, y, ph, ph);
  }
  const tx = PAD + ph + 40, tw = inner - ph - 40;
  let ty = block(ctx, dry, d.itemLabel.toUpperCase(), tx, y + 6, tw, `600 20px ${SANS}`, MUTED, 30);
  ty = block(ctx, dry, d.item, tx, ty + 6, tw, `500 46px ${SERIF}`, INK, 56);
  y = Math.max(y + ph, ty) + 40;

  // verdict band: seal + label + score
  const bandTop = y;
  const textX = PAD + 40 + 132 + 28, textW = inner - 40 - 132 - 28 - 40;
  ctx.font = `700 31px ${SANS}`;
  const labelLines = wrap(ctx, d.verdictLabel, textW).length;
  const scoreRows = d.score !== null ? 54 : 0;
  const whyH = d.why ? (() => { ctx.font = `500 24px ${SANS}`; return wrap(ctx, d.why, inner - 80).length * 38 + 14; })() : 0;
  const bandH = 40 + Math.max(132, labelLines * 44 + scoreRows) + whyH + 40;
  if (!dry) {
    ctx.fillStyle = tone.color; roundRect(ctx, PAD, bandTop, inner, bandH, 24); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(PAD + 40 + 66, bandTop + 40 + 66, 66, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(PAD + 40 + 66, bandTop + 40 + 66, 56, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `700 72px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(tone.icon, PAD + 40 + 66, bandTop + 40 + 66 + 25);
  }
  let by = block(ctx, dry, d.verdictLabel, textX, bandTop + 40, textW, `700 31px ${SANS}`, '#fff', 44);
  if (d.score !== null) {
    ctx.font = `500 24px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'left';
    if (!dry) ctx.fillText(`${d.scoreLabel}:`, textX, by + 28);
    const lw = ctx.measureText(`${d.scoreLabel}: `).width;
    ctx.font = `700 40px ${SANS}`;
    if (!dry) ctx.fillText(`${d.score}%`, textX + lw, by + 30);
    by += scoreRows;
  }
  if (d.why) block(ctx, dry, d.why, PAD + 40, Math.max(by, bandTop + 40 + 132) + 14, inner - 80, `500 24px ${SANS}`, 'rgba(255,255,255,0.95)', 38);
  y = bandTop + bandH + 46;

  // score by part
  y = block(ctx, dry, d.partsTitle, PAD, y, inner, `600 30px ${SANS}`, INK, 44);
  y += 8;
  for (const p of d.parts) {
    ctx.font = `600 27px ${SANS}`; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
    const scoreText = p.score === null ? '–' : `${p.score}%`;
    ctx.font = `700 32px ${SANS}`;
    const sw = ctx.measureText(scoreText).width;
    const labelY = block(ctx, dry, p.label + (p.weight ? `  ·  ${p.weight}` : ''), PAD, y, inner - sw - 24, `600 27px ${SANS}`, INK, 40);
    if (!dry) { ctx.font = `700 32px ${SANS}`; ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.fillText(scoreText, W - PAD, y + 31); }
    y = Math.max(labelY, y + 40) + 6;
    if (!dry) {
      ctx.fillStyle = TRACK; roundRect(ctx, PAD, y, inner, 14, 7); ctx.fill();
      const sc = p.score ?? 0;
      if (sc > 0) { ctx.fillStyle = p.score === null ? TRACK : sc >= 90 ? '#2f7d4f' : sc > 60 ? '#b8892a' : '#9b2c2c'; roundRect(ctx, PAD, y, Math.max(14, (inner * sc) / 100), 14, 7); ctx.fill(); }
    }
    y += 14 + 10;
    y = block(ctx, dry, p.score === null ? d.noScore : p.note, PAD, y, inner, `400 23px ${SANS}`, MUTED, 34);
    y += 22;
  }

  // summary
  if (d.summary) {
    ctx.font = `400 27px ${SANS}`;
    const lines = wrap(ctx, d.summary, inner - 64).length;
    const h = lines * 42 + 52;
    if (!dry) { ctx.fillStyle = '#fffdf7'; ctx.fillRect(PAD, y, inner, h); ctx.strokeStyle = `${GOLD}88`; ctx.lineWidth = 2; ctx.strokeRect(PAD, y, inner, h); }
    block(ctx, dry, d.summary, PAD + 32, y + 26, inner - 64, `400 27px ${SANS}`, INK, 42);
    y += h + 36;
  }

  // footer: never a certificate
  if (!dry) { ctx.fillStyle = `${GOLD}77`; ctx.fillRect(PAD, y, inner, 1.5); }
  y += 26;
  y = block(ctx, dry, d.footer, PAD, y, inner, `700 22px ${SANS}`, GOLD, 34, 'center');
  y = block(ctx, dry, d.disclaimer, PAD, y + 4, inner, `400 21px ${SANS}`, MUTED, 32, 'center');
  return y + 96;
}

/** Make the PNG. `photo` is the customer's own photo of the bag (never a reference photo). */
export async function renderReportPng(d: ReportPngData, photo: Blob | null, logo: Blob | null): Promise<Blob> {
  try {
    await Promise.all([document.fonts.load(`600 28px ${SANS}`), document.fonts.load(`500 40px ${SERIF}`), document.fonts.load(`500 22px ${MONO}`)]);
  } catch { /* system fonts are used */ }
  const bmp = async (b: Blob | null) => (b ? createImageBitmap(b).catch(() => null) : null);
  const [img, mark] = [await bmp(photo), await bmp(logo)];
  const probe = document.createElement('canvas'); probe.width = W; probe.height = 10;
  const H = Math.ceil(paint(probe.getContext('2d')!, d, img, mark, true));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  paint(c.getContext('2d')!, d, img, mark, false);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png_failed'))), 'image/png'));
}
