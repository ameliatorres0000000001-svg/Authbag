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

/**
 * "Best sellers this month" spotlight: one card per country with its #1 model, the reason it sells
 * (the note staff entered with the ranking) and #2–#3 underneath. Empty month → "no data".
 */
export function HotPicks({ countries, dark }: { countries: Overview['countries'] | null; dark?: boolean }) {
  const { t, locale } = useI18n();
  const card = dark ? 'border-[rgba(242,202,80,0.28)] bg-[linear-gradient(160deg,rgba(242,202,80,0.14),rgba(255,255,255,0.04)_45%,rgba(255,255,255,0.03))]' : 'border-hairline bg-surface-card';
  const sub = dark ? 'text-[#a9a2b6]' : 'text-muted';
  const strong = dark ? 'text-[#f6ecd0]' : 'text-charcoal';
  const gold = dark ? 'text-[#f2ca50]' : 'text-gold';
  const line = dark ? 'border-white/10' : 'border-hairline';
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {COUNTRIES.map((cc) => {
        const m = countries?.find((x) => x.country === cc);
        const [top, ...rest] = m?.rows ?? [];
        return (
          <article key={cc} className={`relative flex w-[85%] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border p-4 text-left sm:w-[70%] lg:w-auto ${card}`}>
            {!countries ? <div className="h-48 animate-pulse rounded-xl bg-white/5" /> : (
              <>
                <header className="flex items-center justify-between gap-2">
                  <span className={`flex items-center gap-2 text-sm font-semibold ${strong}`}><span className="text-lg leading-none" aria-hidden>{FLAG[cc]}</span>{t(`market.country.${cc}`)}</span>
                  <span className={`text-[11px] ${sub}`}>{m?.period ? monthLabel(m.period, locale) : ''}</span>
                </header>
                {!top ? <p className={`py-10 text-center text-sm ${sub}`}>{t('noData')}</p> : (
                  <>
                    <div className="mt-3 flex items-start gap-3">
                      <span className={`font-serif text-4xl leading-none ${gold}`}>#1</span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{top.brand}</div>
                        <div className={`text-lg font-semibold leading-snug ${strong}`}>{top.model}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className={`font-mono text-[11px] ${dark ? 'text-[#cfc6dc]' : 'text-charcoal'}`}>{priceText(top)}</span>
                          <Movement m={top.movement} dark={dark} />
                        </div>
                      </div>
                      <span className="rounded-full bg-[#ff5a3c] px-2 py-0.5 text-[10px] font-bold uppercase text-white">🔥 Hot</span>
                    </div>
                    <div className={`mt-3 rounded-xl p-3 ${dark ? 'bg-black/30' : 'bg-surface-low'}`}>
                      <div className={`text-[11px] font-semibold ${gold}`}>💡 {t('market.why')}</div>
                      <p className={`mt-1 text-[13px] leading-snug ${dark ? 'text-[#ece8f2]' : ''}`}>{top.note || <span className={sub}>{t('market.noReason')}</span>}</p>
                    </div>
                    {rest.length > 0 && (
                      <ol className={`mt-3 border-t pt-2 ${line}`}>
                        {rest.slice(0, 2).map((r) => (
                          <li key={r.id} className="flex items-center gap-2 py-1">
                            <span className={`w-6 font-serif ${gold}`}>#{r.rank}</span>
                            <span className={`min-w-0 flex-1 truncate text-[13px] ${strong}`}><span className={sub}>{r.brand}</span> · {r.model}</span>
                            <Movement m={r.movement} dark={dark} />
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className={`mt-auto pt-2 text-[10px] ${sub}`}>{t('market.source')}: {top.source}</div>
                  </>
                )}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
