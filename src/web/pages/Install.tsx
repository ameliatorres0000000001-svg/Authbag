import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import LangPicker from '../LangPicker.tsx';
import { isIos, isStandalone, markInstallSeen, useInstallPrompt } from '../pwa.ts';

// Gold accents from design-reference/stitch/hengz_pwa_install, on a deep-space background
const C = { card: '#15131f', deep: '#0b0a14', text: '#ece8f2', soft: '#cfc6dc', gold: '#f2ca50', gold2: '#d4af37' };

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/** Simple install screen on a black background: native prompt where the browser offers one, otherwise iPhone / Android steps. */
export default function Install() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { canPrompt, prompt } = useInstallPrompt();
  const [guide, setGuide] = useState<null | 'ios' | 'android'>(null);
  const installed = isStandalone();
  // letter-spacing breaks Khmer and Thai clusters
  const track = locale === 'km' || locale === 'th' ? '' : 'tracking-[0.15em]';

  const install = async () => {
    if (canPrompt) { const r = await prompt(); if (r === 'accepted') { markInstallSeen(); return; } }
    setGuide(isIos() ? 'ios' : 'android');
  };
  const continueWeb = () => { markInstallSeen(); nav('/'); };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ background: '#000', color: C.text }}>
      <Galaxy />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-8 pt-4">
        <div className="flex justify-end"><LangPicker dark /></div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <img src="/icons/icon-192.png" alt="" width={104} height={104} className="rounded-[24px]"
            style={{ boxShadow: '0 0 0 1px rgba(242,202,80,0.35), 0 0 70px rgba(242,202,80,0.35)' }} />
          {/* one type scale: 12 kicker · 30 brand · 16 subtitle · 15 rows */}
          <div className="mt-7 text-[12px] font-semibold uppercase" style={{ color: C.gold, letterSpacing: track ? '0.3em' : undefined }}>{t('install.welcome')}</div>
          <h1 className="mt-2 font-serif text-[30px] font-medium leading-tight tracking-[0.04em]"
            style={{ color: '#f6ecd0', textShadow: '0 0 24px rgba(242,202,80,0.25)' }}>HENGZ <span style={{ color: C.gold }}>AUTHENTIC</span></h1>
          <p className="mt-2 max-w-[19rem] text-[16px] leading-snug" style={{ color: C.soft }}>{t('install.sub')}</p>
          <div className="mx-auto my-5 h-px w-14" style={{ background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
          <ul className="w-full max-w-[20rem] space-y-2.5 text-left">
            {([['M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8z', 'install.row1'], ['M9 12l2 2 4-4M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6z', 'install.row2']] as const).map(([d, k]) => (
              <li key={k} className="flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(242,202,80,0.14)', color: C.gold }}><Icon d={d} /></span>
                <span className="text-[15px] leading-snug" style={{ color: C.text }}>{t(k)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          {/* most people look around first: the website is the main action, installing is the light one */}
          <button type="button" onClick={continueWeb} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-bold text-[#3c2f00] ${track}`}
            style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.gold2})`, boxShadow: '0 10px 40px rgba(242,202,80,0.25)' }}>
            {t('install.continue')} →
          </button>
          {installed ? (
            <p className="text-center text-xs" style={{ color: C.gold }}>✓ {t('install.installed')}</p>
          ) : (
            <button type="button" onClick={install} className="mx-auto flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs"
              style={{ color: C.soft, border: '1px solid rgba(242,202,80,0.35)', background: 'rgba(255,255,255,0.04)' }}>
              <span className="scale-75"><Icon d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></span> {t('install.ctaSmall')}
            </button>
          )}
          <div className="flex justify-center gap-5 text-[11px]" style={{ color: 'rgba(207,198,220,0.7)' }}>
            <button type="button" className="underline" onClick={() => setGuide('ios')}>iPhone</button>
            <button type="button" className="underline" onClick={() => setGuide('android')}>Android</button>
          </div>
        </div>
      </div>

      {guide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setGuide(null)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, color: C.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1 rounded-full p-1" style={{ background: C.deep }}>
                {(['ios', 'android'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGuide(g)} className="rounded-full px-3 py-1 text-xs"
                    style={guide === g ? { background: C.gold, color: '#3c2f00' } : { color: C.soft }}>{g === 'ios' ? 'iPhone' : 'Android'}</button>
                ))}
              </div>
              <button type="button" onClick={() => setGuide(null)} aria-label={t('install.close')} className="px-2 text-lg" style={{ color: C.soft }}>✕</button>
            </div>
            <h3 className="mb-3 font-serif text-xl">{t(guide === 'ios' ? 'install.iosTitle' : 'install.androidTitle')}</h3>
            <ol className="space-y-2.5">
              {(guide === 'ios' ? ['install.ios1', 'install.ios2', 'install.ios3'] : ['install.and1', 'install.and2', 'install.and3']).map((k, i) => (
                <li key={k} className="flex gap-3 rounded-xl p-3" style={{ background: C.deep }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold" style={{ background: C.gold, color: '#3c2f00' }}>{i + 1}</span>
                  <div className="text-sm leading-snug">{t(k)}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Black night-sky background: a soft breathing gold glow behind the logo, twinkling stars and a few
 * slowly rising gold sparkles. Pure CSS; motion stops for users who prefer reduced motion.
 */
function Galaxy() {
  const stars = (n: number, size: number, seed: number) => {
    let x = seed;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => `radial-gradient(${size}px ${size}px at ${Math.round(r() * 1000) / 10}% ${Math.round(r() * 1000) / 10}%, rgba(255,255,255,${(0.5 + r() * 0.5).toFixed(2)}), transparent)`).join(',');
  };
  // black night sky: one soft gold glow behind the logo that slowly breathes
  const blobs: [string, string, string, string, string][] = [
    // colour, size, left, top, animation
    ['rgba(242,202,80,0.22)', '80vmin', 'calc(50% - 40vmin)', '4%', 'hz-glow 9s ease-in-out infinite alternate'],
  ];
  const floaters: [string, string, string, number, number][] = [
    // shape, left, size, duration s, delay s
    ['✦', '12%', '22px', 26, 0], ['✦', '78%', '16px', 22, 4], ['✦', '64%', '18px', 30, 14], ['✦', '88%', '12px', 24, 2],
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes hz-glow { from { opacity: .55; transform: scale(.95) } to { opacity: 1; transform: scale(1.05) } }
        @keyframes hz-twinkle { 0%,100% { opacity: .4 } 50% { opacity: 1 } }
        @keyframes hz-rise { 0% { transform: translateY(0) rotate(0deg); opacity: 0 } 10% { opacity: .55 } 90% { opacity: .55 } 100% { transform: translateY(-110vh) rotate(180deg); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .hz-anim { animation: none !important } }
      `}</style>
      {blobs.map(([c, size, left, top, anim], i) => (
        <div key={i} className="hz-anim absolute rounded-full" style={{ width: size, height: size, left, top, background: `radial-gradient(circle, ${c}, transparent 65%)`, filter: 'blur(40px)', animation: anim }} />
      ))}
      <div className="hz-anim absolute inset-0" style={{ backgroundImage: stars(90, 1, 7), animation: 'hz-twinkle 5s ease-in-out infinite' }} />
      <div className="hz-anim absolute inset-0" style={{ backgroundImage: stars(30, 2, 13), animation: 'hz-twinkle 8s ease-in-out infinite reverse' }} />
      {floaters.map(([ch, left, size, dur, delay], i) => (
        <span key={i} className="hz-anim absolute bottom-[-40px]" style={{ left, fontSize: size, color: '#f2ca50', textShadow: '0 0 12px rgba(242,202,80,0.6)', animation: `hz-rise ${dur}s linear ${delay}s infinite`, opacity: 0 }}>{ch}</span>
      ))}
    </div>
  );
}
