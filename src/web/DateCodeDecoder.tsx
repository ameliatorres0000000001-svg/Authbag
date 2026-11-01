import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Badge, Notice } from './ui.tsx';
import { DateCodeGuide } from './DateCodeAppearance.tsx';
import { dateCodeSegments, decodeDateCode, normalizeDateCode, type DateCodeRole } from '../shared/datecode.ts';
import type { DateCodeFormat, FactoryCode } from '../shared/types.ts';

interface Tables { formats: (DateCodeFormat & { brandId: string })[]; factories: (FactoryCode & { brandId: string })[] }

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
export default function DateCodeDecoder() {
  const { t } = useI18n();
  const [tables, setTables] = useState<Tables | null>(null);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandId, setBrandId] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    Promise.all([api.get('/api/datecode'), api.get('/api/taxonomy')]).then(([d, tax]) => {
      const formats = (d.formats as any[]).map((f) => ({
        id: f.id, brandId: f.brand_id, name: f.name, startYear: f.start_year, endYear: f.end_year, pattern: f.pattern,
        extraction: JSON.parse(f.extraction_json), status: f.status,
      }));
      const factories = (d.factories as any[]).map((f) => ({ brandId: f.brand_id, code: f.code, country: f.country, location: f.location, status: f.status }));
      const withTables = (tax.brands as any[]).filter((b) => formats.some((f) => f.brandId === b.id));
      setTables({ formats, factories });
      setBrands(withTables);
      if (withTables[0]) setBrandId(withTables[0].id);
    }).catch(() => setTables({ formats: [], factories: [] }));
  }, []);

  const result = useMemo(() => {
    if (!tables || !brandId || normalizeDateCode(code).length < 3) return null;
    const formats = tables.formats.filter((f) => f.brandId === brandId);
    const factories = tables.factories.filter((f) => f.brandId === brandId);
    const r = decodeDateCode(code, formats, factories);
    // When some format reads the code with a year inside its own period, readings outside their period are noise.
    const inRange = r.candidates.filter((c) => c.yearInFormatRange);
    return (inRange.length ? inRange : r.candidates)
      .map((c) => ({ c, segs: dateCodeSegments(r.normalized, formats.find((f) => f.id === c.formatId)!) }));
  }, [tables, brandId, code]);

  const periodName = (u: string) => (u === 'week' ? t('dc.week') : u === 'month' ? t('dc.month') : t('dc.period'));

  return (
    <div className="card h-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl">{t('dc.title')}</h2>
        {brands.length > 1 && (
          <select className="input !w-auto !py-1 text-xs" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label={t('dc.brand')}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>
      <p className="mb-3 text-sm text-muted">{t('dc.help')}</p>
      {tables && brands.length === 0 ? <Notice>{t('dc.noTables')}</Notice> : (
        <>
          <input className="input font-mono text-lg uppercase tracking-widest" value={code} maxLength={12} placeholder={t('dc.placeholder')}
            onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} />
          {result && result.length === 0 && <p className="mt-3 text-sm text-muted">{t('dc.noMatch')}</p>}
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
          <p className="mt-4 text-xs text-muted">{t('dc.tip')}</p>
          <div className="mt-3"><DateCodeGuide /></div>
        </>
      )}
    </div>
  );
}
