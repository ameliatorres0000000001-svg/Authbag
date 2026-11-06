import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page } from '../ui.tsx';
import { COUNTRIES, FLAG, TrendTable, monthLabel, type Country, type TrendRow } from '../Market.tsx';

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

  useEffect(() => {
    let on = true;
    setD(null);
    api.get<Trends>(`/api/market/trends?country=${country}${period ? `&period=${period}` : ''}`)
      .then((r) => on && setD(r))
      .catch(() => on && setD({ country, period: null, periods: [], rows: [], year: null }));
    return () => { on = false; };
  }, [country, period]);

  const pick = (c: Country) => setSp({ country: c });

  return (
    <Page title={t('market.title')} subtitle={t('market.sub')}>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {COUNTRIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === country} onClick={() => pick(c)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${c === country ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>
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
    </Page>
  );
}
