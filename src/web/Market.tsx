import React from 'react';
import { useI18n } from './i18n.tsx';

/** Second-hand bag market data entered by staff (migrations/0025_market_trends.sql). Information only, never a verdict. */
export const COUNTRIES = ['TH', 'ID', 'MY'] as const;
export type Country = typeof COUNTRIES[number];
export const FLAG: Record<Country, string> = { TH: '🇹🇭', ID: '🇮🇩', MY: '🇲🇾' };

export interface TrendRow {
  id: string; country: Country; period: string; rank: number; brand: string; model: string;
  movement: 'up' | 'down' | 'same' | 'new' | null; price_min: number | null; price_max: number | null;
  currency: string | null; note: string | null; source: string; created_at: string;
}
export interface MarketUpdate { id: string; country: Country | null; title: string; body: string | null; source: string; created_at: string }
export interface Overview { countries: { country: Country; period: string | null; rows: TrendRow[] }[]; updates: MarketUpdate[] }

/** "2026-11" → "November 2026" in the UI language. */
export function monthLabel(period: string | null, locale: string): string {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  try { return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  catch { return period; }
}

export function priceText(r: Pick<TrendRow, 'price_min' | 'price_max' | 'currency'>): string {
  if (r.price_min == null && r.price_max == null) return '—';
  const f = (n: number) => n.toLocaleString('en-US');
  const cur = r.currency ?? '';
  if (r.price_min != null && r.price_max != null && r.price_min !== r.price_max) return `${f(r.price_min)}–${f(r.price_max)} ${cur}`;
  return `${f((r.price_min ?? r.price_max)!)} ${cur}`;
}

const MV: Record<string, [string, string]> = { up: ['▲', 'text-verified'], down: ['▼', 'text-counterfeit'], same: ['■', 'text-muted'], new: ['NEW', 'text-gold'] };
export function Movement({ m, dark }: { m: TrendRow['movement']; dark?: boolean }) {
  const { t } = useI18n();
  if (!m) return null;
  const [sym, cls] = MV[m];
  const color = dark ? (m === 'up' ? 'text-[#7fd49b]' : m === 'down' ? 'text-[#ff8a80]' : m === 'new' ? 'text-[#f2ca50]' : 'text-[#9a93a8]') : cls;
  return <span className={`font-mono text-[10px] font-bold ${color}`} title={t(`market.mv.${m}`)} aria-label={t(`market.mv.${m}`)}>{sym}</span>;
}

/**
 * One country's ranking as a compact "trending" table. `dark` = the black install screen.
 * Empty list → "no data" (nothing is ever made up).
 */
export function TrendTable({ country, period, rows, dark, showSource = true, compact }: {
  country: Country; period: string | null; rows: TrendRow[]; dark?: boolean; showSource?: boolean; compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const box = dark ? 'border-white/10 bg-white/[0.05] backdrop-blur' : 'border-hairline bg-surface-card';
  const sub = dark ? 'text-[#a9a2b6]' : 'text-muted';
  const line = dark ? 'border-white/10' : 'border-hairline';
  const sources = [...new Set(rows.map((r) => r.source))];
  return (
    <div className={`overflow-hidden rounded-2xl border ${box}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-4 py-3 ${line}`}>
        <div className="flex items-center gap-2">
          <span className="text-xl leading-none" aria-hidden>{FLAG[country]}</span>
          <span className={`font-semibold ${dark ? 'text-[#f6ecd0]' : ''}`}>{t(`market.country.${country}`)}</span>
        </div>
        <span className={`text-[11px] ${sub}`}>{period ? monthLabel(period, locale) : ''}</span>
      </div>
      {rows.length === 0 ? (
        <p className={`px-4 py-6 text-center text-sm ${sub}`}>{t('noData')}</p>
      ) : (
        <ol>
          {rows.map((r) => (
            <li key={r.id} className={`flex items-center gap-3 border-b px-4 ${compact ? 'py-2' : 'py-2.5'} last:border-b-0 ${line}`}>
              <span className={`w-6 shrink-0 text-center font-serif text-lg leading-none ${r.rank <= 3 ? (dark ? 'text-[#f2ca50]' : 'text-gold') : sub}`}>{r.rank}</span>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{r.brand}</div>
                <div className={`truncate text-sm leading-snug ${dark ? 'text-[#ece8f2]' : ''}`}>{r.model}</div>
                {!compact && r.note && <div className={`truncate text-[11px] ${sub}`}>{r.note}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className={`font-mono text-[11px] ${dark ? 'text-[#cfc6dc]' : 'text-charcoal'}`}>{priceText(r)}</div>
                <Movement m={r.movement} dark={dark} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {showSource && sources.length > 0 && (
        <div className={`border-t px-4 py-2 text-[10px] ${line} ${sub}`}>{t('market.source')}: {sources.join(' · ')}</div>
      )}
    </div>
  );
}

// a soft glow in each country's flag colours, top-right of its card
const ACCENT: Record<Country, string> = {
  TH: 'radial-gradient(120% 80% at 100% 0%, rgba(165,25,49,0.32), rgba(45,42,74,0.22) 40%, transparent 70%)',
  ID: 'radial-gradient(120% 80% at 100% 0%, rgba(206,17,38,0.32), rgba(255,255,255,0.06) 40%, transparent 70%)',
  MY: 'radial-gradient(120% 80% at 100% 0%, rgba(1,0,102,0.45), rgba(255,204,0,0.12) 40%, transparent 70%)',
};

/**
 * Install screen spotlight: ONE card for ONE country — its #1 brand/model this month, price, movement and
 * why it sells (the note staff entered with the ranking). Glass card with a slowly turning gold edge.
 * No row for that country yet → "no data".
 */
export function CountrySpotlight({ country, period, top, loading, index = 0 }: {
  country: Country; period: string | null; top: TrendRow | undefined; loading?: boolean; index?: number;
}) {
  const { t, locale } = useI18n();
  return (
    <article className="hz-rise-in relative overflow-hidden rounded-[26px] p-px" style={{ animationDelay: `${index * 120}ms` }}>
      {/* turning gold edge */}
      <div aria-hidden className="hz-anim absolute -inset-[60%]" style={{ background: 'conic-gradient(from 0deg, transparent 0 55%, rgba(242,202,80,0.9) 70%, transparent 85%)', animation: 'hz-spin 7s linear infinite' }} />
      <div className="relative rounded-[25px] p-5 text-left" style={{ background: 'linear-gradient(170deg, rgba(22,19,30,0.92), rgba(8,7,12,0.94))', backdropFilter: 'blur(14px)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[25px]" style={{ background: ACCENT[country] }} />
        <div className="relative">
          <header className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2.5">
              <span className="text-[26px] leading-none drop-shadow" aria-hidden>{FLAG[country]}</span>
              <span className="text-[15px] font-semibold text-[#f6ecd0]">{t(`market.country.${country}`)}</span>
            </span>
            {top && (
              <span className="hz-anim flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase text-white"
                style={{ background: 'linear-gradient(135deg,#ff7a3c,#ff3c5a)', boxShadow: '0 0 18px rgba(255,90,60,0.55)', animation: 'hz-pulse 2.4s ease-in-out infinite' }}>🔥 #1 Hot</span>
            )}
          </header>

          {loading ? <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white/5" /> : !top ? (
            <p className="py-10 text-center text-sm text-[#a9a2b6]">{t('noData')}</p>
          ) : (
            <>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-[#f2ca50]">{top.brand}</div>
              <h3 className="mt-1 font-serif text-[28px] leading-[1.1] text-[#fbf3dc]" style={{ textShadow: '0 0 22px rgba(242,202,80,0.25)' }}>{top.model}</h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(top.price_min != null || top.price_max != null) && (
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 font-mono text-[11px] text-[#ece8f2]">{priceText(top)}</span>
                )}
                {top.movement && (
                  <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-[#cfc6dc]">
                    <Movement m={top.movement} dark /> {t(`market.mv.${top.movement}`)}
                  </span>
                )}
                {period && <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] text-[#cfc6dc]">{monthLabel(period, locale)}</span>}
              </div>

              <div className="my-4 h-px" style={{ background: 'linear-gradient(90deg, rgba(242,202,80,0.5), transparent)' }} />
              <div className="text-[12px] font-semibold text-[#f2ca50]">💡 {t('market.why')}</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#ece8f2]">{top.note || <span className="text-[#a9a2b6]">{t('market.noReason')}</span>}</p>
              <div className="mt-4 text-[10px] text-[#8f889c]">{t('market.source')}: {top.source}</div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
