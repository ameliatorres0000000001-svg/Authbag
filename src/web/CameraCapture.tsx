import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createGate, type GateHint } from '../shared/autocapture.ts';

interface Props {
  onCapture: (file: File) => void; locale: 'km' | 'en'; disabled?: boolean;
  /** example photo of what to photograph: shown faintly inside the frame to line up the same spot */
  example?: string | null;
}

const HINT: Record<GateHint, { km: string; en: string }> = {
  ok: { km: 'ល្អ — សូមកាន់ឲ្យនឹង', en: 'Good — hold steady' },
  blurry: { km: 'ព្រិល — ចុចលើរូបដើម្បី focus ឬរង់ចាំ', en: 'Blurry — tap the picture to focus, or wait' },
  too_dark: { km: 'ងងឹតពេក — បន្ថែមពន្លឺ ឬបើកភ្លើង', en: 'Too dark — add light or turn on the torch' },
  too_bright: { km: 'ភ្លឺពេក / ឆ្លុះ — ដូរមុំ', en: 'Too bright / glare — change the angle' },
  hold_still: { km: 'កុំរំកិល', en: 'Hold still' },
};
const L = {
  open: { km: 'បើកកាមេរ៉ា', en: 'Open camera' },
  choose: { km: 'ជ្រើសរូប', en: 'Choose photo' },
  close: { km: 'បិទ', en: 'Close' },
  shoot: { km: 'ថត', en: 'Take photo' },
  auto: { km: 'ថតស្វ័យប្រវត្តិ', en: 'Auto capture' },
  aim: { km: 'តម្រង់ចំណុចឲ្យដូចឧទាហរណ៍…', en: 'Line up the spot like the example…' },
  ghost: { km: 'ឧទាហរណ៍', en: 'Example' },
  retake: { km: 'ថតម្ដងទៀត', en: 'Retake' },
  use: { km: 'ប្រើរូបនេះ ✓', en: 'Use this photo ✓' },
  tapFocus: { km: 'ចុចលើរូប ដើម្បី focus', en: 'Tap the picture to focus' },
  torch: { km: 'ភ្លើង', en: 'Torch' },
};
const A = 192; // analysis size (px) of the centre area
const AIM_MS = 3000; // with auto capture on, give the person time to find the spot first

/**
 * Live camera for one guided photo. The person lines up the spot (the example is shown faintly in the frame),
 * then takes the photo, checks it and confirms. Auto capture is optional and waits a few seconds before it starts.
 * It never recognises objects: it only checks sharpness, light and steadiness.
 */
