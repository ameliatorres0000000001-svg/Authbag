import React from 'react';
import { api } from './api.ts';
import { LOCALES, useI18n, type Locale } from './i18n.tsx';

/** KH · EN · VN · TH · ID. The server only stores km/en; other languages are kept in this browser. */
export default function LangPicker({ dark, className = '' }: { dark?: boolean; className?: string }) {
  const { t, locale, setLocale } = useI18n();
  const pick = (l: Locale) => {
    setLocale(l);
    api.put('/api/me/locale', { locale: l === 'km' ? 'km' : 'en' }).catch(() => {});
  };
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t('lang.label')}</span>
      <select value={locale} onChange={(e) => pick(e.target.value as Locale)}
        className={`appearance-none rounded border py-1 pl-2 pr-6 font-mono text-xs font-semibold tracking-wider ${dark ? 'border-white/20 bg-white/5 text-[#e5e1e4]' : 'border-strong bg-surface-card text-charcoal'}`}>
        {LOCALES.map((l) => <option key={l.code} value={l.code} title={l.name}>{l.short}</option>)}
      </select>
      <span className={`pointer-events-none absolute right-1.5 text-[9px] ${dark ? 'text-[#d0c5af]' : 'text-muted'}`} aria-hidden>▼</span>
    </label>
  );
}
