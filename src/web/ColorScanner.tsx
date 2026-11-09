import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { checkMeasurement, laplacianVariance, labToHex, measuredLab, patchStats, type Issue, type Measurement } from '../shared/color.ts';

const MAX_SIDE = 1600;
type Pt = { x: number; y: number };
const rgbCss = (m: [number, number, number]) => `rgb(${m.map(Math.round).join(',')})`;

/**
 * Photo → two taps (white paper, then the bag colour) → a Measurement with its quality checks.
 * The checks are the same ones the server applies; `onChange` gets `issues` and the parent must show
 * no colour result while there is any issue.
 */
export default function ColorScanner({ onChange, onSay }: { onChange: (m: Measurement | null, issues: Issue[], file: File | null) => void; onSay?: (key: string) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<{ data: ImageData; bmp: HTMLCanvasElement; blur: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [white, setWhite] = useState<Pt | null>(null);
  const [spot, setSpot] = useState<Pt | null>(null);
  const [mode, setMode] = useState<'white' | 'spot'>('white');
  const [m, setM] = useState<Measurement | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [ver, setVer] = useState(0); // bumps on every new photo so it is drawn at once

  const r = () => { const d = img.current?.data; return d ? Math.max(8, Math.round(Math.min(d.width, d.height) * 0.02)) : 8; };

  const draw = useCallback(() => {
    const cv = canvas.current, im = img.current;
    if (!cv || !im) return;
    cv.width = im.data.width; cv.height = im.data.height;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(im.bmp, 0, 0);
    const rr = r();
    for (const [p, label] of [[white, 'W'], [spot, '●']] as const) {
      if (!p) continue;
      ctx.lineWidth = Math.max(3, rr / 4);
      ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(p.x, p.y, rr + ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = label === 'W' ? '#fff' : '#C5A059'; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [white, spot, ver]);
  useEffect(draw, [draw]);

  // measure whenever both spots are placed
  useEffect(() => {
    const im = img.current;
    if (!im || !white || !spot) { setM(null); setIssues(file ? ['missing'] : []); onChange(null, file ? ['missing'] : [], file); return; }
    const rr = r();
    const meas: Measurement = {
      white: patchStats(im.data.data, im.data.width, im.data.height, white.x, white.y, rr),
      sample: patchStats(im.data.data, im.data.width, im.data.height, spot.x, spot.y, rr),
      blur: im.blur, minSide: Math.min(im.data.width, im.data.height),
      distance: Math.round(Math.hypot(white.x - spot.x, white.y - spot.y)), r: rr,
    };
    const iss = checkMeasurement(meas);
    setM(meas); setIssues(iss); onChange(meas, iss, file);
    if (iss.length) onSay?.(`paint.issue.${iss[0]}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [white, spot, file]);

  const load = async (f: File) => {
    setLoading(true);
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const data = ctx.getImageData(0, 0, cv.width, cv.height);
      // sharpness on a 512 px grayscale copy (same scale for every photo)
      const s = Math.min(1, 512 / Math.max(cv.width, cv.height));
      const sw = Math.max(8, Math.round(cv.width * s)), sh = Math.max(8, Math.round(cv.height * s));
      const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh;
      const sctx = sm.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(cv, 0, 0, sw, sh);
      const px = sctx.getImageData(0, 0, sw, sh).data;
      const gray = new Float32Array(sw * sh);
      for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      img.current = { data, bmp: cv, blur: laplacianVariance(gray, sw, sh) };
      setFile(f); setWhite(null); setSpot(null); setMode('white'); setVer((v) => v + 1);
      onSay?.('paint.tapWhite');
    } finally { setLoading(false); }
  };

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvas.current; if (!cv || !img.current) return;
    const rect = cv.getBoundingClientRect();
    const p = { x: Math.round(((e.clientX - rect.left) / rect.width) * cv.width), y: Math.round(((e.clientY - rect.top) / rect.height) * cv.height) };
    if (mode === 'white') { setWhite(p); setMode('spot'); if (!spot) onSay?.('paint.tapColor'); } else setSpot(p);
  };

  const lab = m && !issues.length ? measuredLab(m) : null;

  return (
    <div className="space-y-3">
      <label className={`btn-primary flex w-full cursor-pointer items-center justify-center gap-2 !py-4 text-base ${loading ? 'pointer-events-none opacity-60' : ''}`}>
        {file ? t('paint.retake') : t('paint.take')}
        <input type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) load(f); }} />
      </label>

      {file && (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {(['white', 'spot'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setMode(k)}
                className={`rounded-full border px-3 py-1.5 ${mode === k ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>
                {k === 'white' ? t('paint.tapWhite') : t('paint.tapColor')} {(k === 'white' ? white : spot) ? '✓' : ''}
              </button>
            ))}
            {(white || spot) && <button type="button" className="btn-ghost !px-3 !py-1.5 text-sm" onClick={() => { setWhite(null); setSpot(null); setMode('white'); }}>{t('paint.redo')}</button>}
          </div>
          <canvas ref={canvas} onPointerDown={tap} className="block h-auto w-full touch-none rounded-xl border border-hairline" style={{ cursor: 'crosshair' }} />

          {m && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-6 w-6 rounded border border-hairline" style={{ background: rgbCss(m.white.mean) }} />{t('paint.white')}</span>
              {lab && <span className="flex items-center gap-1.5"><span className="h-6 w-10 rounded border border-hairline" style={{ background: labToHex(lab) }} /><b>{t('paint.yourColor')}</b> <span className="font-mono text-muted">{labToHex(lab)}</span></span>}
            </div>
          )}
          {issues.length > 0 && !(issues.length === 1 && issues[0] === 'missing' && !white) && (
            <div className="rounded border-l-4 border-counterfeit bg-counterfeit-bg px-4 py-3 text-sm">
              <p className="font-semibold">{t('paint.cannot')}</p>
              <ul className="mt-1 list-disc pl-5">{issues.map((i) => <li key={i}>{t(`paint.issue.${i}`)}</li>)}</ul>
            </div>
          )}
          {lab && <p className="text-sm text-verified">✓ {t('paint.checksOk')}</p>}
        </>
      )}
    </div>
  );
}
