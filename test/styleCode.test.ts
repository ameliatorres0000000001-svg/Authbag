import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStyleCode, normalizeStyleCode } from '../src/shared/styleCode.ts';

test('MCM article code splits into its parts', () => {
  const p = parseStyleCode('mcm', 'MWT4SED09PF001')!;
  assert.deepEqual(Object.fromEntries(p.map((x) => [x.field, x.code])), {
    brand: 'M', gender: 'W', category: 'T', year: '4', season: 'S', collection: 'ED', model: '09', colour: 'PF', size: '001',
  });
  assert.equal(parseStyleCode('mcm', 'mmk aave07 bk001')!.find((x) => x.field === 'year')!.code, 'A');
  assert.equal(parseStyleCode('mcm', 'MMKFAVE09K8001')!.find((x) => x.field === 'colour')!.code, 'K8');
});

test('codes that do not fit, or brands without a scheme, give null', () => {
  assert.equal(parseStyleCode('mcm', 'M1234'), null);
  assert.equal(parseStyleCode('mcm', 'MWT4XED09PF001'), null); // season must be S or A
  assert.equal(parseStyleCode('gucci', '449413 498879'), null);
  assert.equal(normalizeStyleCode(' mwt-4sed 09.pf001 '), 'MWT4SED09PF001');
});
