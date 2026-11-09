import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n.tsx';
import { Badge } from '../ui.tsx';
import DateCodeDecoder from '../DateCodeDecoder.tsx';
import StyleCodeBox from '../StyleCodeBox.tsx';
import { DateCodeGuide } from '../DateCodeAppearance.tsx';
import { useDateTables, type CodeGuide } from '../datecodeTables.ts';

const GIVES: Record<CodeGuide['gives_year'], { km: string; en: string; tone: 'ok' | 'info' | 'muted' }> = {
  exact: { km: 'ប្រាប់ឆ្នាំ', en: 'Gives the year', tone: 'ok' },
  month_year: { km: 'ប្រាប់ ខែ + ឆ្នាំ', en: 'Month + year', tone: 'ok' },
  week_year: { km: 'ប្រាប់ សប្ដាហ៍ + ឆ្នាំ', en: 'Week + year', tone: 'ok' },
  window: { km: 'ប្រាប់ចន្លោះឆ្នាំ', en: 'Year window', tone: 'info' },
  none: { km: 'មិនប្រាប់ឆ្នាំ', en: 'No year', tone: 'muted' },
};

/** Date codes & serial numbers, brand by brand: type a code to read it, and learn where to find it and what it means. */
export default function DateCodes() {
  const { t, locale } = useI18n();
  const tables = useDateTables();
  const [pick, setPick] = useState('');

  const brands = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sort: number }>();
    tables?.guides.forEach((g) => { if (!m.has(g.brand_id)) m.set(g.brand_id, { id: g.brand_id, name: g.brand, sort: g.sort }); });
    return [...m.values()].sort((a, b) => a.sort - b.sort);
  }, [tables]);
  const brandId = pick || brands[0]?.id || '';
  const guides = tables?.guides.filter((g) => g.brand_id === brandId) ?? [];
  const decodable = !!tables && (tables.formats.some((f) => f.brandId === brandId) || tables.lookups.some((l) => l.brand_id === brandId));
  // article / style codes: brands whose codes name the product rather than a date (MCM, Gucci, Prada, Fendi, Bottega)
  const styleBox = guides.some((g) => g.gives_year === 'none' || g.id === 'cg_mcm') || !decodable;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-8 pt-4">
      <header>
        <h1 className="text-[26px] leading-tight md:text-3xl">{t('dcp.title')}</h1>
        <p className="text-sm text-muted">{t('dcp.help')}</p>
      </header>

      {!tables ? <div className="h-10 animate-pulse rounded-full bg-surface-low" /> : brands.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-strong p-5 text-sm text-muted">{t('noData')}</p>
      ) : (
        <>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {brands.map((b) => (
              <button key={b.id} type="button" onClick={() => setPick(b.id)}
                className={`shrink-0 snap-start rounded-full border px-4 py-1.5 text-sm ${brandId === b.id ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
            ))}
          </div>

          {decodable && (
            <section className="card space-y-3">
              <DateCodeDecoder key={brandId} brandId={brandId} bare />
            </section>
          )}
          {styleBox && <StyleCodeBox key={`s-${brandId}`} brandId={brandId} />}

          {guides.map((g) => {
            const gy = GIVES[g.gives_year];
            return (
              <article key={g.id} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-xl leading-tight">{locale === 'km' ? g.title_km : g.title_en}</h2>
                  <div className="flex gap-1">
                    <Badge tone={gy.tone}>{gy[locale === 'km' ? 'km' : 'en']}</Badge>
                    {g.status !== 'approved' && <Badge tone="warn">{t('dc.draftShort')}</Badge>}
                  </div>
                </div>
                {g.example && (
                  <div>
                    <div className="label">{t('dcp.example')}</div>
                    <div className="inline-block rounded border border-strong bg-surface-low px-3 py-1.5 font-mono text-xl tracking-widest">{g.example}</div>
                  </div>
                )}
                {(g.where_km || g.where_en) && (
                  <div>
                    <div className="label">{t('dcp.where')}</div>
                    <p className="text-sm leading-relaxed">{locale === 'km' ? g.where_km : g.where_en}</p>
                  </div>
                )}
                <div>
                  <div className="label">{t('dcp.howToRead')}</div>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed">{locale === 'km' ? g.body_km : g.body_en}</p>
                </div>
                {g.sources.length > 0 && (
                  <div>
                    <div className="label">{t('dcp.sources')}</div>
                    <ul className="space-y-0.5 text-xs">
                      {g.sources.map((u) => <li key={u} className="truncate"><a className="underline" href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\/(www\.)?/, '')}</a></li>)}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}

          <p className="text-xs text-muted">{t('dcp.disclaimer')}</p>
          <DateCodeGuide />
        </>
      )}
    </div>
  );
}
