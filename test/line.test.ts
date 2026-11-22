import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineEvents, verifyLineSignature } from '../src/worker/line.ts';

const sign = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  let s = ''; for (const b of new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))) s += String.fromCharCode(b);
  return btoa(s);
};

test('line signature: the right secret passes, anything else fails', async () => {
  const body = '{"events":[]}';
  const sig = await sign('secret-1', body);
  assert.equal(await verifyLineSignature('secret-1', body, sig), true);
  assert.equal(await verifyLineSignature('secret-2', body, sig), false);
  assert.equal(await verifyLineSignature('secret-1', body + ' ', sig), false);
  assert.equal(await verifyLineSignature('secret-1', body, null), false);
  assert.equal(await verifyLineSignature('', body, sig), false);
  assert.equal(await verifyLineSignature('secret-1', body, sig.slice(0, -2)), false);
});

const U = 'U' + 'a'.repeat(32);
test('line events: text, voice, follow; groups and other types are ignored', () => {
  const ev = parseLineEvents({ events: [
    { type: 'message', source: { type: 'user', userId: U }, message: { id: '1', type: 'text', text: 'สวัสดีครับ' } },
    { type: 'message', source: { type: 'user', userId: U }, message: { id: '2', type: 'audio' } },
    { type: 'message', source: { type: 'user', userId: U }, message: { id: '3', type: 'image' } },
    { type: 'message', source: { type: 'group', groupId: 'G1', userId: U }, message: { id: '4', type: 'text', text: 'hi' } },
    { type: 'message', source: { type: 'user', userId: U }, message: { id: '5', type: 'text', text: '   ' } },
    { type: 'follow', source: { type: 'user', userId: U } },
    { type: 'unfollow', source: { type: 'user', userId: 'short' } },
  ] });
  assert.deepEqual(ev.map((e) => e.type), ['text', 'audio', 'follow']);
  assert.equal((ev[0] as { text: string }).text, 'สวัสดีครับ');
  assert.deepEqual(parseLineEvents(null), []);
  assert.deepEqual(parseLineEvents({ events: 'x' }), []);
});
