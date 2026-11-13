import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page } from '../ui.tsx';
import { COUNTRIES, FLAG, TrendTable, monthLabel, type Country, type TrendRow } from '../Market.tsx';
import { BADGE_ICON, BALE_CHECKS, CREAM_BRANDS, DEALER_ITEMS, EVEN_TON, SOURCE, searchDealer, searchNames, type DealerItem, type Tier } from '../../shared/dealerGuide.ts';

type Tab = 'market' | 'dealer' | 'bale';
const TIER_TONE: Record<Tier, string> = {
  luxury_vintage: 'bg-[#6b4a2b]', korean_original: 'bg-[#8a5a24]', bale_cream: 'bg-[#25594c]', even_ton: 'bg-[#34506e]',
};

interface Trends {
  country: Country; period: string | null; periods: string[]; rows: TrendRow[];
  year: { year: string; months: number; rows: { brand: string; model: string; months: number; best_rank: number; avg_rank: number }[] } | null;
}

/** Trending second-hand brand models: this month's ranking and this year's (built from the months on file), per country. */
export default function TrendsPage() {
  const { t, locale } = useI18n();
  const [sp, setSp] = useSearchParams();
  const country = (COUNTRIES as readonly string[]).includes(sp.get('country') ?? '') ? sp.get('country') as Country : 'TH';
  const period = sp.get('period') ?? '';
  const [d, setD] = useState<Trends | null>(null);
  const tab: Tab = (['market', 'dealer', 'bale'] as const).includes(sp.get('tab') as Tab) ? sp.get('tab') as Tab : 'market';
  const [q, setQ] = useState('');
  const setTab = (k: Tab) => setSp(k === 'market' ? { country } : { tab: k }, { replace: true });

  useEffect(() => {
    let on = true;
    setD(null);
    api.get<Trends>(`/api/market/trends?country=${country}${period ? `&period=${period}` : ''}`)
      .then((r) => on && setD(r))
      .catch(() => on && setD({ country, period: null, periods: [], rows: [], year: null }));
    return () => { on = false; };
  }, [country, period]);

  const pick = (c: Country) => setSp({ country: c });
  const searching = q.trim().length > 0;
  const lc = q.trim().toLowerCase();
  const rowHit = (r: TrendRow) => !searching || `${r.brand} ${r.model} ${r.note ?? ''}`.toLowerCase().includes(lc);

  return (
    <Page title={t('market.title')} subtitle={t('market.sub')}>
      {/* search everything: dealer list, bale lists and this month's ranking */}
      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>🔍</span>
        <input type="search" className="input !pl-9" placeholder={t('dl.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('dl.search')} />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-low p-1" role="tablist">
        {(['market', 'dealer', 'bale'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={!searching && tab === k} onClick={() => { setQ(''); setTab(k); }}
            className={`rounded-xl px-2 py-2 text-[13px] font-semibold ${!searching && tab === k ? 'bg-gold text-charcoal' : 'text-muted'}`}>{t(`dl.tab.${k}`)}</button>
        ))}
      </div>

      {(searching || tab === 'dealer') && <DealerList items={searchDealer(q)} searching={searching} />}
      {(searching || tab === 'bale') && <BaleLists q={q} searching={searching} />}
      {searching && d && d.rows.some(rowHit) && (
        <section className="mb-6"><h2 className="mb-2 text-lg">🔥 {t('market.month')}</h2>
          <TrendTable country={country} period={d.period} rows={d.rows.filter(rowHit)} /></section>
      )}
      {searching && searchDealer(q).length === 0 && searchNames(q, [...CREAM_BRANDS, ...EVEN_TON]).length === 0 && !(d?.rows.some(rowHit)) && (
        <p className="rounded-2xl bg-surface-low px-4 py-6 text-center text-sm text-muted">{t('noData')}</p>
      )}

      {!searching && tab === 'market' && <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {COUNTRIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === country} onClick={() => pick(c)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${c === country ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>
            <span aria-hidden>{FLAG[c]}</span>{t(`market.country.${c}`)}
          </button>
        ))}
      </div>

      {!d && <div className="grid gap-4 md:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-surface-low" /><div className="h-80 animate-pulse rounded-2xl bg-surface-low" /></div>}
      {d && (
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-labelledby="month-h">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="month-h" className="text-lg">🔥 {t('market.month')}</h2>
              {d.periods.length > 1 && (
                <select className="input !w-auto !py-1 text-xs" aria-label={t('market.pickMonth')} value={d.period ?? ''}
                  onChange={(e) => setSp({ country, period: e.target.value })}>
                  {d.periods.map((p) => <option key={p} value={p}>{monthLabel(p, locale)}</option>)}
                </select>
              )}
            </div>
            <TrendTable country={country} period={d.period} rows={d.rows} />
          </section>

          <section aria-labelledby="year-h">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id="year-h" className="text-lg">⭐ {t('market.year')}{d.year ? ` ${d.year.year}` : ''}</h2>
              {d.year && <span className="text-[11px] text-muted">{t('market.yearNote')}: {d.year.months} {t('market.monthsOnFile')}</span>}
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
              {!d.year || d.year.rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">{t('noData')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] text-muted">
                      <th className="px-4 py-2 font-normal">#</th>
                      <th className="py-2 font-normal">{t('market.model')}</th>
                      <th className="py-2 text-right font-normal">{t('market.inMonths')}</th>
                      <th className="px-4 py-2 text-right font-normal">{t('market.best')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.year.rows.map((r, i) => (
                      <tr key={`${r.brand}|${r.model}`} className="border-b border-hairline last:border-b-0">
                        <td className={`px-4 py-2 font-serif text-lg ${i < 3 ? 'text-gold' : 'text-muted'}`}>{i + 1}</td>
                        <td className="py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{r.brand}</div>
                          <div className="leading-snug">{r.model}</div>
                        </td>
                        <td className="py-2 text-right font-mono text-xs">{r.months}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">#{r.best_rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted">{t('market.info')}</p>
      </>}
      <p className="mt-4 text-center text-[11px] text-muted">🔒 {t('dl.zeroPrice')}</p>
    </Page>
  );
}

/** One dealer card per model: coloured band (rank, model, tier, badges), the checkpoints, then the dealer tip. */
function DealerList({ items, searching }: { items: DealerItem[]; searching: boolean }) {
  const { t, locale } = useI18n();
  const L = (x: { en: string; km: string }) => (locale === 'km' ? x.km : x.en);
  if (!items.length) return searching ? null : <p className="text-center text-sm text-muted">{t('noData')}</p>;
  return (
    <section className="mb-6 space-y-3">
      {searching && <h2 className="text-lg">📋 {t('dl.tab.dealer')}</h2>}
      {items.map((it) => (
        <article key={it.rank} className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <header className={`${TIER_TONE[it.tier]} px-4 py-3 text-white`}>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-2xl leading-none text-[#f2ca50]">#{it.rank}</span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{it.brand}</div>
                <h3 className="text-base font-semibold leading-snug">{it.model}</h3>
              </div>
            </div>
            <div className="mt-1 text-[12px] opacity-90">{L(it.era)}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">{t(`dl.tier.${it.tier}`)}</span>
              {it.badges.map((b) => <span key={b} className="rounded-full bg-black/25 px-2 py-0.5 text-[11px]">{BADGE_ICON[b]} {t(`dl.badge.${b}`)}</span>)}
            </div>
          </header>
          <div className="space-y-2 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">{t('dl.checks')}</div>
            <ul className="space-y-1.5">
              {it.checks.map((c, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-surface-low px-3 py-2 text-[13.5px] leading-snug"><span className="text-gold" aria-hidden>›</span><span>{L(c)}</span></li>
              ))}
            </ul>
            <p className="flex gap-2 text-[13.5px] leading-snug"><span aria-hidden>💡</span><span><b>{t('dl.tip')}</b> {L(it.tip)}</span></p>
          </div>
        </article>
      ))}
      <p className="text-[11px] text-muted">{t('market.source')}: {SOURCE}</p>
    </section>
  );
}

/** "អីវ៉ាន់តោន": Korean cream-bale brands (Grade A) and even-ton casual items, with the bale checks. */
function BaleLists({ q, searching }: { q: string; searching: boolean }) {
  const { t, locale } = useI18n();
  const cream = searchNames(q, CREAM_BRANDS), even = searchNames(q, EVEN_TON);
  if (searching && !cream.length && !even.length) return null;
  const block = (title: string, sub: string, tone: string, list: string[]) => list.length > 0 && (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className={`${tone} px-4 py-3 text-white`}><h3 className="text-base font-semibold">{title}</h3><p className="text-[12px] opacity-90">{sub}</p></div>
      <ol className="divide-y divide-hairline">
        {list.map((n, i) => <li key={n} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="w-5 text-center font-serif text-muted">{i + 1}</span>{n}</li>)}
      </ol>
    </div>
  );
  return (
    <section className="mb-6 space-y-3">
      {block(`📦 ${t('dl.cream')}`, t('dl.creamSub'), TIER_TONE.bale_cream, cream)}
      {block(`🔥 ${t('dl.even')}`, t('dl.evenSub'), TIER_TONE.even_ton, even)}
      {!searching && (
        <div className="rounded-2xl border border-hairline bg-surface-card p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold">{t('dl.baleChecks')}</div>
          <ul className="space-y-1.5">{BALE_CHECKS.map((c, i) => <li key={i} className="flex gap-2 text-[13.5px]"><span className="text-gold" aria-hidden>✓</span>{locale === 'km' ? c.km : c.en}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
