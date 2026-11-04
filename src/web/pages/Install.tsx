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

/** Simple install screen on a galaxy background: native prompt where the browser offers one, otherwise iPhone / Android steps. */
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
    <div className="relative min-h-[100dvh] overflow-hidden" style={{ background: '#05040c', color: C.text }}>
      <Galaxy />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col px-6 pb-8 pt-4">
        <div className="flex justify-end"><LangPicker dark /></div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <img src="/icons/icon-192.png" alt="" width={104} height={104} className="rounded-[24px]"
            style={{ boxShadow: '0 0 0 1px rgba(242,202,80,0.35), 0 0 70px rgba(242,202,80,0.35)' }} />
          <div className="mt-8 font-mono text-[11px] uppercase tracking-[0.35em]" style={{ color: C.gold }}>HENGZ AUTHENTIC</div>
          <h1 className="mt-3 font-serif text-[30px] leading-tight">{t('install.title')}</h1>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed" style={{ color: C.soft }}>{t('install.body')}</p>
        </div>

        <div className="space-y-3">
          {installed ? (
            <p className="rounded-2xl px-4 py-3 text-center text-sm backdrop-blur" style={{ background: 'rgba(255,255,255,0.06)', color: C.gold }}>✓ {t('install.installed')}</p>
          ) : (
            <button type="button" onClick={install} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-[#3c2f00] ${track}`}
              style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.gold2})`, boxShadow: '0 10px 40px rgba(242,202,80,0.25)' }}>
              <Icon d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /> {t('install.cta')}
            </button>
          )}
          <button type="button" onClick={continueWeb} className="w-full py-2 text-sm" style={{ color: C.soft }}>
            {t('install.continue')} →
          </button>
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

/** Deep-space background: nebula glows and three layers of slowly twinkling stars (pure CSS, no images). */
function Galaxy() {
  const stars = (n: number, size: number, seed: number) => {
    let x = seed;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => `radial-gradient(${size}px ${size}px at ${Math.round(r() * 1000) / 10}% ${Math.round(r() * 1000) / 10}%, rgba(255,255,255,${(0.5 + r() * 0.5).toFixed(2)}), transparent)`).join(',');
  };
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <style>{`
        @keyframes hz-twinkle { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes hz-drift { from { transform: translateY(0) } to { transform: translateY(-40px) } }
        @media (prefers-reduced-motion: reduce) { .hz-anim { animation: none !important } }
      `}</style>
      <div className="absolute inset-0" style={{ background:
        'radial-gradient(60% 40% at 20% 15%, rgba(110,72,200,0.38), transparent 70%),' +
        'radial-gradient(50% 35% at 85% 30%, rgba(40,90,190,0.32), transparent 70%),' +
        'radial-gradient(40% 30% at 70% 70%, rgba(180,60,140,0.20), transparent 70%),' +
        'radial-gradient(70% 45% at 50% 100%, rgba(242,202,80,0.16), transparent 70%)' }} />
      <div className="hz-anim absolute inset-0" style={{ backgroundImage: stars(80, 1, 7), animation: 'hz-twinkle 5s ease-in-out infinite' }} />
      <div className="hz-anim absolute inset-x-0 -bottom-10 top-0" style={{ backgroundImage: stars(36, 2, 13), animation: 'hz-drift 40s linear infinite alternate, hz-twinkle 7s ease-in-out infinite' }} />
      <div className="hz-anim absolute inset-0" style={{ backgroundImage: stars(10, 3, 29), animation: 'hz-twinkle 9s ease-in-out infinite' }} />
    </div>
  );
}
