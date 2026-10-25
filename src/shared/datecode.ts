import type { DateCodeCandidate, DateCodeFormat, DateCodeResult, FactoryCode } from './types.ts';

export interface DateCodeContext {
  claimedYear?: number | null;
  eraStart?: number | null;
  eraEnd?: number | null;
}

export function normalizeDateCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, '');
}

function twoDigitYear(yy: number, pivot: number): number {
  return yy >= pivot ? 1900 + yy : 2000 + yy;
}

/**
 * Decodes a date code using DATA tables only (no hard-coded brand claims).
 * Draft tables produce candidates for the human to read; only approved format + approved factory => usable.
 */
export function decodeDateCode(
  raw: string,
  formats: DateCodeFormat[],
  factories: FactoryCode[],
  ctx: DateCodeContext = {},
): DateCodeResult {
  const normalized = normalizeDateCode(raw);
  const candidates: DateCodeCandidate[] = [];

  for (const f of formats) {
    if (f.status === 'retired') continue;
    let m: RegExpExecArray | null;
    try { m = new RegExp(f.pattern).exec(normalized); } catch { continue; }
    if (!m) continue;
    const x = f.extraction;
    const factory = m[x.factoryGroup] ?? '';
    const period = Number(`${m[x.periodGroups[0]]}${m[x.periodGroups[1]]}`);
    const yy = Number(`${m[x.yearGroups[0]]}${m[x.yearGroups[1]]}`);
    const year = twoDigitYear(yy, x.yearPivot);
    const fc = factories.find((c) => c.code === factory && c.status !== 'retired') ?? null;
    candidates.push({
      formatId: f.id, formatName: f.name, formatStatus: f.status,
      factory, factoryKnown: fc !== null, factoryStatus: fc?.status ?? null, country: fc?.country ?? null,
      period, periodUnit: x.periodUnit, year,
      yearInFormatRange: (f.startYear == null || year >= f.startYear) && (f.endYear == null || year <= f.endYear),
    });
  }

  const usableCands = candidates.filter(
    (c) => c.formatStatus === 'approved' && c.factoryStatus === 'approved' && c.yearInFormatRange,
  );
  const usable = usableCands.length > 0;

  if (!usable) {
    const why = candidates.length === 0
      ? 'No known date-code format matches this value.'
      : 'Only draft (unapproved) tables or an unknown factory code matched; shown as candidates, not counted.';
    return { raw, normalized, candidates, usable: false, state: 'unknown', reason: why };
  }

  const years = new Set(usableCands.map((c) => c.year));
  const bad: string[] = [];
  for (const y of years) {
    if (ctx.claimedYear != null && y !== ctx.claimedYear) bad.push(`decoded year ${y} ≠ claimed year ${ctx.claimedYear}`);
    if (ctx.eraStart != null && y < ctx.eraStart) bad.push(`decoded year ${y} is before era start ${ctx.eraStart}`);
    if (ctx.eraEnd != null && y > ctx.eraEnd) bad.push(`decoded year ${y} is after era end ${ctx.eraEnd}`);
  }
  if (bad.length === 0) {
    return { raw, normalized, candidates, usable: true, state: 'consistent', reason: 'Decoded with approved tables; year consistent with the claimed year/era.' };
  }
  return { raw, normalized, candidates, usable: true, state: 'inconsistent', reason: [...new Set(bad)].join('; ') };
}
