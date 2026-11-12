import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n.tsx';

/**
 * Full-screen wait screen while the AI (or a photo analysis) is working: the page underneath cannot be tapped, so a
 * second request or a changed choice cannot cross the one in flight. It names what is happening (one stage after
 * another), counts seconds, says so if the network is slow, and lifts by itself the moment the answer arrives,
 * with a short "done" tick. Stage texts are i18n keys.
 */
export default function AiBusy({ show, stages }: { show: boolean; stages: string[] }) {
  const { t } = useI18n();
  const [secs, setSecs] = useState(0);
  const [phase, setPhase] = useState<'off' | 'on' | 'done'>(show ? 'on' : 'off');
  const was = useRef(show);

  useEffect(() => {
    if (show) { setPhase('on'); setSecs(0); was.current = true; return; }
    if (!was.current) return;
    was.current = false;
    setPhase('done');
    const id = setTimeout(() => setPhase('off'), 700);
    return () => clearTimeout(id);
  }, [show]);

  useEffect(() => {
    if (phase !== 'on') return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // no scrolling the page behind while it is locked
  useEffect(() => {
    if (phase !== 'on') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [phase]);

  if (phase === 'off') return null;
  const stage = stages.length ? stages[Math.min(Math.floor(secs / 4), stages.length - 1)] : 'skill.thinking';
  const done = phase === 'done';

  return createPortal(
    <div role="status" aria-live="polite" aria-busy={!done}
      className={`fixed inset-0 z-[70] flex items-center justify-center px-8 transition-opacity duration-500 ${done ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ background: 'radial-gradient(60% 45% at 50% 45%, rgba(242,202,80,0.16), rgba(8,6,14,0.88) 70%)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
      <style>{`
        @keyframes aib-spin { to { transform: rotate(360deg) } }
        @keyframes aib-breathe { 0%,100% { transform: scale(.92); opacity: .7 } 50% { transform: scale(1.06); opacity: 1 } }
        @keyframes aib-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .aib-anim { animation: none !important } }
      `}</style>
      <div className="flex w-full max-w-xs flex-col items-center text-center text-white">
        <div className="relative mb-7 h-32 w-32">
          <div className="aib-anim absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.45), transparent 65%)', animation: 'aib-breathe 2.4s ease-in-out infinite' }} />
          <div className="aib-anim absolute inset-2 rounded-full border-2 border-[#f2ca50]/15" style={{ borderTopColor: '#f2ca50', animation: done ? 'none' : 'aib-spin 1.1s linear infinite' }} />
          <div className="aib-anim absolute inset-6 rounded-full border border-[#f2ca50]/10" style={{ borderBottomColor: 'rgba(242,202,80,0.7)', animation: done ? 'none' : 'aib-spin 1.8s linear infinite reverse' }} />
          <span className="absolute inset-0 flex items-center justify-center text-4xl" style={{ color: '#f2ca50', textShadow: '0 0 18px rgba(242,202,80,0.8)' }}>{done ? '✓' : '✦'}</span>
        </div>
        <p key={done ? 'done' : stage} className="text-lg font-semibold leading-snug" style={{ animation: 'aib-in .4s ease-out both' }}>{done ? t('aib.done') : t(stage)}</p>
        {!done && <>
          <p className="mt-2 font-mono text-sm text-white/60">{t('aib.secs').replace('{n}', String(secs))}</p>
          <p className="mt-4 text-xs leading-relaxed text-white/55">{secs >= 20 ? t('aib.slow') : t('aib.wait')}</p>
        </>}
      </div>
    </div>,
    document.body,
  );
}
