import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { applyLens, fitSize, LENS_MODES, type LensMode } from '../shared/lens.ts';
import type { Rect } from '../shared/marks.ts';

/**
 * One analysis point, enlarged, with optional filters ("lenses") and an alignment grid.
 * Filters only make what the camera captured easier to see; they add no information and decide nothing.
 */
export default function LensViewer({ src, rect, title }: { src: string; rect: Rect; title: string }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<LensMode>('original');
  const [grid, setGrid] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);

  useEffect(() => {
    const c = canvas.current;
    if (!img || !c) return;
    // naturalWidth/Height follow EXIF orientation, and drawImage draws the oriented image, so the crop matches the photo shown above
    const sx = rect.x * img.naturalWidth, sy = rect.y * img.naturalHeight, sw = rect.w * img.naturalWidth, sh = rect.h * img.naturalHeight;
    const { w, h } = fitSize(sw, sh);
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    if (mode !== 'original') {
      const data = ctx.getImageData(0, 0, w, h);
      applyLens(mode, data.data, w, h);
      ctx.putImageData(data, 0, 0);
    }
  }, [img, rect.x, rect.y, rect.w, rect.h, mode]);

  return (
    <div className="space-y-2 rounded-lg border border-gold bg-surface-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{title}</div>
        <div className="label !mb-0">{t('lens.title')}</div>
      </div>
      <div className="relative overflow-hidden rounded bg-charcoal">
        <canvas ref={canvas} className="block h-auto w-full" />
        {grid && <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(197,160,89,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(197,160,89,.55) 1px, transparent 1px)',
          backgroundSize: '10% 10%',
        }} />}
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
        {LENS_MODES.map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`shrink-0 rounded border px-2.5 py-1 text-xs ${mode === m ? 'border-charcoal bg-charcoal text-white' : 'border-strong bg-white'}`}>{t(`lens.${m}`)}</button>
        ))}
        <button onClick={() => setGrid(!grid)} className={`shrink-0 rounded border px-2.5 py-1 text-xs ${grid ? 'border-gold bg-gold-light' : 'border-strong bg-white'}`}>{t('lens.grid')}</button>
      </div>
      <p className="text-[11px] text-muted">{t(`lens.help.${mode}`)}</p>
      <p className="text-[11px] text-muted">{t('lens.honest')}</p>
    </div>
  );
}
