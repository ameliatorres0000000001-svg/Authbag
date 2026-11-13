import test from 'node:test';
import assert from 'node:assert/strict';
import { CREAM_BRANDS, DEALER_ITEMS, EVEN_TON, dealerGuideText, searchDealer, searchNames } from '../src/shared/dealerGuide.ts';

test('search finds by brand, model, code and Khmer; all words must match', () => {
  assert.deepEqual(searchDealer('mcm').map((x) => x.rank), [2, 3, 4]);
  assert.deepEqual(searchDealer('115748').map((x) => x.rank), [1]);
  assert.deepEqual(searchDealer('mcm belt').map((x) => x.rank), [3]);
  assert.ok(searchDealer('ខ្សែក្រវ៉ាត់').some((x) => x.rank === 3));
  assert.equal(searchDealer('').length, DEALER_ITEMS.length);
  assert.equal(searchDealer('hermes kelly').length, 0);
});

test('bale lists search; even ton has the owner items', () => {
  assert.deepEqual(searchNames('uniqlo', EVEN_TON), ['Uniqlo Round Mini Shoulder']);
  assert.deepEqual(searchNames('marithe', CREAM_BRANDS), ['Marithé François Girbaud']);
});

test('zero prices anywhere in the guide', () => {
  assert.doesNotMatch(dealerGuideText(), /\$|฿|USD|THB|KHR|IDR|MYR|price \d/i);
});
