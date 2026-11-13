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
  /** photo of this brand + model (staff upload), cut out of its background by AI when image_cutout = 1 */
  image_id?: string | null; image_cutout?: number | null; image_at?: string | null;
}

/** URL of a model photo; the upload time busts the browser cache when a photo is replaced. */
export const modelImageUrl = (r: Pick<TrendRow, 'image_id' | 'image_at'>) =>
  r.image_id ? `/api/market/images/${r.image_id}?v=${encodeURIComponent(r.image_at ?? '')}` : null;
export interface MarketUpdate { id: string; country: Country | null; title: string; body: string | null; source: string; created_at: string }
export interface Overview { countries: { country: Country; period: string | null; rows: TrendRow[] }[]; updates: MarketUpdate[] }

/** "2026-11" → "November 2026" in the UI language. */
export function monthLabel(period: string | null, locale: string): string {
  if (!period) return '';
  const [y, m] = period.split('-').map(Number);
  try { return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  catch { return period; }
}

/** Owner policy (Nov 2026): zero prices on screen, to protect dealer margins. */
export const SHOW_PRICES = false;
export function priceText(r: Pick<TrendRow, 'price_min' | 'price_max' | 'currency'>): string {
  if (!SHOW_PRICES) return '';
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
                <div className={`font-mono text-[11px] ${dark ? 'text-[#cfc6dc]' : 'text-ink'}`}>{priceText(r)}</div>
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
