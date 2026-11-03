import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Badge, Notice } from './ui.tsx';
import { DateCodeGuide } from './DateCodeAppearance.tsx';
import { dateCodeSegments, type DateCodeRole } from '../shared/datecode.ts';
import { lookupCode, readDateCode, useDateTables } from './datecodeTables.ts';

const ROLE_STYLE: Record<DateCodeRole, string> = {
  factory: 'bg-gold-light text-charcoal border-gold',
  period: 'bg-telemetry-bg text-telemetry border-telemetry',
  year: 'bg-verified-bg text-verified border-verified',
  other: 'bg-surface-high text-muted border-strong',
};

/**
 * Teaching widget: type a date code, see each character coloured by meaning, decoded from the DB tables.
 * Draft tables are shown and labelled as draft; this widget never feeds an inspection outcome.
 */
export default function DateCodeDecoder({ brandId: fixedBrand, bare }: { brandId?: string; bare?: boolean } = {}) {
  const { t, locale } = useI18n();
  const tables = useDateTables();
  const [taxBrands, setTaxBrands] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => { api.get('/api/taxonomy').then((tax) => setTaxBrands(tax.brands)).catch(() => setTaxBrands([])); }, []);
  const brands = useMemo(() => (taxBrands ?? []).filter((b) => tables?.formats.some((f) => f.brandId === b.id) || tables?.lookups.some((l) => l.brand_id === b.id)), [taxBrands, tables]);
  const brandId = fixedBrand ?? (pick || brands[0]?.id || '');
  const decodable = !!tables && (tables.formats.some((f) => f.brandId === brandId) || tables.lookups.some((l) => l.brand_id === brandId));
  const example = tables?.guides.find((g) => g.brand_id === brandId)?.example;
  const windows = useMemo(() => (tables && brandId ? lookupCode(tables, brandId, code) : []), [tables, brandId, code]);

  const result = useMemo(() => {
    if (!tables || !brandId) return null;
    if (!tables.formats.some((f) => f.brandId === brandId)) return windows.length || !code.trim() ? null : [];
    const r = readDateCode(tables, brandId, code);
    return r ? r.candidates.map((c) => ({ c, segs: dateCodeSegments(r.normalized, r.formats.find((f) => f.id === c.formatId)!) })) : null;
  }, [tables, brandId, code, windows]);

  const periodName = (u: string) => (u === 'week' ? t('dc.week') : u === 'month' ? t('dc.month') : t('dc.period'));

  return (
    <div className={bare ? '' : 'card h-full'}>
      {!bare && <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">{t('dc.title')}</h2>
        {!fixedBrand && brands.length > 1 && (
          <select className="input !w-auto !py-1 text-xs" value={brandId} onChange={(e) => setPick(e.target.value)} aria-label={t('dc.brand')}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>}
      {!bare && <p className="mb-3 text-sm text-muted">{t('dc.help')}</p>}
      {tables && fixedBrand && !decodable ? <Notice>{t('dc.noYearCode')}</Notice> : tables && taxBrands && brands.length === 0 ? <Notice>{t('dc.noTables')}</Notice> : (
        <>
          <input className="input font-mono text-lg uppercase tracking-widest" value={code} maxLength={20} placeholder={example ? `${t('dc.eg')} ${example}` : t('dc.placeholder')}
            onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} />
          {result && result.length === 0 && windows.length === 0 && <p className="mt-3 text-sm text-muted">{t('dc.noMatch')}</p>}
          {windows.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="label">{t('dc.windows')}</div>
              {windows.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-3 rounded border-l-4 border-verified bg-surface-low px-3 py-2">
                  <div className="min-w-0 text-sm">{locale === 'km' ? w.label_km : w.label_en}</div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif text-xl">{w.year_from === w.year_to ? w.year_from : `${w.year_from ?? '?'}–${w.year_to ?? '?'}`}</div>
                    {w.status !== 'approved' && <Badge tone="warn">{t('dc.draftShort')}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-4">
            {result?.map(({ c, segs }) => {
              const periodDigits = segs?.filter((s) => s.role === 'period').map((s) => s.text) ?? [];
              const yearDigits = segs?.filter((s) => s.role === 'year').map((s) => s.text) ?? [];
              return (
                <div key={c.formatId} className={c.yearInFormatRange ? '' : 'opacity-60'}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-muted">{c.formatName}</span>
                    {c.formatStatus !== 'approved' && <Badge tone="warn">{t('dc.draft')}</Badge>}
                    {!c.yearInFormatRange && <Badge>{t('dc.outOfRange')}</Badge>}
                    {!c.periodValid && <Badge tone="bad">{c.periodUnit === 'month' ? t('dc.badMonth') : t('dc.badWeek')}</Badge>}
                  </div>
                  {segs && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {segs.map((s, i) => (
                        <span key={i} className={`rounded border px-2.5 py-1.5 font-mono text-2xl font-semibold ${ROLE_STYLE[s.role]}`}>{s.text}</span>
                      ))}
                    </div>
                  )}
                  <dl className="grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded border-l-4 border-gold bg-surface-low px-3 py-2">
                      <dt className="label">{t('dc.factory')} · {c.factory}</dt>
                      <dd className="font-semibold">{c.country ? `${t('dc.madeIn')} ${c.country}` : t('dc.unknownFactory')}</dd>
                    </div>
                    <div className="rounded border-l-4 border-telemetry bg-surface-low px-3 py-2">
                      <dt className="label">{periodName(c.periodUnit)} · {periodDigits.join(' + ')}</dt>
                      <dd className="font-semibold">{c.period}</dd>
                    </div>
                    <div className="rounded border-l-4 border-verified bg-surface-low px-3 py-2">
                      <dt className="label">{t('dc.year')} · {yearDigits.join(' + ')}</dt>
                      <dd className="font-semibold">{c.year}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          {!bare && <p className="mt-4 text-xs text-muted">{t('dc.tip')}</p>}
          {!bare && <div className="mt-3"><DateCodeGuide /></div>}
        </>
      )}
    </div>
  );
}
