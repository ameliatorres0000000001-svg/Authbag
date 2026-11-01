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
