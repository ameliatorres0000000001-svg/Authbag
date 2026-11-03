import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { decodeDateCode, normalizeDateCode } from '../shared/datecode.ts';
import type { DateCodeCandidate, DateCodeFormat, FactoryCode } from '../shared/types.ts';

export interface CodeGuide {
  id: string; brand_id: string; brand: string; sort: number; title_en: string; title_km: string; example: string | null;
  gives_year: 'exact' | 'month_year' | 'week_year' | 'window' | 'none'; where_en: string | null; where_km: string | null;
  body_en: string; body_km: string; sources: string[]; status: 'draft' | 'approved' | 'retired';
}
export interface CodeLookup { id: string; brand_id: string; pattern: string; year_from: number | null; year_to: number | null; label_en: string; label_km: string; notes: string | null; status: string }
export interface DateTables {
  formats: (DateCodeFormat & { brandId: string })[]; factories: (FactoryCode & { brandId: string })[];
  guides: CodeGuide[]; lookups: CodeLookup[];
}

let cache: Promise<DateTables> | null = null;
/** Date-code formats and factory codes from the database, fetched once per page load. */
export function loadDateTables(): Promise<DateTables> {
  cache ??= api.get('/api/datecode').then((d: any) => ({
    formats: (d.formats as any[]).map((f) => ({
      id: f.id, brandId: f.brand_id, name: f.name, startYear: f.start_year, endYear: f.end_year, pattern: f.pattern,
      extraction: JSON.parse(f.extraction_json), status: f.status,
    })),
    factories: (d.factories as any[]).map((f) => ({ brandId: f.brand_id, code: f.code, country: f.country, location: f.location, status: f.status })),
    guides: ((d.guides ?? []) as any[]).map((g) => ({ ...g, sources: safeJson(g.sources_json) })),
    lookups: (d.lookups ?? []) as CodeLookup[],
  })).catch((e) => { cache = null; throw e; });
  return cache;
}

export function useDateTables(): DateTables | null {
  const [t, setT] = useState<DateTables | null>(null);
  useEffect(() => { let on = true; loadDateTables().then((x) => on && setT(x)).catch(() => on && setT({ formats: [], factories: [], guides: [], lookups: [] })); return () => { on = false; }; }, []);
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

function safeJson(v: string): string[] { try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; } }

/** Year-window lookups whose pattern matches the normalized code (e.g. Chanel serial series, Hermès letter). */
export function lookupCode(tables: DateTables, brandId: string, code: string): CodeLookup[] {
  const n = normalizeDateCode(code);
  if (!n) return [];
  return tables.lookups.filter((l) => {
    if (l.brand_id !== brandId) return false;
    try { return new RegExp(l.pattern).test(n); } catch { return false; }
  });
}
