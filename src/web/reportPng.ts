// Draws the AI inspection report as a PNG (1080 px wide, ivory sheet with a gold frame) so a customer can keep it or
// send it on. Plain canvas, no library. It is an AI report from photos: the sheet says so and is never a certificate.

export type ReportVerdict = 'authentic' | 'counterfeit' | 'unidentified';
export interface ReportPngPart { label: string; score: number | null; weight: string; note: string }
export interface ReportPngData {
  brandName: string; title: string; subtitle: string;
  no: string; noLabel: string; date: string; dateLabel: string;
  itemLabel: string; item: string;
  brand: string; model: string; kvBrand: string; kvModel: string; kvScore: string;
  statementTitle: string; statement: string; noticeTitle: string; notice: string; signName: string; signRole: string;
  analysisTitle: string; summaryTitle: string; methodTitle: string; method: string[]; limit: string; page1: string; page2: string;
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

const PH = 1527; // A4 ratio at 1080 px wide

function frame(ctx: CanvasRenderingContext2D, oy: number, h: number) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, oy, W, h);
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(30, oy + 30, W - 60, h - 60);
  ctx.strokeStyle = `${GOLD}88`; ctx.lineWidth = 1.5; ctx.strokeRect(44, oy + 44, W - 88, h - 88);
}

function setSpacing(ctx: CanvasRenderingContext2D, v: string) { (ctx as unknown as { letterSpacing: string }).letterSpacing = v; }

function head(ctx: CanvasRenderingContext2D, d: ReportPngData, logo: ImageBitmap | null, dry: boolean, y: number, withLogo: boolean): number {
  const inner = W - PAD * 2;
  if (withLogo && logo) { if (!dry) { ctx.save(); roundRect(ctx, W / 2 - 48, y, 96, 96, 22); ctx.clip(); ctx.drawImage(logo, W / 2 - 48, y, 96, 96); ctx.restore(); } y += 124; }
  ctx.font = `500 44px ${SERIF}`; ctx.textAlign = 'center'; ctx.fillStyle = INK;
  if (!dry) { setSpacing(ctx, '6px'); ctx.fillText(d.brandName, W / 2, y + 36); setSpacing(ctx, '0px'); }
  y += 58;
  if (!dry) { ctx.fillStyle = GOLD; ctx.fillRect(W / 2 - 60, y, 120, 2); }
  return y + 30;
}

