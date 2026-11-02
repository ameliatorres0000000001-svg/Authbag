import type { DateCodeCandidate, DateCodeExtraction, DateCodeFormat, DateCodeResult, FactoryCode } from './types.ts';

export interface DateCodeContext {
  claimedYear?: number | null;
  eraStart?: number | null;
  eraEnd?: number | null;
}

export function normalizeDateCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, '');
}

/** A week must be 1–53 and a month 1–12; an unconfirmed unit only rules out 0 and values above 53. */
export function periodIsValid(period: number, unit: DateCodeExtraction['periodUnit']): boolean {
  if (!Number.isInteger(period) || period < 1) return false;
  return period <= (unit === 'month' ? 12 : 53);
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
      periodValid: periodIsValid(period, x.periodUnit),
    });
  }

  const usableCands = candidates.filter(
    (c) => c.formatStatus === 'approved' && c.factoryStatus === 'approved' && c.yearInFormatRange && c.periodValid,
  );
  const usable = usableCands.length > 0;

  if (!usable) {
    const impossible = candidates.some((c) => c.yearInFormatRange && !c.periodValid);
    const why = candidates.length === 0
      ? 'No known date-code format matches this value.'
      : impossible
        ? 'The decoded week/month cannot exist (week 1–53, month 1–12); shown for review, not counted.'
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

export type DateCodeRole = 'factory' | 'period' | 'year' | 'other';
export interface DateCodeSegment { text: string; role: DateCodeRole }

/**
 * Teaching view: split a normalized code into coloured segments (factory letters, period digits, year digits)
 * using the format's own regex groups. Returns null when the format does not match. Pure data, no brand claims.
 */
export function dateCodeSegments(normalized: string, f: Pick<DateCodeFormat, 'pattern' | 'extraction'>): DateCodeSegment[] | null {
  let m: RegExpExecArray | null;
  try { m = new RegExp(f.pattern, 'd').exec(normalized); } catch { return null; }
  if (!m || !m.indices) return null;
  const roles: DateCodeRole[] = Array.from(normalized, () => 'other');
  const paint = (g: number, role: DateCodeRole) => {
    const span = m!.indices![g];
    if (span) for (let i = span[0]; i < span[1]; i++) roles[i] = role;
  };
  const x = f.extraction;
  paint(x.factoryGroup, 'factory');
  x.periodGroups.forEach((g) => paint(g, 'period'));
  x.yearGroups.forEach((g) => paint(g, 'year'));
  const out: DateCodeSegment[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const last = out[out.length - 1];
    if (last && last.role === roles[i] && roles[i] === 'factory') last.text += normalized[i];
    else out.push({ text: normalized[i], role: roles[i] });
  }
  return out;
}
