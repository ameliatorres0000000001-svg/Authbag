import test from 'node:test';
import assert from 'node:assert/strict';
import { chipFacts, parseUid } from '../src/shared/nfc.ts';

test('parseUid reads colon hex from Web NFC', () => {
  assert.deepEqual(parseUid('04:a2:3b:1c:22:5d:80'), [4, 0xa2, 0x3b, 0x1c, 0x22, 0x5d, 0x80]);
  assert.deepEqual(parseUid('abc'), []);
});

test('chip maker only for 7/10-byte and ISO 15693 UIDs', () => {
  assert.equal(chipFacts('04:a2:3b:1c:22:5d:80', [], 'lv').maker, 'NXP Semiconductors');
  assert.equal(chipFacts('04:a2:3b:1c:22:5d:80', [], 'lv').kind, 'double');
  const single = chipFacts('04:a2:3b:1c', [], 'lv');
  assert.equal(single.kind, 'single'); assert.equal(single.maker, null);
  assert.equal(chipFacts('e0:04:01:00:12:34:56:78', [], 'other').maker, 'NXP Semiconductors');
});

test('links: official brand domain or not', () => {
  const f = chipFacts('04:a2:3b:1c', ['https://www.chanel.com/x', 'https://chanel-check.shop/a'], 'chanel');
  assert.deepEqual(f.links.map((l) => l.official), [true, false]);
  assert.equal(chipFacts('04:a2:3b:1c', ['https://example.com'], 'other').links[0].official, null);
});
