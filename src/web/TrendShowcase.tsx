import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { ADMIN_ROLES } from './studio.ts';
import { COUNTRIES, Movement, modelImageUrl, monthLabel, priceText, type Country, type Overview, type TrendRow } from './Market.tsx';

/** A model photo on a soft gold glow (cut-out photos float on it); a plain bag outline when there is no photo (never a letter). */
function Shot({ r, size }: { r: TrendRow; size: 'lg' | 'sm' | 'fill' }) {
  const url = modelImageUrl(r);
  const box = size === 'fill' ? 'aspect-square w-full rounded-xl' : size === 'lg' ? 'h-[88px] w-[88px] rounded-2xl' : 'h-9 w-9 rounded-lg';
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden ${box}`}
      style={{ background: 'radial-gradient(circle at 50% 40%, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 60%, transparent 75%), rgb(var(--c-surface-canvas))' }}>
      {url ? <img src={url} alt="" loading="lazy" className={`h-full w-full ${r.image_cutout ? 'object-contain p-1.5 drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]' : 'object-cover'}`} />
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" className={`text-gold/70 ${size === 'sm' ? 'h-5 w-5' : 'h-12 w-12'}`} aria-hidden><path d="M5 9h14l1 11H4z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></svg>}
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
  const first = rows[0];
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
      <div className="overflow-hidden rounded-3xl border border-hairline bg-surface-card">
        <div className="grid grid-cols-3 gap-1.5 border-b border-hairline p-1.5 text-xs" role="tablist">
          {COUNTRIES.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={cc === k} onClick={() => setCc(k)}
              className={`rounded-full border border-transparent px-2 py-1.5 transition ${cc === k ? 'border border-gold/50 bg-gold/15 font-semibold text-gold' : 'text-muted'}`}>{t(`market.country.${k}`)}</button>
          ))}
        </div>
        {!market && <div className="h-40 animate-pulse" />}
        {market && !first && <p className="p-4 text-sm text-muted">{t('noData')}</p>}
        {first && (
          /* the top five in one row: swipe left and right (the next card peeks in so it is clear there is more) */
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-px-2.5 p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rows.slice(0, 5).map((r, i) => (
              <Link key={r.id} to={`/trends?country=${cc}`} className="relative w-[46%] shrink-0 snap-start rounded-2xl border border-gold/25 p-2"
                style={{ background: i === 0 ? 'linear-gradient(165deg, rgba(226,190,112,0.16), rgba(226,190,112,0.03) 60%)' : 'rgba(255,255,255,0.03)' }}>
                <div className="relative">
                  <Shot r={r} size="fill" />
                  <span className={`absolute left-1.5 top-1.5 rounded-full px-2 font-mono text-[10px] font-bold leading-5 ${r.rank === 1 ? 'bg-gold text-surface' : 'border border-gold/50 bg-black/55 text-gold'}`}>{r.rank === 1 ? '★ ' : ''}#{r.rank}</span>
                  {r.movement && <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-[11px] leading-5"><Movement m={r.movement} /></span>}
                </div>
                <div className="mt-2 truncate text-[10px] uppercase tracking-wider text-muted">{r.brand}</div>
                <div className="line-clamp-2 min-h-[2.5rem] font-serif text-[15px] leading-tight">{r.model}</div>
                <Tags r={r} />
              </Link>
            ))}
          </div>
        )}
        {/* small shortcut under the models: read a date code */}
        <Link to="/datecode" className="flex items-center gap-2 border-t border-hairline px-3.5 py-2 text-[12px] text-muted transition hover:text-gold">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 12l2 2 4-4M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6z" /></svg>
          <span className="flex-1">{t('home.datecode')}</span><span aria-hidden className="text-gold">→</span>
        </Link>
      </div>
    </section>
  );
}
