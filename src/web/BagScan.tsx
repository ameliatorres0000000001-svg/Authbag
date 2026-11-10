import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { checkMeasurement, checkQuick, laplacianVariance, patchStats, type Measurement, type QuickMeasurement } from '../shared/color.ts';
import { autoColour, autoSpots } from '../shared/autoscan.ts';

const MAX_SIDE = 1600;
type Pt = { x: number; y: number };

export type ScanResult =
  | { kind: 'precise'; measurement: Measurement }
  | { kind: 'quick'; quick: QuickMeasurement }
  | { kind: 'issues'; issues: string[] };

/**
 * One bag photo → the colour, with no taps needed:
 * - a white paper in the photo is found automatically and corrects the light (accurate colour);
 * - without paper (or when the paper is not usable) the phone's colour is used (approximate colour).
 * The person can tap the photo to move the colour spot. The same quality checks as the server decide; a spot that
 * fails them gives `issues` (and no colour).
 */
export default function BagScan({ file, onResult }: { file: File; onResult: (r: ScanResult) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<{ data: ImageData; bmp: HTMLCanvasElement; blur: number } | null>(null);
  const [white, setWhite] = useState<Pt | null>(null);
  const [spot, setSpot] = useState<Pt | null>(null);
  const [usePaper, setUsePaper] = useState(true);
  const [ver, setVer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<'precise' | 'quick' | 'issues' | null>(null);

  const rad = () => { const d = img.current?.data; return d ? Math.max(8, Math.round(Math.min(d.width, d.height) * 0.02)) : 8; };

  // load the photo, then find the paper (if any) and the bag colour
  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      const ctx = cv.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      const data = ctx.getImageData(0, 0, cv.width, cv.height);
      const s = Math.min(1, 512 / Math.max(cv.width, cv.height));
      const sw = Math.max(8, Math.round(cv.width * s)), sh = Math.max(8, Math.round(cv.height * s));
      const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh;
      const sctx = sm.getContext('2d', { willReadFrequently: true })!;
      sctx.drawImage(cv, 0, 0, sw, sh);
      const px = sctx.getImageData(0, 0, sw, sh).data;
      const gray = new Float32Array(sw * sh);
      for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      if (off) return;
      img.current = { data, bmp: cv, blur: laplacianVariance(gray, sw, sh) };
      const r = Math.max(8, Math.round(Math.min(cv.width, cv.height) * 0.02));
      const found = autoSpots(data.data, cv.width, cv.height, r);
      if (found) { setWhite(found.white); setSpot(found.spot); setUsePaper(true); }
      else { setWhite(null); setSpot(autoColour(data.data, cv.width, cv.height, r) ?? { x: Math.round(cv.width / 2), y: Math.round(cv.height / 2) }); }
      setVer((v) => v + 1); setLoading(false);
    })().catch(() => { if (!off) { setLoading(false); setState('issues'); onResult({ kind: 'issues', issues: ['missing'] }); } });
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const draw = useCallback(() => {
    const cv = canvas.current, im = img.current;
    if (!cv || !im) return;
    cv.width = im.data.width; cv.height = im.data.height;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(im.bmp, 0, 0);
    const rr = rad();
    const ring = (p: Pt, colour: string, w: number) => {
      ctx.lineWidth = w; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(p.x, p.y, rr * 1.6 + w, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = colour; ctx.beginPath(); ctx.arc(p.x, p.y, rr * 1.6, 0, Math.PI * 2); ctx.stroke();
    };
    if (white && usePaper && state === 'precise') ring(white, '#ffffff', Math.max(3, rr / 3));
    if (spot) {
      ring(spot, '#C5A059', Math.max(4, rr / 2.5));
      ctx.fillStyle = '#C5A059'; ctx.beginPath(); ctx.arc(spot.x, spot.y, Math.max(3, rr / 4), 0, Math.PI * 2); ctx.fill();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [white, spot, usePaper, state, ver]);
  useEffect(draw, [draw]);

  // measure: with the paper when it passes every check, else the quick colour
  useEffect(() => {
    const im = img.current;
    if (!im || !spot) return;
    const rr = rad();
    const sample = patchStats(im.data.data, im.data.width, im.data.height, spot.x, spot.y, rr);
    const minSide = Math.min(im.data.width, im.data.height);
    if (white && usePaper) {
      const m: Measurement = { white: patchStats(im.data.data, im.data.width, im.data.height, white.x, white.y, rr), sample, blur: im.blur, minSide,
        distance: Math.round(Math.hypot(white.x - spot.x, white.y - spot.y)), r: rr };
      if (!checkMeasurement(m).length) { setState('precise'); onResult({ kind: 'precise', measurement: m }); return; }
    }
    const q: QuickMeasurement = { sample, blur: im.blur, minSide, r: rr };
    const iss = checkQuick(q);
    if (iss.length) { setState('issues'); onResult({ kind: 'issues', issues: iss }); return; }
    setState('quick'); onResult({ kind: 'quick', quick: q });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, white, usePaper, ver]);

  const tap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvas.current; if (!cv || !img.current) return;
    const rect = cv.getBoundingClientRect();
    setSpot({ x: Math.round(((e.clientX - rect.left) / rect.width) * cv.width), y: Math.round(((e.clientY - rect.top) / rect.height) * cv.height) });
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface-low">
        <canvas ref={canvas} onPointerDown={tap} className="mx-auto block h-auto max-h-[52vh] w-auto max-w-full touch-none" style={{ cursor: 'crosshair' }} />
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">{t('pn.reading')}</div>}
        {!loading && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-[11px] text-white">👆 {t('pn.tapToMove')}</div>}
      </div>
      {state === 'precise' && (
        <p className="flex items-center gap-2 text-xs text-verified">✓ {t('pn.paperUsed')}
          <button type="button" className="ml-auto text-muted underline" onClick={() => setUsePaper(false)}>{t('pn.notPaper')}</button></p>
      )}
      {state === 'quick' && white && !usePaper && (
        <p className="text-xs text-muted"><button type="button" className="underline" onClick={() => setUsePaper(true)}>{t('pn.usePaper')}</button></p>
      )}
    </div>
  );
}
