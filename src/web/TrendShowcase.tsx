import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { ADMIN_ROLES } from './studio.ts';
import { COUNTRIES, Movement, modelImageUrl, monthLabel, priceText, type Country, type Overview, type TrendRow } from './Market.tsx';

/** A model photo on a soft gold glow (cut-out photos float on it); a plain bag outline when there is no photo (never a letter). */
function Shot({ r, size }: { r: TrendRow; size: 'lg' | 'sm' }) {
  const url = modelImageUrl(r);
  const box = size === 'lg' ? 'h-[88px] w-[88px] rounded-2xl' : 'h-9 w-9 rounded-lg';
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden ${box}`}
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(212,175,95,0.35), rgba(212,175,95,0.06) 60%, transparent 75%), rgb(var(--c-surface-canvas))' }}>
      {url ? <img src={url} alt="" loading="lazy" className={`h-full w-full ${r.image_cutout ? 'object-contain p-1.5 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]' : 'object-cover'}`} />
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className={`text-gold/70 ${size === 'lg' ? 'h-12 w-12' : 'h-5 w-5'}`} aria-hidden><path d="M5 9h14l1 11H4z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></svg>}
    </span>
  );
}

/** Short tags from real data only: top-3 rank this month and the staff-entered movement. No made-up percentages. */
function Tags({ r }: { r: TrendRow }) {
  const { t } = useI18n();
  const tags: string[] = [];
  if (r.rank <= 3) tags.push(`🔥 ${t('tr.tagTop')}`);
  if (r.movement === 'up') tags.push(`📈 ${t('tr.tagUp')}`);
  if (r.movement === 'new') tags.push(`✨ ${t('tr.tagNew')}`);
  if (!tags.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1">{tags.map((x) => <span key={x} className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] leading-4 text-gold">{x}</span>)}</div>;
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
  const me = useContext(MeContext);
  const admin = !!me && ADMIN_ROLES.includes(me.role);
  // nothing entered for any country: hide the block for vendors; show admins how to fill it
  const empty = !!market && market.countries.every((x) => !x.rows.length);
  if (empty && !admin) return null;
  if (empty) {
    return (
      <Link to="/admin?tab=market" className="flex items-center gap-3 rounded-2xl border border-dashed border-gold/50 bg-surface-card p-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-xl" aria-hidden>🔥</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('tr.add')}</span>
          <span className="block text-xs text-muted">{t('tr.emptyAdmin')}</span>
        </span>
        <span className="text-gold" aria-hidden>›</span>
      </Link>
    );
  }

  return (
    <section aria-labelledby="trend-h" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="trend-h" className="text-lg leading-tight"><span aria-hidden className="mr-0.5 drop-shadow-[0_0_10px_rgba(255,140,40,0.8)]">🔥</span> {t('install.topTitle')}
          <span className="ml-1.5 font-sans text-[11px] font-normal text-muted">{m?.period ? monthLabel(m.period, locale) : ''}</span></h2>
        <Link to={`/trends?country=${cc}`} className="shrink-0 text-[11px] font-semibold text-gold">{t('market.seeAll')} →</Link>
      </div>
      <div className="overflow-hidden rounded-3xl border border-gold/35 bg-gradient-to-b from-surface-card to-surface shadow-[0_14px_44px_-20px_rgba(242,202,80,0.45)]">
        <div className="grid grid-cols-3 gap-1.5 border-b border-hairline p-1.5 text-xs" role="tablist">
          {COUNTRIES.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={cc === k} onClick={() => setCc(k)}
              className={`rounded-full px-2 py-1.5 transition ${cc === k ? 'bg-gradient-to-b from-[#E8CA82] to-[#C29846] font-semibold text-charcoal shadow-[0_6px_16px_-8px_rgba(242,202,80,0.9)]' : 'text-muted'}`}>{t(`market.country.${k}`)}</button>
          ))}
        </div>
        {!market && <div className="h-40 animate-pulse" />}
        {market && !first && <p className="p-4 text-sm text-muted">{t('noData')}</p>}
        {first && (
          <Link to={`/trends?country=${cc}`} className="flex items-center gap-3.5 px-3.5 py-3.5" style={{ background: 'linear-gradient(110deg, rgba(242,202,80,0.18), rgba(242,202,80,0.04) 55%, transparent)' }}>
            <Shot r={first} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted">
                <span className="rounded-full bg-gradient-to-b from-[#F2D58A] to-[#C29846] px-2 font-mono text-[10px] font-bold leading-4 text-charcoal shadow-[0_0_12px_rgba(242,202,80,0.7)]">★ #1</span>
                <span className="truncate">{first.brand}</span><Movement m={first.movement} />
              </div>
              <div className="truncate font-serif text-[22px] leading-tight">{first.model}</div>
              <div className="text-xs font-semibold text-gold">{priceText(first)}</div>
              <Tags r={first} />
            </div>
          </Link>
        )}
        {rest.length > 0 && (
          <ol className="divide-y divide-hairline border-t border-hairline">
            {rest.slice(0, 4).map((r, i) => (
              <li key={r.id} className="hz-rise-in" style={{ animationDelay: `${120 + i * 70}ms` }}>
                <Link to={`/trends?country=${cc}`} className="flex items-center gap-2.5 px-3.5 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gold/45 font-serif text-[13px] leading-none text-gold">{r.rank}</span>
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