export default function CameraCapture({ onCapture, locale, disabled, example }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);
  const gate = useRef(createGate({ needFrames: 12 }));
  const prev = useRef<Float32Array | null>(null);
  const aimUntil = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<{ progress: number; hint: GateHint }>({ progress: 0, hint: 'ok' });
  const [auto, setAuto] = useState(false);
  const [ghost, setGhost] = useState(true);
  const [torch, setTorch] = useState<boolean | null>(null); // null = not supported
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [aiming, setAiming] = useState(false);
  const l = (k: keyof typeof L) => L[k][locale];

  const stop = useCallback(() => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; setOn(false); setTorch(null); }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);
  // a new example means a new step: start aiming again
  useEffect(() => { aimUntil.current = performance.now() + AIM_MS; gate.current.reset(); }, [example]);

  const track = () => streamRef.current?.getVideoTracks()[0];

  async function start() {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = s;
      gate.current.reset(); prev.current = null; aimUntil.current = performance.now() + AIM_MS; setOn(true);
      const tr = s.getVideoTracks()[0];
      const caps = (tr.getCapabilities?.() ?? {}) as { focusMode?: string[]; torch?: boolean };
      if (caps.focusMode?.includes('continuous')) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => {});
      setTorch(caps.torch ? false : null);
    } catch (e) { setErr((e as Error).message || 'camera_unavailable'); }
  }

  // The <video> is only rendered once the camera is on, so attach the stream after that render.
  useEffect(() => {
    const v = videoRef.current; const s = streamRef.current;
    if (!on || !v || !s) return;
    if (v.srcObject !== s) v.srcObject = s;
    v.play().catch((e) => setErr((e as Error).message || 'camera_play_failed'));
  }, [on]);

  /** Tap to focus: ask the camera to refocus (where supported), then keep focusing continuously. */
  const focus = async () => {
    const tr = track(); if (!tr) return;
    const caps = (tr.getCapabilities?.() ?? {}) as { focusMode?: string[] };
    try {
      if (caps.focusMode?.includes('single-shot')) await tr.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as any] });
      if (caps.focusMode?.includes('continuous')) await tr.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
    } catch { /* not supported */ }
    gate.current.reset();
  };
  const toggleTorch = async () => {
    const tr = track(); if (!tr || torch === null) return;
    try { await tr.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(!torch); } catch { setTorch(null); }
  };

  // the whole frame is kept (a whole-bag photo must not be cropped)
  const grab = useCallback((): Promise<File | null> => {
    const v = videoRef.current; if (!v || !v.videoWidth) return Promise.resolve(null);
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    return new Promise((res) => c.toBlob((b) => res(b ? new File([b], 'scan.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92));
  }, []);

  const take = useCallback(async () => {
    const f = await grab(); if (!f) return;
    setShot({ file: f, url: URL.createObjectURL(f) });
  }, [grab]);

  useEffect(() => {
    if (!on || disabled || shot) return;
    const id = window.setInterval(async () => {
      const v = videoRef.current; if (!v || !v.videoWidth) return;
      const c = (work.current ??= document.createElement('canvas')); c.width = A; c.height = A;
      const ctx = c.getContext('2d', { willReadFrequently: true })!; const side = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.6);
      ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, A, A);
      const px = ctx.getImageData(0, 0, A, A).data; const g = new Float32Array(A * A); let sum = 0;
      for (let i = 0; i < g.length; i++) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i]; }
      let ls = 0, lq = 0, n = 0;
      for (let y = 1; y < A - 1; y++) for (let x = 1; x < A - 1; x++) { const i = y * A + x; const lap = g[i - 1] + g[i + 1] + g[i - A] + g[i + A] - 4 * g[i]; ls += lap; lq += lap * lap; n++; }
      let motion = 0; if (prev.current) { for (let i = 0; i < g.length; i++) motion += Math.abs(g[i] - prev.current[i]); motion /= g.length; }
      prev.current = g;
      const st = gate.current.push({ sharpness: lq / n - (ls / n) ** 2, brightness: sum / g.length, motion });
      const stillAiming = performance.now() < aimUntil.current;
      setAiming(auto && stillAiming);
      setState({ progress: auto && !stillAiming ? st.progress : 0, hint: st.hint });
      if (auto && !stillAiming && st.ready) { gate.current.reset(); take(); }
    }, 150);
    return () => window.clearInterval(id);
  }, [on, disabled, shot, auto, take]);

  const confirm = () => {
    if (!shot) return;
    onCapture(shot.file);
    setShot(null);
    aimUntil.current = performance.now() + AIM_MS; gate.current.reset();
  };

  if (!on) return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary !py-3" onClick={start} disabled={disabled}>📷 {l('open')}</button>
        <label className="btn-ghost flex cursor-pointer items-center justify-center !py-3">🖼️ {l('choose')}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }} /></label>
      </div>
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );

  // check the photo before keeping it
  if (shot) return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl bg-black"><img src={shot.url} alt="" className="mx-auto max-h-[60vh] w-auto" /></div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost !py-3" onClick={() => setShot(null)}>↺ {l('retake')}</button>
        <button type="button" className="btn-primary !py-3" onClick={confirm}>{l('use')}</button>
      </div>
    </div>
  );

  const ok = state.hint === 'ok';
  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '4 / 5', maxHeight: '56vh' }} onClick={focus}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {/* guide frame with the example faintly inside, to line up the same spot */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative overflow-hidden rounded-lg" style={{ width: '78%', aspectRatio: '1 / 1' }}>
            {example && ghost && <img src={example} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen" />}
            {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((c) => (
              <span key={c} className={`absolute h-7 w-7 ${c} ${ok ? 'border-verified' : 'border-gold'}`} />))}
          </div>
        </div>
        {/* top controls */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={stop} className="rounded-full bg-black/55 px-3 py-1 text-xs text-white">✕ {l('close')}</button>
          <div className="flex gap-1.5">
            {example && <button type="button" onClick={() => setGhost(!ghost)} className={`rounded-full px-3 py-1 text-xs ${ghost ? 'bg-gold text-charcoal' : 'bg-black/55 text-white'}`}>👁 {l('ghost')}</button>}
            {torch !== null && <button type="button" onClick={toggleTorch} className={`rounded-full px-3 py-1 text-xs ${torch ? 'bg-gold text-charcoal' : 'bg-black/55 text-white'}`}>💡 {l('torch')}</button>}
          </div>
        </div>
        {/* status */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6 text-xs text-white">
          <div>{aiming ? l('aim') : HINT[state.hint][locale]}</div>
          <div className="text-[10px] text-white/60">{l('tapFocus')}</div>
          {auto && <div className="mt-1 h-1 w-full rounded bg-white/20"><div className="h-1 rounded bg-verified transition-all" style={{ width: `${Math.round(state.progress * 100)}%` }} /></div>}
        </div>
      </div>

      {/* shutter + auto switch */}
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); aimUntil.current = performance.now() + AIM_MS; gate.current.reset(); }} />
          {l('auto')}
        </label>
        <button type="button" onClick={take} disabled={disabled} aria-label={l('shoot')}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-gold bg-white shadow-lg active:scale-95">
          <span className="h-14 w-14 rounded-full bg-charcoal" />
        </button>
        <label className="flex cursor-pointer items-center gap-1 text-xs underline">🖼️ {l('choose')}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onCapture(f); }} /></label>
      </div>
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
