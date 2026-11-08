import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { COUNTRIES, Movement, modelImageUrl, monthLabel, priceText, type Country, type Overview, type TrendRow } from './Market.tsx';

/** A model photo on a soft gold glow (cut-out photos float on it); the brand initial when there is no photo. */
function Shot({ r, size }: { r: TrendRow; size: 'lg' | 'sm' }) {
  const url = modelImageUrl(r);
  const box = size === 'lg' ? 'h-32 w-32 rounded-2xl' : 'h-12 w-12 rounded-xl';
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden ${box}`}
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(212,175,95,0.35), rgba(212,175,95,0.06) 60%, transparent 75%), #121215' }}>
      {url ? <img src={url} alt="" loading="lazy" className={`h-full w-full ${r.image_cutout ? 'object-contain p-1.5 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]' : 'object-cover'}`} />
        : <span className={`font-serif text-gold ${size === 'lg' ? 'text-5xl' : 'text-xl'}`} aria-hidden>{r.brand.slice(0, 1)}</span>}
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
    <section aria-labelledby="trend-h" className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{m?.period ? monthLabel(m.period, locale) : t('market.thisMonth')}</div>
          <h2 id="trend-h" className="text-xl leading-tight">🔥 {t('install.topTitle')}</h2>
        </div>
        <Link to={`/trends?country=${cc}`} className="shrink-0 text-xs font-semibold text-gold">{t('market.seeAll')} →</Link>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-full border border-hairline bg-surface-card p-1 text-sm" role="tablist">
        {COUNTRIES.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={cc === k} onClick={() => setCc(k)}
            className={`rounded-full px-2 py-1.5 transition ${cc === k ? 'bg-gold font-semibold text-charcoal' : 'text-muted'}`}>{t(`market.country.${k}`)}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-b from-surface-card to-surface">
        {!market && <div className="h-64 animate-pulse" />}
        {market && !first && <p className="p-5 text-sm text-muted">{t('noData')}</p>}
        {first && (
          <Link to={`/trends?country=${cc}`} className="flex gap-4 p-4">
            <Shot r={first} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-serif text-4xl leading-none text-gold">1</span>
                <Movement m={first.movement} />
              </div>
              <div className="mt-1.5 truncate text-[11px] uppercase tracking-wider text-muted">{first.brand}</div>
              <div className="font-serif text-xl leading-tight">{first.model}</div>
              <div className="mt-1 text-sm font-semibold text-gold">{priceText(first)}</div>
              {first.note && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{first.note}</p>}
            </div>
          </Link>
        )}
        {rest.length > 0 && (
          <ol className="divide-y divide-hairline border-t border-hairline">
            {rest.map((r) => (
              <li key={r.id}>
                <Link to={`/trends?country=${cc}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 shrink-0 text-center font-serif text-lg text-gold">{r.rank}</span>
                  <Shot r={r} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] uppercase tracking-wider text-muted">{r.brand}</span>
                    <span className="block truncate text-sm font-semibold">{r.model}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs">{priceText(r)}</span>
                    <Movement m={r.movement} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        {first?.source && <div className="border-t border-hairline px-4 py-2 text-[10px] text-muted">{t('market.source')}: {first.source}</div>}
      </div>
    </section>
  );
}