function page1(ctx: CanvasRenderingContext2D, d: ReportPngData, photo: ImageBitmap | null, logo: ImageBitmap | null, dry: boolean, oy: number): number {
  const inner = W - PAD * 2;
  const tone = REPORT_TONE[d.verdict];
  let y = head(ctx, d, logo, dry, oy + 96, true);
  y = block(ctx, dry, d.title.toUpperCase(), PAD, y, inner, `500 34px ${SERIF}`, INK, 46, 'center');
  y = block(ctx, dry, d.subtitle, PAD, y + 2, inner, `500 28px ${SANS}`, INK, 44, 'center');

  y += 22;
  if (!dry) { ctx.fillStyle = `${GOLD}77`; ctx.fillRect(PAD, y, inner, 1.5); ctx.fillRect(PAD, y + 64, inner, 1.5); }
  ctx.font = `500 22px ${MONO}`; ctx.fillStyle = INK; ctx.textBaseline = 'alphabetic';
  if (!dry) { ctx.textAlign = 'left'; ctx.fillText(`${d.noLabel}: ${d.no}`, PAD, y + 41); ctx.textAlign = 'right'; ctx.fillText(`${d.dateLabel}: ${d.date}`, W - PAD, y + 41); }
  y += 64 + 40;

  // the customer's own bag photo + key facts
  const ph = 320;
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
  let ty = y;
  const rows: [string, string][] = [[d.kvBrand, d.brand], [d.kvModel, d.model], [d.kvScore, d.score !== null ? `${d.score}%` : '–']];
  for (const [k, v] of rows) {
    if (!v) continue;
    const top = ty;
    const e = block(ctx, dry, k.toUpperCase(), tx, ty + 8, tw, `600 19px ${SANS}`, MUTED, 28);
    const e2 = block(ctx, dry, v, tx, e, tw, `500 34px ${SERIF}`, INK, 44);
    ty = e2 + 14;
    if (!dry) { ctx.fillStyle = '#e3d9be'; ctx.fillRect(tx, ty, tw, 1.5); }
    ty += 12;
    void top;
  }
  y = Math.max(y + ph, ty) + 44;

  // AI statement box
  ctx.font = `500 25px ${SANS}`;
  const stLines = wrap(ctx, d.statement, inner - 80).length;
  ctx.font = `700 31px ${SANS}`;
  const lbLines = wrap(ctx, d.verdictLabel, inner - 80).length;
  ctx.font = `500 24px ${SANS}`;
  const whyH = d.why ? wrap(ctx, d.why, inner - 80).length * 38 + 10 : 0;
  const bh = 40 + 40 + lbLines * 44 + 14 + stLines * 40 + whyH + 36;
  if (!dry) { ctx.strokeStyle = `${GOLD}aa`; ctx.lineWidth = 2; ctx.strokeRect(PAD, y, inner, bh); ctx.fillStyle = tone.color; ctx.fillRect(PAD, y, 12, bh); }
  let by = block(ctx, dry, d.statementTitle.toUpperCase(), PAD + 40, y + 28, inner - 80, `600 24px ${SERIF}`, GOLD, 34, 'center');
  by = block(ctx, dry, d.verdictLabel, PAD + 40, by + 12, inner - 80, `700 31px ${SANS}`, tone.color, 44, 'center');
  by = block(ctx, dry, d.statement, PAD + 40, by + 14, inner - 80, `500 25px ${SANS}`, INK, 40, 'center');
  if (d.why) by = block(ctx, dry, d.why, PAD + 40, by + 10, inner - 80, `500 24px ${SANS}`, tone.color, 38, 'center');
  y += bh + 36;

  // notice
  y = block(ctx, dry, d.noticeTitle.toUpperCase(), PAD, y, inner, `600 22px ${SANS}`, GOLD, 32);
  y = block(ctx, dry, d.notice, PAD, y + 4, inner, `400 22px ${SANS}`, '#4a443b', 34);

  // signature line (no QR, no seal: this is not a certificate)
  y += 60;
  if (!dry) { ctx.fillStyle = INK; ctx.fillRect(PAD, y, 380, 2); }
  y = block(ctx, dry, d.signName, PAD, y + 10, 600, `700 24px ${SANS}`, INK, 36);
  y = block(ctx, dry, d.signRole, PAD, y, 700, `400 21px ${SANS}`, MUTED, 32);

  y += 40;
  if (!dry) { ctx.fillStyle = `${GOLD}77`; ctx.fillRect(PAD, y, inner, 1.5); }
  y = block(ctx, dry, d.footer, PAD, y + 22, inner, `700 22px ${SANS}`, GOLD, 34, 'center');
  y = block(ctx, dry, d.page1, PAD, y + 14, inner, `400 20px ${SANS}`, MUTED, 30, 'center');
  return y;
}

