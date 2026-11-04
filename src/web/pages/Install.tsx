import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import LangPicker from '../LangPicker.tsx';
import { isIos, isStandalone, markInstallSeen, useInstallPrompt } from '../pwa.ts';

// Dark "Haute Intelligence" palette from design-reference (Stitch: HENGZ PWA installation experience)
const C = { bg: '#131315', card: '#1c1b1d', line: 'rgba(255,255,255,0.08)', text: '#e5e1e4', soft: '#d0c5af', gold: '#f2ca50', gold2: '#d4af37' };

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

/** Install screen: native prompt where the browser offers one, otherwise step-by-step iOS / Android instructions. */
export default function Install() {
  const { t, locale } = useI18n();
  // letter-spacing breaks Khmer and Thai clusters
  const track = locale === 'km' || locale === 'th' ? '' : 'tracking-[0.15em]';
  const nav = useNavigate();
  const { canPrompt, prompt } = useInstallPrompt();
  const [guide, setGuide] = useState<null | 'ios' | 'android'>(null);
  const installed = isStandalone();

  const install = async () => {
    if (canPrompt) { const r = await prompt(); if (r === 'accepted') { markInstallSeen(); return; } }
    setGuide(isIos() ? 'ios' : 'android');
  };
  const continueWeb = () => { markInstallSeen(); nav('/'); };

  const features: [string, string, string][] = [
    ['M13 2 4 14h7l-1 8 9-12h-7z', 'install.f1', 'install.f1s'],
    ['M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8', 'install.f2', 'install.f2s'],
    ['M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8z', 'install.f3', 'install.f3s'],
  ];

  return (
    <div className="min-h-[100dvh]" style={{ background: `radial-gradient(120% 60% at 50% 0%, #2a2414 0%, ${C.bg} 55%)`, color: C.text }}>
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-6 pt-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em]" style={{ background: C.card, color: C.gold }}>● HENGZ PWA</span>
          <LangPicker dark />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <img src="/icons/icon-192.png" alt="" width={112} height={112} className="rounded-[26px]" style={{ boxShadow: '0 0 60px rgba(242,202,80,0.25)' }} />
          <div className="mt-7 font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: C.gold }}>HENGZ AUTHENTIC</div>
          <h1 className="mt-2 font-serif text-[32px] leading-tight">{t('install.tagline')}</h1>
          <div className="mx-auto my-4 h-px w-12" style={{ background: C.gold2 }} />
          <h2 className="font-serif text-2xl" style={{ color: C.gold }}>{t('install.title')}</h2>
          <p className="mt-2 max-w-xs text-[15px] leading-relaxed" style={{ color: C.soft }}>{t('install.body')}</p>

          <div className="mt-7 grid w-full grid-cols-3 gap-2">
            {features.map(([d, a, b]) => (
              <div key={a} className="rounded-xl px-2 py-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <div className="flex justify-center" style={{ color: C.gold }}><Icon d={d} /></div>
                <div className="mt-1.5 text-[12px] font-semibold leading-tight">{t(a)}</div>
                <div className="text-[11px]" style={{ color: C.soft }}>{t(b)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {installed ? (
            <p className="rounded-xl px-4 py-3 text-center text-sm" style={{ background: C.card, color: C.gold }}>✓ {t('install.installed')}</p>
          ) : (
            <button type="button" onClick={install} className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold text-[#3c2f00] ${track}`}
              style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.gold2})` }}>
              <Icon d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /> {t('install.cta')}
            </button>
          )}
          <button type="button" onClick={continueWeb} className={`w-full rounded-xl py-3.5 text-sm ${track}`} style={{ background: C.card, color: C.text }}>
            {t('install.continue')} →
          </button>
          <div className="flex justify-center gap-4 pt-1 text-[11px]" style={{ color: C.soft }}>
            <button type="button" className="underline" onClick={() => setGuide('ios')}>iOS Safari</button>
            <button type="button" className="underline" onClick={() => setGuide('android')}>Android Chrome</button>
          </div>
        </div>
      </div>

      {guide && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setGuide(null)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, color: C.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1 rounded-full p-1" style={{ background: C.bg }}>
                {(['ios', 'android'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setGuide(g)} className="rounded-full px-3 py-1 text-xs"
                    style={guide === g ? { background: C.gold, color: '#3c2f00' } : { color: C.soft }}>{g === 'ios' ? 'iOS Safari' : 'Android Chrome'}</button>
                ))}
              </div>
              <button type="button" onClick={() => setGuide(null)} aria-label={t('install.close')} className="px-2 text-lg" style={{ color: C.soft }}>✕</button>
            </div>
            <h3 className="mb-3 font-serif text-xl">{t(guide === 'ios' ? 'install.iosTitle' : 'install.androidTitle')}</h3>
            <ol className="space-y-2.5">
              {(guide === 'ios' ? ['install.ios1', 'install.ios2', 'install.ios3'] : ['install.and1', 'install.and2', 'install.and3']).map((k, i) => (
                <li key={k} className="flex gap-3 rounded-xl p-3" style={{ background: C.bg }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold" style={{ background: C.gold, color: '#3c2f00' }}>{i + 1}</span>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: C.gold }}>{t('install.step')} 0{i + 1}</div>
                    <div className="text-sm leading-snug">{t(k)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
