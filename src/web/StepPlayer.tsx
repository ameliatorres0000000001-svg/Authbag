import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { MixDiagram, StepArt } from './StepArt.tsx';
import { say, stopAudio } from './voice.ts';
import type { PaintRecipe } from './pages/Paint.tsx';
import type { StepIcon } from '../shared/voiceKeys.ts';

type Card =
  | { kind: 'mix'; text: string; audio: string | null }
  | { kind: 'step'; id: string; text: string; icon: StepIcon | null; minutes: number | null; photo: string | null; audio: string | null };

/** Built from the recipe in the user's language, so it also works when no voice text was saved for the mix. */
export function mixSentence(r: PaintRecipe, t: (k: string) => string): string {
  const items = r.parts.map((p) => t('steps.mixItem').replace('{name}', `${p.brand} ${p.name}`).replace('{n}', String(p.parts)));
  return t('steps.mixSentence').replace('{list}', items.join(t('steps.mixJoin')));
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.3);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* no audio */ }
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Full-screen painting steps for people who would rather watch and listen than read: one big picture per step,
 * a short sentence, its voice, and a countdown for drying times. "Play all" reads each step and moves on by itself.
 */
export default function StepPlayer({ recipe, onClose }: { recipe: PaintRecipe; onClose: () => void }) {
  const { t, locale } = useI18n();
  const cards: Card[] = [
    { kind: 'mix', text: recipe.mix_text || mixSentence(recipe, t), audio: recipe.mix_audio && recipe.mix_text ? `/api/paint/recipes/${recipe.id}/mix-audio?v=${encodeURIComponent(recipe.updated_at)}` : null },
    ...recipe.steps.map((s): Card => ({
      kind: 'step', id: s.id, text: s.text, icon: s.icon, minutes: s.minutes,
      photo: s.has_photo ? `/api/paint/steps/${s.id}/photo?v=${encodeURIComponent(s.updated_at)}` : null,
      audio: s.audio ? `/api/paint/steps/${s.id}/audio?v=${encodeURIComponent(s.updated_at)}` : null,
    })),
  ];
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const autoRef = useRef(auto); autoRef.current = auto;
  const idxRef = useRef(idx); idxRef.current = idx;
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const go = useCallback((i: number) => {
    const el = scroller.current, card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
    setIdx(i);
  }, []);

  const next = useCallback(() => {
    if (idxRef.current < cards.length - 1) go(idxRef.current + 1);
    else setAuto(false);
  }, [cards.length, go]);

  // speak a card; in "play all" mode, then wait for its timer (if any) or move on
  const play = useCallback(async (i: number) => {
    const c = cards[i]; if (!c) return;
    setLeft(c.kind === 'step' && c.minutes ? c.minutes * 60 : null); setRunning(false);
    await say(c.audio, c.text, locale);
    if (!autoRef.current || idxRef.current !== i) return;
    if (c.kind === 'step' && c.minutes) setRunning(true);
    else setTimeout(() => { if (autoRef.current && idxRef.current === i) next(); }, 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, next]);

  // follow swipes
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    let tmr = 0;
    const onScroll = () => { clearTimeout(tmr); tmr = window.setTimeout(() => { const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== idxRef.current) setIdx(i); }, 120); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  // a new card: reset its timer; in play-all mode, speak it
  useEffect(() => { const c = cards[idx]; setLeft(c?.kind === 'step' && c.minutes ? c.minutes * 60 : null); setRunning(false); if (auto) play(idx); else stopAudio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [idx]);
  // countdown
  useEffect(() => {
    if (!running || left === null) return;
    if (left <= 0) { setRunning(false); beep(); if (autoRef.current) setTimeout(next, 1500); return; }
    const id = setTimeout(() => setLeft((l) => (l === null ? l : l - 1)), 1000);
    return () => clearTimeout(id);
  }, [running, left, next]);
  // keep the screen on while playing; stop all sound on close
  useEffect(() => {
    if (auto) (navigator as any).wakeLock?.request('screen').then((w: any) => { wake.current = w; }).catch(() => {});
    else { wake.current?.release().catch(() => {}); wake.current = null; }
  }, [auto]);
  useEffect(() => () => { stopAudio(); wake.current?.release().catch(() => {}); }, []);

  const startAll = () => { setAuto(true); go(idx); play(idx); };
  const c = cards[idx];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label={recipe.name_km}>
      <header className="flex items-center gap-2 border-b border-hairline px-4 py-2">
        <span className="h-7 w-7 shrink-0 rounded-full border border-hairline" style={{ background: recipe.hex }} />
        <h2 className="min-w-0 flex-1 truncate text-base">{locale !== 'km' && recipe.name_en ? recipe.name_en : recipe.name_km}</h2>
        <span className="font-mono text-xs text-muted">{idx + 1} / {cards.length}</span>
        <button type="button" className="btn-ghost !px-3 !py-1 text-sm" onClick={() => { stopAudio(); onClose(); }} aria-label={t('steps.close')}>✕</button>
      </header>

      <div ref={scroller} className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((card, i) => (
          <section key={i} className="flex w-full shrink-0 snap-center flex-col items-center overflow-y-auto px-5 pb-4 pt-5" aria-label={`${i + 1}`}>
            <div className="flex h-[38vh] w-full max-w-md items-center justify-center overflow-hidden rounded-3xl bg-surface-low">
              {card.kind === 'mix' ? <div className="p-3"><MixDiagram parts={recipe.parts} hex={recipe.hex} /></div>
                : card.photo ? <img src={card.photo} alt="" className="h-full w-full object-cover" />
                  : card.icon ? <StepArt icon={card.icon} className="h-[85%] w-[85%]" />
                    : <span className="font-serif text-7xl text-strong">{i}</span>}
            </div>
            <div className="mt-4 flex w-full max-w-md items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal font-serif text-lg text-gold">{card.kind === 'mix' ? '◎' : i}</span>
              <p className="text-[20px] leading-snug">{card.kind === 'mix' ? <><b className="block text-sm text-gold">{t('steps.mix')}</b>{card.text}</> : card.text}</p>
            </div>
            {card.kind === 'step' && card.minutes && i === idx && left !== null && (
              <div className="mt-4 flex w-full max-w-md items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3">
                <StepArt icon="wait" className="h-10 w-12" />
                <span className={`flex-1 font-mono text-3xl ${left === 0 ? 'text-verified' : ''}`}>{mmss(left)}</span>
                {left > 0 && <button type="button" className="btn-ghost !px-3 text-sm" onClick={() => setRunning(!running)}>{running ? t('steps.pause') : t('steps.start')}</button>}
                <button type="button" className="btn-ghost !px-3 text-sm" onClick={() => { setRunning(false); setLeft(0); next(); }}>{t('steps.skip')}</button>
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className="flex items-center gap-2 border-t border-hairline px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
        <button type="button" className="btn-ghost !px-4 !py-3" disabled={idx === 0} onClick={() => { setAuto(false); go(idx - 1); }} aria-label={t('steps.prev')}>←</button>
        <button type="button" className="btn-ghost flex-1 !py-3" onClick={() => { setAuto(false); play(idx); }}>{t('steps.replay')}</button>
        {auto
          ? <button type="button" className="btn-primary flex-1 !py-3" onClick={() => { setAuto(false); stopAudio(); setRunning(false); }}>■ {t('steps.stop')}</button>
          : <button type="button" className="btn-primary flex-1 !py-3" onClick={startAll}>▶ {t('steps.play')}</button>}
        <button type="button" className="btn-ghost !px-4 !py-3" disabled={idx === cards.length - 1} onClick={() => { setAuto(false); go(idx + 1); }} aria-label={t('steps.next')}>→</button>
      </footer>
      <span className="sr-only" aria-live="polite">{c?.text}</span>
    </div>
  );
}
