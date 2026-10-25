import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createGate, type GateHint } from '../shared/autocapture.ts';

interface Props { onCapture: (file: File) => void; locale: 'km' | 'en'; disabled?: boolean }

const HINT: Record<GateHint, { km: string; en: string }> = {
  ok: { km: 'ល្អ — សូមកាន់ឲ្យនឹង', en: 'Good — hold steady' },
  blurry: { km: 'ព្រិល — ឲ្យជិត ឬរង់ចាំ focus', en: 'Blurry — move closer or wait for focus' },
  too_dark: { km: 'ងងឹតពេក — បន្ថែមពន្លឺ', en: 'Too dark — add light' },
  too_bright: { km: 'ភ្លឺពេក / ឆ្លុះ — ដូរមុំ', en: 'Too bright / glare — change angle' },
  hold_still: { km: 'កុំរំកិល', en: 'Hold still' },
};
const A = 192; // analysis size (px) of the centre crop

/**
 * Live camera with a guide frame. Auto-captures when the area INSIDE the frame is sharp, well exposed and steady
 * for several consecutive frames. It does not recognise objects: the user aims the frame at the marked part.
 */
export default function CameraCapture({ onCapture, locale, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const gate = useRef(createGate());
  const prev = useRef<Float32Array | null>(null);
  const cooldown = useRef(0);
  const [on, setOn] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<{ progress: number; hint: GateHint }>({ progress: 0, hint: 'ok' });
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setOn(false); }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = s; if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); }
      gate.current.reset(); prev.current = null; setOn(true);
    } catch (e) { setErr((e as Error).message || 'camera_unavailable'); }
  }

  const cropSide = (v: HTMLVideoElement) => Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.6);

  const grab = useCallback((): Promise<File | null> => {
    const v = videoRef.current; if (!v || !v.videoWidth) return Promise.resolve(null);
    const side = cropSide(v); const c = document.createElement('canvas'); c.width = side; c.height = side;
    c.getContext('2d')!.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
    return new Promise((res) => c.toBlob((b) => res(b ? new File([b], 'scan.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.95));
  }, []);

  useEffect(() => {
    if (!on || disabled) return;
    const id = window.setInterval(async () => {
      const v = videoRef.current; if (!v || !v.videoWidth || performance.now() < cooldown.current) return;
      const c = (work.current ??= document.createElement('canvas')); c.width = A; c.height = A;
      const ctx = c.getContext('2d', { willReadFrequently: true })!; const side = cropSide(v);
      ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, A, A);
      const px = ctx.getImageData(0, 0, A, A).data; const g = new Float32Array(A * A); let sum = 0;
      for (let i = 0; i < g.length; i++) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i]; }
      let ls = 0, lq = 0, n = 0;
      for (let y = 1; y < A - 1; y++) for (let x = 1; x < A - 1; x++) { const i = y * A + x; const l = g[i - 1] + g[i + 1] + g[i - A] + g[i + A] - 4 * g[i]; ls += l; lq += l * l; n++; }
      let motion = 0; if (prev.current) { for (let i = 0; i < g.length; i++) motion += Math.abs(g[i] - prev.current[i]); motion /= g.length; }
      prev.current = g;
      const st = gate.current.push({ sharpness: lq / n - (ls / n) ** 2, brightness: sum / g.length, motion });
      setState({ progress: st.progress, hint: st.hint });
      if (st.ready) {
        cooldown.current = performance.now() + 2500; gate.current.reset();
        const f = await grab(); if (f) onCapture(f);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, [on, disabled, grab, onCapture]);

  const t = (k: GateHint) => HINT[k][locale];
  return (
    <div className="space-y-2">
      {!on ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={start} disabled={disabled}>{locale === 'km' ? 'បើកកាមេរ៉ា (ស្វ័យប្រវត្តិ)' : 'Open camera (auto)'}</button>
          <label className="btn-ghost cursor-pointer">{locale === 'km' ? 'ជ្រើសរូប' : 'Choose photo'}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }} /></label>
        </div>
      ) : (
        <div className="relative mx-auto max-w-md overflow-hidden rounded bg-black" style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: '60%', aspectRatio: '1 / 1' }}>
              {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((c) => (
                <span key={c} className={`absolute h-6 w-6 ${c} ${state.hint === 'ok' ? 'border-verified' : 'border-gold'}`} />))}
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-2 text-xs text-white">
            <div className="mb-1">{t(state.hint)}</div>
            <div className="h-1 w-full rounded bg-white/20"><div className="h-1 rounded bg-verified" style={{ width: `${Math.round(state.progress * 100)}%` }} /></div>
          </div>
        </div>
      )}
      {on && <div className="flex gap-2"><button type="button" className="btn-ghost" onClick={async () => { const f = await grab(); if (f) onCapture(f); }}>{locale === 'km' ? 'ថតឥឡូវ' : 'Capture now'}</button><button type="button" className="btn-ghost" onClick={stop}>{locale === 'km' ? 'បិទកាមេរ៉ា' : 'Close camera'}</button></div>}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
