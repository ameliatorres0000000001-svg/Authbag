import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import LangPicker from '../LangPicker.tsx';
import { isIos, isStandalone, markInstallSeen, useInstallPrompt } from '../pwa.ts';
import { api } from '../api.ts';
import { COUNTRIES, HotPicks, TrendTable, type Overview } from '../Market.tsx';

// Gold accents from design-reference/stitch/hengz_pwa_install, on a deep-space background (Anajak Secondhand)
const C = { card: '#15131f', deep: '#0b0a14', text: '#ece8f2', soft: '#cfc6dc', gold: '#f2ca50', gold2: '#d4af37' };

// simple platform marks (Android robot head, Apple)
const ANDROID = 'M7.2 4.2 5.9 2a.4.4 0 0 1 .7-.4l1.3 2.2A7.9 7.9 0 0 1 12 3c1.5 0 2.9.3 4.1.8l1.3-2.2a.4.4 0 0 1 .7.4l-1.3 2.2A7.4 7.4 0 0 1 20.6 10H3.4a7.4 7.4 0 0 1 3.8-5.8ZM8.5 7.6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Zm7 0a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8ZM3.4 11.2h17.2V19a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z';
const APPLE = 'M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3Z';

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/**
 * Anajak Secondhand install screen on a black background: logo and name, the native install prompt where the
 * browser offers one (otherwise iPhone / Android steps), and one "trending" table per country (TH, ID, MY)
 * from the staff-entered market data — "no data" until a month is entered.
 */
export default function Install() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const { canPrompt, prompt } = useInstallPrompt();
  const [guide, setGuide] = useState<null | 'ios' | 'android'>(null);
  const installed = isStandalone();
  const [market, setMarket] = useState<Overview | null>(null);
  useEffect(() => {
    let on = true;
    api.get<Overview>('/api/market/overview?top=5').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    return () => { on = false; };
  }, []);
  // letter-spacing breaks Khmer and Thai clusters
  const track = locale === 'km' || locale === 'th' ? '' : 'tracking-[0.15em]';

  // Android: the browser's own install prompt when it offers one, otherwise the steps
  const installAndroid = async () => {
    if (canPrompt && !isIos()) { const r = await prompt(); if (r === 'accepted') { markInstallSeen(); return; } }
    setGuide('android');
  };
  const continueWeb = () => { markInstallSeen(); nav('/'); };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ background: '#000', color: C.text }}>
      <Galaxy />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-4 pb-4 pt-4 sm:px-6 lg:max-w-5xl">
        <div className="flex justify-end"><LangPicker dark /></div>

        <div className="mx-auto flex w-full max-w-md flex-col items-center pt-4 text-center">
          <img src="/icons/icon-192.png" alt="Anajak Secondhand" width={104} height={104} className="rounded-[24px]"
            style={{ boxShadow: '0 0 0 1px rgba(242,202,80,0.35), 0 0 70px rgba(242,202,80,0.35)' }} />
          {/* one type scale: 12 kicker · 30 brand · 16 subtitle · 15 rows */}
          <div className="mt-7 text-[12px] font-semibold uppercase" style={{ color: C.gold, letterSpacing: track ? '0.3em' : undefined }}>{t('install.welcome')}</div>
          <h1 className="mt-2 font-serif text-[30px] font-medium leading-tight tracking-[0.04em]"
            style={{ color: '#f6ecd0', textShadow: '0 0 24px rgba(242,202,80,0.25)' }}>ANAJAK <span style={{ color: C.gold }}>SECONDHAND</span></h1>
          <p className="mt-2 max-w-[19rem] text-[16px] leading-snug" style={{ color: C.soft }}>{t('install.sub')}</p>
          <div className="mx-auto my-5 h-px w-14" style={{ background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)` }} />
        </div>

        {/* best sellers this month in TH / ID / MY, with why they sell */}
        <section className="w-full" aria-labelledby="hot-h">
          <div className="mb-3 text-center">
            <div className="text-[12px] font-semibold uppercase" style={{ color: C.gold, letterSpacing: track ? '0.3em' : undefined }}>🔥 {t('install.trending')}</div>
            <h2 id="hot-h" className="mt-1 font-serif text-[20px]" style={{ color: '#f6ecd0' }}>{t('market.hotTitle')}</h2>
          </div>
          <HotPicks dark countries={market?.countries ?? null} />
        </section>

        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="mt-5 w-full max-w-[20rem]">
            {installed ? (
              <p className="text-center text-xs" style={{ color: C.gold }}>✓ {t('install.installed')}</p>
            ) : (
              <div className="grid w-full grid-cols-2 gap-2.5">
                <button type="button" onClick={installAndroid} className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px]"
                  style={{ color: C.text, border: '1px solid rgba(242,202,80,0.35)', background: 'rgba(255,255,255,0.04)' }}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="#3ddc84" aria-hidden><path d={ANDROID} /></svg> Android
                </button>
                <button type="button" onClick={() => setGuide('ios')} className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px]"
                  style={{ color: C.text, border: '1px solid rgba(242,202,80,0.35)', background: 'rgba(255,255,255,0.04)' }}>
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden><path d={APPLE} /></svg> iOS
                </button>
              </div>
            )}
          </div>
        </div>

        {/* trending second-hand models: one table per country */}
        <section className="mt-8 w-full" aria-labelledby="trending-h">
          <div className="mb-3 text-center">
            <div className="text-[12px] font-semibold uppercase" style={{ color: C.gold, letterSpacing: track ? '0.3em' : undefined }}>{t('market.top5')}</div>
            <h2 id="trending-h" className="mt-1 text-[15px]" style={{ color: C.soft }}>{t('install.trendingSub')}</h2>
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {COUNTRIES.map((cc) => {
              const m = market?.countries.find((x) => x.country === cc);
              return (
                <div key={cc} className="w-[85%] shrink-0 snap-center sm:w-[70%] lg:w-auto">
                  {market ? <TrendTable dark compact country={cc} period={m?.period ?? null} rows={m?.rows ?? []} />
                    : <div className="h-64 animate-pulse rounded-2xl" style={{ background: 'rgba(255,255,255,0.06)' }} />}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px]" style={{ color: '#8f889c' }}>{t('market.info')}</p>
        </section>

        <div className="sticky bottom-0 -mx-4 mt-6 px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-3 sm:-mx-6 sm:px-6" style={{ background: 'linear-gradient(transparent, #000 35%)' }}>
          {/* most people look around first: the website is the main action */}
          <button type="button" onClick={continueWeb} className={`mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-bold text-[#3c2f00] ${track}`}
            style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.gold2})`, boxShadow: '0 10px 40px rgba(242,202,80,0.25)' }}>
            {t('install.continue')} →
          </button>
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
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
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
