import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { COUNTRIES, Movement, modelImageUrl, monthLabel, priceText, type Country, type Overview, type TrendRow } from './Market.tsx';

/** A model photo on a soft gold glow (cut-out photos float on it); the brand initial when there is no photo. */
function Shot({ r, size }: { r: TrendRow; size: 'lg' | 'sm' }) {
  const url = modelImageUrl(r);
  const box = size === 'lg' ? 'h-[72px] w-[72px] rounded-xl' : 'h-9 w-9 rounded-lg';
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden ${box}`}
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(212,175,95,0.35), rgba(212,175,95,0.06) 60%, transparent 75%), rgb(var(--c-surface-canvas))' }}>
      {url ? <img src={url} alt="" loading="lazy" className={`h-full w-full ${r.image_cutout ? 'object-contain p-1.5 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]' : 'object-cover'}`} />
        : <span className={`font-serif text-gold ${size === 'lg' ? 'text-3xl' : 'text-base'}`} aria-hidden>{r.brand.slice(0, 1)}</span>}
    </span>
  );
}

/**
 * Home, top: this month's fast-selling models for one country at a time (staff-entered, with source).
 * #1 large with its photo and why it sells, then #2–#5. Empty months say "no data".
 */
export default function TrendShowcase({ market }: { market: Overview | null }) {
  const { t, locale } = useI18n();
  const [cc, setCc] = useState<Country>(locale === 'id' ? 'ID' : 'TH');
  const m = market?.countries.find((x) => x.country === cc);
  const rows = m?.rows ?? [];
  const [first, ...rest] = rows;

  return (
    <section aria-labelledby="trend-h" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="trend-h" className="text-base leading-tight">🔥 {t('install.topTitle')}
          <span className="ml-1.5 font-sans text-[11px] font-normal text-muted">{m?.period ? monthLabel(m.period, locale) : ''}</span></h2>
        <Link to={`/trends?country=${cc}`} className="shrink-0 text-[11px] font-semibold text-gold">{t('market.seeAll')} →</Link>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-b from-surface-card to-surface">
        <div className="grid grid-cols-3 gap-1 border-b border-hairline p-1 text-xs" role="tablist">
          {COUNTRIES.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={cc === k} onClick={() => setCc(k)}
              className={`rounded-lg px-2 py-1 transition ${cc === k ? 'bg-gold font-semibold text-charcoal' : 'text-muted'}`}>{t(`market.country.${k}`)}</button>
          ))}
        </div>
        {!market && <div className="h-40 animate-pulse" />}
        {market && !first && <p className="p-4 text-sm text-muted">{t('noData')}</p>}
        {first && (
          <Link to={`/trends?country=${cc}`} className="flex items-center gap-3 px-3 py-2.5">
            <Shot r={first} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <span className="rounded bg-gold px-1.5 font-mono text-[10px] font-bold leading-4 text-charcoal">#1</span>
                <span className="truncate">{first.brand}</span><Movement m={first.movement} />
              </div>
              <div className="truncate font-serif text-lg leading-tight">{first.model}</div>
              <div className="text-xs font-semibold text-gold">{priceText(first)}</div>
              {first.note && <p className="line-clamp-1 text-[11px] leading-snug text-muted">{first.note}</p>}
            </div>
          </Link>
        )}
        {rest.length > 0 && (
          <ol className="divide-y divide-hairline border-t border-hairline">
            {rest.slice(0, 4).map((r) => (
              <li key={r.id}>
                <Link to={`/trends?country=${cc}`} className="flex items-center gap-2.5 px-3 py-1.5">
                  <span className="w-4 shrink-0 text-center font-serif text-sm text-gold">{r.rank}</span>
                  <Shot r={r} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[13px]"><span className="text-[10px] uppercase tracking-wider text-muted">{r.brand}</span> {r.model}</span>
                  <span className="shrink-0 text-[11px] text-muted">{priceText(r)}</span>
                  <Movement m={r.movement} />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