function page2(ctx: CanvasRenderingContext2D, d: ReportPngData, logo: ImageBitmap | null, dry: boolean, oy: number): number {
  const inner = W - PAD * 2;
  const tone = REPORT_TONE[d.verdict];
  let y = head(ctx, d, logo, dry, oy + 96, false);
  y = block(ctx, dry, d.analysisTitle.toUpperCase(), PAD, y, inner, `500 34px ${SERIF}`, INK, 46, 'center');
  y = block(ctx, dry, `${d.subtitle} · ${d.item}`, PAD, y + 2, inner, `500 24px ${SANS}`, MUTED, 38, 'center');
  y += 30;

  // score ring card
  const ch = 210;
  if (!dry) {
    ctx.fillStyle = `${tone.color}14`; ctx.fillRect(PAD, y, inner, ch);
    ctx.strokeStyle = `${tone.color}55`; ctx.lineWidth = 2; ctx.strokeRect(PAD, y, inner, ch);
    const cx = PAD + 40 + 75, cy = y + ch / 2;
    ctx.lineWidth = 22; ctx.lineCap = 'butt';
    ctx.strokeStyle = TRACK; ctx.beginPath(); ctx.arc(cx, cy, 64, 0, Math.PI * 2); ctx.stroke();
    if (d.score !== null && d.score > 0) { ctx.strokeStyle = tone.color; ctx.beginPath(); ctx.arc(cx, cy, 64, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(100, d.score)) / 100); ctx.stroke(); }
    ctx.fillStyle = tone.color; ctx.font = `700 40px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(d.score !== null ? `${d.score}%` : '–', cx, cy + 14);
  }
  const rx = PAD + 40 + 150 + 36, rw = inner - 40 - 150 - 36 - 30;
  ctx.font = `700 30px ${SANS}`;
  const rl = wrap(ctx, d.verdictLabel, rw).length;
  const ry = y + (ch - rl * 42 - 40) / 2;
  const re = block(ctx, dry, d.verdictLabel, rx, ry, rw, `700 30px ${SANS}`, tone.color, 42);
  block(ctx, dry, `${d.scoreLabel}${d.score !== null ? ` ${d.score}%` : ''}`, rx, re + 4, rw, `400 24px ${SANS}`, '#4a443b', 36);
  y += ch + 8;

  const h3 = (t: string) => {
    y += 30;
    y = block(ctx, dry, t.toUpperCase(), PAD, y, inner, `500 24px ${SERIF}`, GOLD, 34);
    if (!dry) { ctx.fillStyle = '#d9c9a0'; ctx.fillRect(PAD, y + 2, inner, 1.5); }
    y += 18;
  };

  if (d.summary) { h3(d.summaryTitle); y = block(ctx, dry, d.summary, PAD, y, inner, `400 25px ${SANS}`, INK, 40); }

  if (d.parts.length) {
    h3(d.partsTitle);
    for (const p of d.parts) {
      const scoreText = p.score === null ? '–' : `${p.score}%`;
      ctx.font = `700 30px ${SANS}`;
      const sw = ctx.measureText(scoreText).width;
      const labelY = block(ctx, dry, p.label + (p.weight ? `  ·  ${p.weight}` : ''), PAD, y, inner - sw - 24, `600 26px ${SANS}`, INK, 38);
      if (!dry) { ctx.font = `700 30px ${SANS}`; ctx.fillStyle = p.score === null ? MUTED : tone.color === '#9b2c2c' ? '#9b2c2c' : '#2d7a4b'; ctx.textAlign = 'right'; ctx.fillText(scoreText, W - PAD, y + 29); }
      y = Math.max(labelY, y + 38) + 6;
      if (!dry) {
        ctx.fillStyle = TRACK; roundRect(ctx, PAD, y, inner, 14, 7); ctx.fill();
        const sc = p.score ?? 0;
        if (sc > 0) { ctx.fillStyle = sc >= 90 ? '#2f7d4f' : sc > 60 ? '#b8892a' : '#9b2c2c'; roundRect(ctx, PAD, y, Math.max(14, (inner * sc) / 100), 14, 7); ctx.fill(); }
      }
      y += 14 + 10;
      y = block(ctx, dry, p.score === null ? d.noScore : p.note, PAD, y, inner, `400 22px ${SANS}`, MUTED, 33);
      y += 20;
    }
  }

  h3(d.methodTitle);
  for (const m of d.method) {
    if (!dry) { ctx.fillStyle = '#2f7d4f'; ctx.font = `700 24px ${SANS}`; ctx.textAlign = 'left'; ctx.fillText('✓', PAD, y + 26); }
    y = block(ctx, dry, m, PAD + 44, y, inner - 44, `400 23px ${SANS}`, INK, 36) + 8;
  }
  y = block(ctx, dry, d.limit, PAD, y + 14, inner, `400 21px ${SANS}`, MUTED, 32);

  y += 30;
  if (!dry) { ctx.fillStyle = `${GOLD}77`; ctx.fillRect(PAD, y, inner, 1.5); }
  y = block(ctx, dry, d.footer, PAD, y + 22, inner, `700 22px ${SANS}`, GOLD, 34, 'center');
  y = block(ctx, dry, `${d.page2} · ${d.no} · ${d.date}`, PAD, y + 10, inner, `400 20px ${SANS}`, MUTED, 30, 'center');
  return y;
}

/** Two A4-ratio pages stacked in one PNG: cover (bag, facts, AI score, notice) then the analysis (score by part, method). Returns the height. */
function paint(ctx: CanvasRenderingContext2D, d: ReportPngData, photo: ImageBitmap | null, logo: ImageBitmap | null, dry: boolean): number {
  const h1 = Math.max(PH, Math.ceil(page1(ctx, d, photo, logo, true, 0)) + 90);
  const h2 = Math.max(PH, Math.ceil(page2(ctx, d, logo, true, h1)) + 90 - h1);
  if (!dry) {
    frame(ctx, 0, h1); page1(ctx, d, photo, logo, false, 0);
    frame(ctx, h1, h2); page2(ctx, d, logo, false, h1);
  }
  return h1 + h2;
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
