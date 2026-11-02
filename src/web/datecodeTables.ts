import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { decodeDateCode, normalizeDateCode } from '../shared/datecode.ts';
import type { DateCodeCandidate, DateCodeFormat, FactoryCode } from '../shared/types.ts';

export interface DateTables { formats: (DateCodeFormat & { brandId: string })[]; factories: (FactoryCode & { brandId: string })[] }

let cache: Promise<DateTables> | null = null;
/** Date-code formats and factory codes from the database, fetched once per page load. */
export function loadDateTables(): Promise<DateTables> {
  cache ??= api.get('/api/datecode').then((d: any) => ({
    formats: (d.formats as any[]).map((f) => ({
      id: f.id, brandId: f.brand_id, name: f.name, startYear: f.start_year, endYear: f.end_year, pattern: f.pattern,
      extraction: JSON.parse(f.extraction_json), status: f.status,
    })),
    factories: (d.factories as any[]).map((f) => ({ brandId: f.brand_id, code: f.code, country: f.country, location: f.location, status: f.status })),
  })).catch((e) => { cache = null; throw e; });
  return cache;
}

export function useDateTables(): DateTables | null {
  const [t, setT] = useState<DateTables | null>(null);
  useEffect(() => { let on = true; loadDateTables().then((x) => on && setT(x)).catch(() => on && setT({ formats: [], factories: [] })); return () => { on = false; }; }, []);
  return t;
}

/**
 * Read a code with one brand's tables. Readings whose year falls inside their own format's period come first,
 * and readings outside it are dropped when an in-range one exists (e.g. SL4107 is not "month 40 of 2017").
 */
export function readDateCode(tables: DateTables, brandId: string, code: string): { normalized: string; candidates: DateCodeCandidate[]; formats: DateTables['formats'] } | null {
  const normalized = normalizeDateCode(code);
  if (normalized.length < 3) return null;
  const formats = tables.formats.filter((f) => f.brandId === brandId);
  if (formats.length === 0) return null;
  const r = decodeDateCode(code, formats, tables.factories.filter((f) => f.brandId === brandId));
  const inRange = r.candidates.filter((c) => c.yearInFormatRange);
  return { normalized: r.normalized, candidates: inRange.length ? inRange : r.candidates, formats };
}
