import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import LangPicker from '../LangPicker.tsx';
import { isIos, isStandalone, markInstallSeen, useInstallPrompt } from '../pwa.ts';
import { api } from '../api.ts';
import { COUNTRIES, FLAG, monthLabel, type Country, type Overview, type TrendRow } from '../Market.tsx';

// Night palette on the live galaxy: cream type, champagne gold, dark glass cards
const C = { ivory: '#0B0A12', paper: 'rgba(255,255,255,0.055)', ink: '#F6ECD0', muted: '#A9A2B6', line: 'rgba(242,202,80,0.22)', gold: '#F2CA50', goldSoft: 'rgba(242,202,80,0.16)' };

// simple platform marks (Android robot head, Apple)
const ANDROID = 'M7.2 4.2 5.9 2a.4.4 0 0 1 .7-.4l1.3 2.2A7.9 7.9 0 0 1 12 3c1.5 0 2.9.3 4.1.8l1.3-2.2a.4.4 0 0 1 .7.4l-1.3 2.2A7.4 7.4 0 0 1 20.6 10H3.4a7.4 7.4 0 0 1 3.8-5.8ZM8.5 7.6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Zm7 0a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8ZM3.4 11.2h17.2V19a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z';
const APPLE = 'M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3Z';

/**
 * Anajak Secondhand install / welcome screen on a live galaxy (install only — not a dashboard): logo and tagline, one compact
 * card per country with its single top brand and model this month and one sentence on why it sells
 * (staff-entered market data, "no data" until entered), then Android / iOS install and the main button.
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
    api.get<Overview>('/api/market/overview?top=1').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    return () => { on = false; };
  }, []);
  // letter-spacing breaks Khmer and Thai clusters: only track Latin text
  const latin = locale !== 'km' && locale !== 'th';

  // Android: the browser's own install prompt when it offers one, otherwise the steps
  const installAndroid = async () => {
    if (canPrompt && !isIos()) { const r = await prompt(); if (r === 'accepted') { markInstallSeen(); return; } }
    setGuide('android');
  };
  const continueWeb = () => { markInstallSeen(); nav('/'); };

  return (
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ background: '#000', color: C.ink }}>
      <Galaxy />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
        <div className="flex justify-end"><LangPicker dark /></div>

        {/* 1 · header */}
        <header className="flex flex-col items-center pt-3 text-center">
          <img src="/icons/icon-192.png" alt="Anajak Secondhand" width={76} height={76} className="rounded-[20px]"
            style={{ boxShadow: '0 0 0 1px rgba(242,202,80,0.35), 0 0 60px rgba(242,202,80,0.35)' }} />
          <div className="mt-5 text-[12px] font-medium" style={{ color: C.gold }}>{t('install.welcome')}</div>
          <h1 className="mt-1.5 flex flex-col items-center font-serif font-medium leading-none">
            <span className="text-[38px] tracking-[0.14em]" style={{ textShadow: '0 0 24px rgba(242,202,80,0.25)' }}>ANAJAK</span>
            <span className="mt-2 pl-[0.45em] text-[14px] tracking-[0.45em]" style={{ color: C.gold }}>SECONDHAND</span>
          </h1>
          <div className="my-4 flex items-center gap-2" aria-hidden>
            <span className="h-px w-10" style={{ background: C.gold }} />
            <span className="h-1.5 w-1.5 rotate-45" style={{ background: C.gold }} />
            <span className="h-px w-10" style={{ background: C.gold }} />
          </div>
          <p className="max-w-[18rem] text-[15px] leading-relaxed" style={{ color: C.muted }}>{t('install.sub')}</p>
        </header>

        {/* 2 · one top brand + model per country */}
        <section className="mt-8" aria-labelledby="top-h">
          <div className="mb-3 flex items-end justify-between gap-3 border-b pb-2" style={{ borderColor: C.line }}>
            <h2 id="top-h" className="font-serif text-[20px] leading-tight">{t('install.topTitle')}</h2>
            <span className={`shrink-0 text-[10px] font-semibold uppercase ${latin ? 'tracking-[0.18em]' : ''}`} style={{ color: C.gold }}>TH · ID · MY</span>
          </div>
          <div className="space-y-3">
            {COUNTRIES.map((cc, i) => {
              const m = market?.countries.find((x) => x.country === cc);
              return <TopPick key={cc} index={i} country={cc} period={m?.period ?? null} top={m?.rows[0]} loading={!market} latin={latin} />;
            })}
          </div>
          <p className="mt-3 text-center text-[10.5px] leading-snug" style={{ color: '#8F889C' }}>{t('market.info')}</p>
        </section>

        {/* 3 · install */}
        <section className="mt-auto pt-8" aria-labelledby="inst-h">
          <h2 id="inst-h" className="mb-2.5 text-center text-[12px] font-medium" style={{ color: C.muted }}>{t('install.installTitle')}</h2>
          {installed ? (
            <p className="mb-3 text-center text-sm" style={{ color: C.gold }}>✓ {t('install.installed')}</p>
          ) : (
            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <StoreButton onClick={installAndroid} label="Android" sub="Chrome"
                icon={<svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="#3DDC84" aria-hidden><path d={ANDROID} /></svg>} />
              <StoreButton onClick={() => setGuide('ios')} label="iOS" sub="Safari"
                icon={<svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="#FFFFFF" aria-hidden><path d={APPLE} /></svg>} />
            </div>
          )}
          <button type="button" onClick={continueWeb}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-semibold transition active:scale-[0.99]"
            style={{ background: 'linear-gradient(135deg, #F2CA50, #D4AF37)', color: '#3C2F00', boxShadow: '0 10px 40px rgba(242,202,80,0.25)' }}>
            {t('install.go')} <span aria-hidden>→</span>
          </button>
        </section>
      </div>

      {guide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setGuide(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl" style={{ background: '#15131F', color: C.ink }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1 rounded-full border p-1" style={{ borderColor: C.line, background: C.paper }}>
                {(['ios', 'android'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGuide(g)} className="rounded-full px-3 py-1 text-xs"
                    style={guide === g ? { background: C.gold, color: '#3C2F00' } : { color: C.muted }}>{g === 'ios' ? 'iPhone' : 'Android'}</button>
                ))}
              </div>
              <button type="button" onClick={() => setGuide(null)} aria-label={t('install.close')} className="px-2 text-lg" style={{ color: C.muted }}>✕</button>
            </div>
            <h3 className="mb-3 font-serif text-xl">{t(guide === 'ios' ? 'install.iosTitle' : 'install.androidTitle')}</h3>
            <ol className="space-y-2">
              {(guide === 'ios' ? ['install.ios1', 'install.ios2', 'install.ios3'] : ['install.and1', 'install.and2', 'install.and3']).map((k, i) => (
                <li key={k} className="flex gap-3 rounded-2xl border p-3" style={{ background: C.paper, borderColor: C.line }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-sm" style={{ background: C.gold, color: '#3C2F00' }}>{i + 1}</span>
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

/** One country: flag, name and month, a two-column "top brand | model / style" row and one sentence on why it sells. */
function TopPick({ index, country, period, top, loading, latin }: { index: number; country: Country; period: string | null; top: TrendRow | undefined; loading: boolean; latin: boolean }) {
  const { t, locale } = useI18n();
  const label = `text-[10px] font-semibold uppercase ${latin ? 'tracking-[0.14em]' : ''}`;
  return (
    <article className="hz-rise-in rounded-2xl border px-4 pb-3.5 pt-3 backdrop-blur-md" style={{ animationDelay: `${index * 120}ms`, background: 'linear-gradient(165deg, rgba(242,202,80,0.10), rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.03))', borderColor: C.line, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="text-[20px] leading-none" aria-hidden>{FLAG[country]}</span>
          <span className={`text-[13px] font-semibold uppercase ${latin ? 'tracking-[0.12em]' : ''}`}>{t(`market.country.${country}`)}</span>
        </span>
        <span className="text-[11px]" style={{ color: C.muted }}>{period ? monthLabel(period, locale) : ''}</span>
      </header>

      <div className="mt-2.5 grid grid-cols-[1fr_1.15fr] border-t" style={{ borderColor: C.line }}>
        <div className="py-2 pr-3">
          <div className={label} style={{ color: C.gold }}>{t('market.topBrand')}</div>
          {loading ? <div className="mt-1.5 h-5 w-20 animate-pulse rounded bg-white/10" />
            : <div className="mt-0.5 truncate font-serif text-[21px] font-semibold leading-tight">{top?.brand ?? '—'}</div>}
        </div>
        <div className="border-l py-2 pl-3" style={{ borderColor: C.line }}>
          <div className={label} style={{ color: C.gold }}>{t('market.modelStyle')}</div>
          {loading ? <div className="mt-1.5 h-5 w-24 animate-pulse rounded bg-white/10" />
            : <div className="mt-1 text-[15px] font-medium leading-snug">{top?.model ?? '—'}</div>}
        </div>
      </div>

      {!loading && (top ? (
        top.note && <p className="mt-1 line-clamp-2 border-l-2 pl-2.5 text-[13px] leading-snug" style={{ borderColor: C.gold, color: '#ECE8F2' }}>{top.note}</p>
      ) : (
        <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{t('noData')}</p>
      ))}
    </article>
  );
}

function StoreButton({ onClick, label, sub, icon }: { onClick: () => void; label: string; sub: string; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2.5 rounded-xl border py-2.5 transition active:scale-[0.98]"
      style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(242,202,80,0.35)', color: C.ink }}>
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[10px]" style={{ color: C.muted }}>{sub}</span>
        <span className="block text-[14px] font-semibold">{label}</span>
      </span>
    </button>
  );
}

/**
 * Live galaxy background: drifting violet / blue / gold nebula clouds, three layers of stars that twinkle and
 * slowly drift (parallax), shooting stars every few seconds, a breathing gold glow behind the logo and gold
 * sparkles rising. Pure CSS, fixed behind the scrolling page; all motion stops for users who prefer reduced motion.
 * Also defines the keyframes used by the country cards (hz-spin, hz-pulse, hz-rise-in).
 */
function Galaxy() {
  const stars = (n: number, size: number, seed: number) => {
    let x = seed;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => {
      const warm = r() < 0.18; // a few gold-tinted stars
      return `radial-gradient(${size}px ${size}px at ${Math.round(r() * 1000) / 10}% ${Math.round(r() * 1000) / 10}%, ${warm ? `rgba(255,226,150,${(0.6 + r() * 0.4).toFixed(2)})` : `rgba(255,255,255,${(0.45 + r() * 0.55).toFixed(2)})`}, transparent)`;
    }).join(',');
  };
  // nebula clouds: colour, size, left, top, animation
  const clouds: [string, string, string, string, string][] = [
    ['rgba(242,202,80,0.20)', '80vmin', 'calc(50% - 40vmin)', '0%', 'hz-glow 9s ease-in-out infinite alternate'],
    ['rgba(108,64,170,0.30)', '95vmin', '-35vmin', '28%', 'hz-drift 38s ease-in-out infinite alternate'],
    ['rgba(30,64,160,0.28)', '90vmin', '45%', '55%', 'hz-drift 46s ease-in-out -12s infinite alternate-reverse'],
    ['rgba(190,70,120,0.16)', '70vmin', '55%', '8%', 'hz-drift 52s ease-in-out -20s infinite alternate'],
  ];
  // star layers: count, size, seed, drift seconds (slower = farther), twinkle
  const layers: [number, number, number, number, string][] = [
    [110, 1, 7, 240, 'hz-twinkle 5s ease-in-out infinite'],
    [45, 1.6, 13, 160, 'hz-twinkle 7s ease-in-out -2s infinite reverse'],
    [16, 2.4, 29, 100, 'hz-twinkle 4s ease-in-out -1s infinite'],
  ];
  // shooting stars: top, left, cycle seconds, delay seconds
  const meteors: [string, string, number, number][] = [['8%', '70%', 9, 1.5], ['22%', '95%', 13, 6], ['40%', '60%', 17, 11]];
  const sparkles: [string, string, number, number][] = [['12%', '22px', 26, 0], ['78%', '16px', 22, 4], ['64%', '18px', 30, 14], ['88%', '12px', 24, 2], ['35%', '14px', 28, 9]];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" style={{ background: 'radial-gradient(130% 90% at 50% 0%, #120c22 0%, #06050c 45%, #000 100%)' }}>
      <style>{`
        @keyframes hz-glow { from { opacity: .55; transform: scale(.95) } to { opacity: 1; transform: scale(1.05) } }
        @keyframes hz-drift { from { transform: translate(0,0) scale(1) } to { transform: translate(12vmin,-8vmin) scale(1.15) } }
        @keyframes hz-twinkle { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes hz-stars { from { transform: translateY(0) } to { transform: translateY(-100vh) } }
        @keyframes hz-meteor { 0% { transform: translate(0,0) rotate(-35deg); opacity: 0 } 2% { opacity: 1 } 9% { transform: translate(-60vmin,42vmin) rotate(-35deg); opacity: 0 } 100% { opacity: 0 } }
        @keyframes hz-rise { 0% { transform: translateY(0) rotate(0deg); opacity: 0 } 10% { opacity: .55 } 90% { opacity: .55 } 100% { transform: translateY(-110vh) rotate(180deg); opacity: 0 } }
        @keyframes hz-spin { to { transform: rotate(360deg) } }
        @keyframes hz-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
        @keyframes hz-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .hz-rise-in { animation: hz-in .7s cubic-bezier(.2,.7,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .hz-anim, .hz-rise-in { animation: none !important } }
      `}</style>
      {clouds.map(([c, size, left, top, anim], i) => (
        <div key={i} className="hz-anim absolute rounded-full" style={{ width: size, height: size, left, top, background: `radial-gradient(circle, ${c}, transparent 65%)`, filter: 'blur(50px)', animation: anim }} />
      ))}
      {layers.map(([n, size, seed, drift, tw], i) => (
        // 200vh tall, the same star tile twice: moving it up by 100vh loops without a seam
        <div key={i} className="hz-anim absolute inset-x-0 top-0 h-[200vh]" style={{ animation: `hz-stars ${drift}s linear infinite` }}>
          <div className="hz-anim h-full w-full" style={{ backgroundImage: stars(n, size, seed), backgroundSize: '100% 100vh', animation: tw }} />
        </div>
      ))}
      {meteors.map(([top, left, cycle, delay], i) => (
        <span key={i} className="hz-anim absolute h-px w-[22vmin]" style={{ top, left, opacity: 0, background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(242,202,80,0.5) 30%, transparent)', boxShadow: '0 0 8px rgba(255,255,255,0.6)', animation: `hz-meteor ${cycle}s ease-out ${delay}s infinite` }} />
      ))}
      {sparkles.map(([left, size, dur, delay], i) => (
        <span key={i} className="hz-anim absolute bottom-[-40px]" style={{ left, fontSize: size, color: '#f2ca50', textShadow: '0 0 12px rgba(242,202,80,0.6)', animation: `hz-rise ${dur}s linear ${delay}s infinite`, opacity: 0 }}>✦</span>
      ))}
    </div>
  );
}
