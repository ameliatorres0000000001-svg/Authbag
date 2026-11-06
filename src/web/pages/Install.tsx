import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import LangPicker from '../LangPicker.tsx';
import { isIos, isStandalone, markInstallSeen, useInstallPrompt } from '../pwa.ts';
import { api } from '../api.ts';
import { COUNTRIES, FLAG, monthLabel, type Country, type Overview, type TrendRow } from '../Market.tsx';

// Editorial palette: warm ivory, black type, champagne gold (Haute Verification tokens in tailwind.config.js)
const C = { ivory: '#FAF7F0', paper: '#FFFFFF', ink: '#141414', muted: '#6E6B64', line: '#E7E0D2', gold: '#B8975A', goldSoft: '#EFE6D2' };

// simple platform marks (Android robot head, Apple)
const ANDROID = 'M7.2 4.2 5.9 2a.4.4 0 0 1 .7-.4l1.3 2.2A7.9 7.9 0 0 1 12 3c1.5 0 2.9.3 4.1.8l1.3-2.2a.4.4 0 0 1 .7.4l-1.3 2.2A7.4 7.4 0 0 1 20.6 10H3.4a7.4 7.4 0 0 1 3.8-5.8ZM8.5 7.6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Zm7 0a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8ZM3.4 11.2h17.2V19a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z';
const APPLE = 'M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.8-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9ZM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3Z';

/**
 * Anajak Secondhand install / welcome screen (install only — not a dashboard): logo and tagline, one compact
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
    <div className="min-h-[100dvh]" style={{ background: `linear-gradient(180deg, #FFFDF8 0%, ${C.ivory} 40%, #F5F0E4 100%)`, color: C.ink }}>
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4">
        <div className="flex justify-end"><LangPicker /></div>

        {/* 1 · header */}
        <header className="flex flex-col items-center pt-3 text-center">
          <img src="/icons/icon-192.png" alt="Anajak Secondhand" width={76} height={76} className="rounded-[20px]"
            style={{ boxShadow: '0 12px 30px rgba(20,20,20,0.16), 0 0 0 1px rgba(184,151,90,0.35)' }} />
          <div className="mt-5 text-[12px] font-medium" style={{ color: C.gold }}>{t('install.welcome')}</div>
          <h1 className="mt-1.5 flex flex-col items-center font-serif font-medium leading-none">
            <span className="text-[38px] tracking-[0.14em]">ANAJAK</span>
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
            {COUNTRIES.map((cc) => {
              const m = market?.countries.find((x) => x.country === cc);
              return <TopPick key={cc} country={cc} period={m?.period ?? null} top={m?.rows[0]} loading={!market} latin={latin} />;
            })}
          </div>
          <p className="mt-3 text-center text-[10.5px] leading-snug" style={{ color: '#9A958A' }}>{t('market.info')}</p>
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
                icon={<svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill={C.ink} aria-hidden><path d={APPLE} /></svg>} />
            </div>
          )}
          <button type="button" onClick={continueWeb}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[15px] font-semibold transition active:scale-[0.99]"
            style={{ background: C.ink, color: '#F3E3BC', boxShadow: '0 12px 28px rgba(20,20,20,0.22)' }}>
            {t('install.go')} <span aria-hidden>→</span>
          </button>
        </section>
      </div>

      {guide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setGuide(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl" style={{ background: C.ivory, color: C.ink }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1 rounded-full border p-1" style={{ borderColor: C.line, background: C.paper }}>
                {(['ios', 'android'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGuide(g)} className="rounded-full px-3 py-1 text-xs"
                    style={guide === g ? { background: C.ink, color: '#F3E3BC' } : { color: C.muted }}>{g === 'ios' ? 'iPhone' : 'Android'}</button>
                ))}
              </div>
              <button type="button" onClick={() => setGuide(null)} aria-label={t('install.close')} className="px-2 text-lg" style={{ color: C.muted }}>✕</button>
            </div>
            <h3 className="mb-3 font-serif text-xl">{t(guide === 'ios' ? 'install.iosTitle' : 'install.androidTitle')}</h3>
            <ol className="space-y-2">
              {(guide === 'ios' ? ['install.ios1', 'install.ios2', 'install.ios3'] : ['install.and1', 'install.and2', 'install.and3']).map((k, i) => (
                <li key={k} className="flex gap-3 rounded-2xl border p-3" style={{ background: C.paper, borderColor: C.line }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-sm" style={{ background: C.goldSoft, color: C.ink }}>{i + 1}</span>
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
function TopPick({ country, period, top, loading, latin }: { country: Country; period: string | null; top: TrendRow | undefined; loading: boolean; latin: boolean }) {
  const { t, locale } = useI18n();
  const label = `text-[10px] font-semibold uppercase ${latin ? 'tracking-[0.14em]' : ''}`;
  return (
    <article className="rounded-2xl border px-4 pb-3.5 pt-3" style={{ background: C.paper, borderColor: C.line, boxShadow: '0 1px 2px rgba(20,20,20,0.04)' }}>
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
          {loading ? <div className="mt-1.5 h-5 w-20 animate-pulse rounded bg-[#F1ECE1]" />
            : <div className="mt-0.5 truncate font-serif text-[21px] font-semibold leading-tight">{top?.brand ?? '—'}</div>}
        </div>
        <div className="border-l py-2 pl-3" style={{ borderColor: C.line }}>
          <div className={label} style={{ color: C.gold }}>{t('market.modelStyle')}</div>
          {loading ? <div className="mt-1.5 h-5 w-24 animate-pulse rounded bg-[#F1ECE1]" />
            : <div className="mt-1 text-[15px] font-medium leading-snug">{top?.model ?? '—'}</div>}
        </div>
      </div>

      {!loading && (top ? (
        top.note && <p className="mt-1 line-clamp-2 border-l-2 pl-2.5 text-[13px] leading-snug" style={{ borderColor: C.gold, color: '#4A463E' }}>{top.note}</p>
      ) : (
        <p className="mt-1 text-[12.5px]" style={{ color: C.muted }}>{t('noData')}</p>
      ))}
    </article>
  );
}

function StoreButton({ onClick, label, sub, icon }: { onClick: () => void; label: string; sub: string; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-2.5 rounded-xl border py-2.5 transition active:scale-[0.98]"
      style={{ background: C.paper, borderColor: '#D9CFBC', color: C.ink }}>
      {icon}
      <span className="text-left leading-tight">
        <span className="block text-[10px]" style={{ color: C.muted }}>{sub}</span>
        <span className="block text-[14px] font-semibold">{label}</span>
      </span>
    </button>
  );
}
