import test from 'node:test';
import assert from 'node:assert/strict';
import { dateCodeSegments, decodeDateCode } from '../src/shared/datecode.ts';
import type { DateCodeFormat, FactoryCode } from '../src/shared/types.ts';

const fmt2007: DateCodeFormat = {
  id: 'f07', name: 'Two-letter factory + 4 digits (2007–2020)', startYear: 2007, endYear: 2020,
  pattern: '^([A-Z]{2})(\\d)(\\d)(\\d)(\\d)$',
  extraction: { factoryGroup: 1, periodGroups: [2, 4], yearGroups: [3, 5], periodUnit: 'week', yearPivot: 100 },
  status: 'draft',
};
const ca: FactoryCode = { code: 'CA', country: 'Spain', location: null, status: 'draft' };

test('CA4109 decodes to Spain, week 40, 2019 — as a draft candidate only', () => {
  const r = decodeDateCode('ca 4109', [fmt2007], [ca]);
  assert.equal(r.candidates.length, 1);
  const c = r.candidates[0];
  assert.equal(c.factory, 'CA'); assert.equal(c.country, 'Spain');
  assert.equal(c.period, 40); assert.equal(c.periodUnit, 'week'); assert.equal(c.year, 2019);
  assert.equal(r.usable, false, 'draft tables are never counted');
});

test('segments colour factory letters, period digits and year digits', () => {
  const s = dateCodeSegments('CA4109', fmt2007)!;
  assert.deepEqual(s, [
    { text: 'CA', role: 'factory' }, { text: '4', role: 'period' }, { text: '1', role: 'year' },
    { text: '0', role: 'period' }, { text: '9', role: 'year' },
  ]);
  assert.equal(dateCodeSegments('XYZ', fmt2007), null);
  assert.equal(dateCodeSegments('CA4109', { ...fmt2007, pattern: '(' }), null);
});

const fmt80s: DateCodeFormat = {
  id: 'f80', name: 'Year + month + factory (late 1980s)', startYear: 1986, endYear: 1989,
  pattern: '^(\\d)(\\d)(\\d)(\\d?)([A-Z]{2})$',
  extraction: { factoryGroup: 5, periodGroups: [3, 4], yearGroups: [1, 2], periodUnit: 'month', yearPivot: 80 },
  status: 'draft',
};
const fmt82: DateCodeFormat = {
  id: 'f82', name: 'Digits only (1982–mid 1980s)', startYear: 1982, endYear: 1986,
  pattern: '^(\\d)(\\d)(\\d)(\\d?)()$',
  extraction: { factoryGroup: 5, periodGroups: [3, 4], yearGroups: [1, 2], periodUnit: 'month', yearPivot: 80 },
  status: 'draft',
};
const sl: FactoryCode = { code: 'SL', country: 'France', location: null, status: 'draft' };
const th: FactoryCode = { code: 'TH', country: 'France', location: null, status: 'draft' };

test('SL4107 decodes to France, week 40, 2017', () => {
  const c = decodeDateCode('SL4107', [fmt2007], [sl]).candidates[0];
  assert.equal(c.country, 'France'); assert.equal(c.period, 40); assert.equal(c.year, 2017); assert.equal(c.periodValid, true);
});

test('impossible weeks and months are flagged and never usable', () => {
  const approved = { ...fmt2007, status: 'approved' as const };
  const r = decodeDateCode('SL6107', [approved], [{ ...sl, status: 'approved' }]); // week 60
  assert.equal(r.candidates[0].period, 60);
  assert.equal(r.candidates[0].periodValid, false);
  assert.equal(r.usable, false);
  assert.match(r.reason, /cannot exist/);
  const ok = decodeDateCode('SL5133', [approved], [{ ...sl, status: 'approved' }]); // week 53 of 2013
  assert.equal(ok.usable, true);
});

test('1980s formats: 8612TH and 833 decode year then month', () => {
  const a = decodeDateCode('8612TH', [fmt80s], [th]).candidates[0];
  assert.deepEqual([a.factory, a.country, a.year, a.period, a.periodValid, a.yearInFormatRange], ['TH', 'France', 1986, 12, true, true]);
  const b = decodeDateCode('833', [fmt82], []).candidates[0];
  assert.deepEqual([b.factory, b.year, b.period, b.periodValid], ['', 1983, 3, true]);
  assert.deepEqual(dateCodeSegments('8612TH', fmt80s)!.map((s) => s.role), ['year', 'year', 'period', 'period', 'factory']);
});

test('PL0241 is week 4 of 2021: outside 2007–2020, read by the 2021 format', () => {
  const f2021: DateCodeFormat = { ...fmt2007, id: 'f21', name: '2021', startYear: 2021, endYear: 2021 };
  const pl: FactoryCode = { code: 'PL', country: 'Italy', location: null, status: 'draft' };
  const r = decodeDateCode('PL0241', [fmt2007, f2021], [pl]);
  const old = r.candidates.find((c) => c.formatId === 'f07')!;
  const now = r.candidates.find((c) => c.formatId === 'f21')!;
  assert.equal(old.yearInFormatRange, false);
  assert.deepEqual([now.country, now.period, now.year, now.yearInFormatRange, now.periodValid], ['Italy', 4, 2021, true, true]);
});
