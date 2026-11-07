import React, { useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { downsample, encodeWav } from '../shared/wav.ts';

const MAX_SECONDS = 60;

/** Record a short voice clip with the microphone and hand it over as a WAV file (plays on every phone). */
export default function VoiceRecorder({ onDone, disabled }: { onDone: (f: File) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [rec, setRec] = useState(false);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const st = useRef<{ stream: MediaStream; ctx: AudioContext; proc: ScriptProcessorNode; chunks: Float32Array[]; timer: number } | null>(null);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(proc); proc.connect(ctx.destination);
      const began = Date.now();
      const timer = window.setInterval(() => { const s = Math.floor((Date.now() - began) / 1000); setSecs(s); if (s >= MAX_SECONDS) stop(); }, 250);
      st.current = { stream, ctx, proc, chunks, timer };
      setSecs(0); setRec(true);
    } catch { setErr(t('padm.micDenied')); }
  };

  const stop = () => {
    const s = st.current; if (!s) return;
    st.current = null;
    clearInterval(s.timer);
    s.proc.disconnect(); s.stream.getTracks().forEach((tr) => tr.stop());
    const total = s.chunks.reduce((n, c) => n + c.length, 0);
    const all = new Float32Array(total); let o = 0;
    for (const c of s.chunks) { all.set(c, o); o += c.length; }
    const rate = s.ctx.sampleRate; s.ctx.close();
    setRec(false);
    if (total < rate * 0.5) return; // under half a second: nothing said
    onDone(new File([encodeWav(downsample(all, rate, 16000), 16000).buffer as ArrayBuffer], 'voice.wav', { type: 'audio/wav' }));
  };

  return (
    <span className="inline-flex items-center gap-2">
      {rec
        ? <button type="button" className="btn-primary !bg-counterfeit !px-2 !py-0.5 text-xs" onClick={stop}>{t('padm.stopRec')} · {secs}s</button>
        : <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" disabled={disabled} onClick={start}>{t('padm.record')}</button>}
      {err && <span className="text-xs text-counterfeit">{err}</span>}
    </span>
  );
}
