import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { lineFriendLinks, lineSignatureOk, lineTexts, linkCodeMatches, splitHandoff } from '../src/shared/line.ts';

test('LINE webhook signature: accepts the real one, rejects others', async () => {
  const body = '{"events":[{"type":"message","message":{"type":"text","text":"สวัสดี"}}]}';
  const sig = createHmac('sha256', 'shh').update(body).digest('base64');
  assert.equal(await lineSignatureOk('shh', body, sig), true);
  assert.equal(await lineSignatureOk('other', body, sig), false);
  assert.equal(await lineSignatureOk('shh', body + ' ', sig), false);
  assert.equal(await lineSignatureOk('shh', body, null), false);
});

test('long replies split into at most 5 LINE messages', () => {
  assert.deepEqual(lineTexts('hello'), ['hello']);
  const parts = lineTexts(`${'a'.repeat(30)}\n\n${'b'.repeat(30)}`, 40);
  assert.deepEqual(parts, ['a'.repeat(30), 'b'.repeat(30)]);
  assert.equal(lineTexts('x'.repeat(100), 10).length, 5);
});

test('hand-off marker is removed and reported', () => {
  assert.deepEqual(splitHandoff('ทีมงานจะติดต่อกลับค่ะ [STAFF]'), { text: 'ทีมงานจะติดต่อกลับค่ะ', handoff: true });
  assert.deepEqual(splitHandoff('ราคาเริ่ม 900 บาท'), { text: 'ราคาเริ่ม 900 บาท', handoff: false });
});

test('link code and friend links', () => {
  assert.equal(linkCodeMatches(' link  4821 ', '4821'), true);
  assert.equal(linkCodeMatches('LINK 4822', '4821'), false);
  assert.deepEqual(lineFriendLinks('@123abcd'), { url: 'https://line.me/R/ti/p/%40123abcd', qr: 'https://qr-official.line.me/sid/L/123abcd.png' });
  assert.equal(lineFriendLinks('123abcd'), null);
});
