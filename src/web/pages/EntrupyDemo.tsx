import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import EntrupyLogo from '../EntrupyLogo.tsx';

const SPOTS = [
  { k: 'canvas', x: 30, y: 45 }, { k: 'leather', x: 70, y: 22 }, { k: 'hardware', x: 52, y: 30 }, { k: 'stamp', x: 58, y: 62 },
] as const;

/**
 * Clickable walkthrough of an Entrupy check, for people who have not used it yet.
 * Sample screens only: it never shows a result, a score or a certificate.
 */
export default function EntrupyDemo() {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [spots, setSpots] = useState<Set<string>>(new Set());
  const [brand, setBrand] = useState('Louis Vuitton');
  const total = 6;
  const go = (n: number) => setI(Math.max(0, Math.min(total - 1, n)));

  const screens = [
    <div key="1" className="space-y-3">
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold font-mono text-xs text-charcoal">{n}</span>
          <span>{t(`demo.s1.i${n}`)}</span>
        </div>
      ))}
    </div>,
    <div key="2" className="space-y-2">
      {['Louis Vuitton', 'Chanel', 'Gucci', 'Hermès'].map((b) => (
        <button key={b} type="button" onClick={() => setBrand(b)}
          className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${brand === b ? 'bg-gold text-charcoal' : 'bg-white/5'}`}>
          <span>{b}</span>{brand === b && <span aria-hidden>✓</span>}
        </button>
      ))}
    </div>,
    <div key="3" className="grid grid-cols-3 gap-2">
      {['front', 'back', 'side', 'base', 'label', 'inside'].map((s, n) => (
        <div key={s} className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-white/30 text-[11px] text-white/70">
          <span className="font-mono text-lg text-white/40">{n + 1}</span>{t(`demo.shot.${s}`)}
        </div>
      ))}
    </div>,
    <div key="4" className="space-y-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[16rem] rounded-2xl bg-white/5">
        <svg viewBox="0 0 100 75" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d="M18 30 Q50 4 82 30" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
          <rect x="12" y="28" width="76" height="40" rx="6" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.35)" />
        </svg>
        {SPOTS.map((s) => {
          const on = spots.has(s.k);
          return (
            <button key={s.k} type="button" onClick={() => setSpots((p) => new Set(p).add(s.k))} aria-label={t(`demo.spot.${s.k}`)}
              className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs ${on ? 'border-verified bg-verified text-white' : 'animate-pulse border-gold bg-gold/30 text-white'}`}>{on ? '✓' : '+'}</span>
              <span className="mt-0.5 block whitespace-nowrap text-[10px] text-white/80">{t(`demo.spot.${s.k}`)}</span>
            </button>
          );
        })}
      </div>
      <div className="text-center font-mono text-xs text-white/70">{t('demo.spotsDone')}: {spots.size}/{SPOTS.length}</div>
    </div>,
    <div key="5" className="flex flex-col items-center gap-4 py-4">
      <span className="relative flex h-16 w-16"><span className="absolute inset-0 animate-ping rounded-full bg-gold/30" /><span className="relative m-auto h-10 w-10 animate-spin rounded-full border-4 border-gold border-t-transparent" /></span>
      <div className="h-1.5 w-full overflow-hidden rounded bg-white/10"><div className="h-full w-2/3 animate-pulse bg-gold" /></div>
    </div>,
    <div key="6" className="space-y-2">
      {['demo.r1', 'demo.r2'].map((k) => <div key={k} className="rounded-xl border border-white/15 px-3 py-3 text-sm">{t(k)}</div>)}
      <p className="pt-1 text-xs text-white/60">{t('demo.end')}</p>
    </div>,
  ];

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-10 pt-5">
      <Link to="/verify/entrupy" className="font-mono text-[10px] uppercase tracking-widest text-muted">← {t('ent.title')}</Link>
      <h1 className="text-[26px] leading-tight">{t('demo.title')}</h1>

      {/* phone frame */}
      <div className="mx-auto w-full max-w-[22rem] rounded-[2.2rem] border-[10px] border-charcoal bg-charcoal shadow-xl">
        <div className="flex min-h-[34rem] flex-col rounded-[1.6rem] bg-[#121212] px-4 pb-4 pt-3 text-white">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <EntrupyLogo className="h-5 invert" />
            <span className="font-mono text-[10px] text-white/60">{t('demo.step')} {i + 1}/{total}</span>
          </div>
          <div className="mt-2 rounded bg-gold/90 px-2 py-1 text-center text-[10px] font-semibold text-charcoal">{t('demo.badge')}</div>
          <h2 className="mt-4 font-serif text-2xl">{t(`demo.s${i + 1}.h`)}</h2>
          <p className="mt-1 text-sm leading-relaxed text-white/75">{t(`demo.s${i + 1}`)}</p>
          <div className="mt-4 flex-1">{screens[i]}</div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" className="rounded-full px-4 py-2 text-sm text-white/70 disabled:opacity-30" disabled={i === 0} onClick={() => go(i - 1)}>{t('demo.back')}</button>
            <div className="flex gap-1.5" aria-hidden>{Array.from({ length: total }, (_, n) => <span key={n} className={`h-1.5 w-1.5 rounded-full ${n === i ? 'bg-gold' : 'bg-white/25'}`} />)}</div>
            {i < total - 1
              ? <button type="button" className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-charcoal" onClick={() => go(i + 1)}>{t('demo.next')}</button>
              : <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={() => { setI(0); setSpots(new Set()); }}>{t('demo.restart')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
