import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWhatsApp, parseWhatsAppEvents, verifyWhatsAppSignature } from '../src/worker/whatsapp.ts';

const sig = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return 'sha256=' + [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
};

test('whatsapp signature: right secret passes; wrong secret, edited body, missing or malformed header fail', async () => {
  const body = '{"entry":[]}';
  const h = await sig('app-secret', body);
  assert.equal(await verifyWhatsAppSignature('app-secret', body, h), true);
  assert.equal(await verifyWhatsAppSignature('other', body, h), false);
  assert.equal(await verifyWhatsAppSignature('app-secret', body + ' ', h), false);
  assert.equal(await verifyWhatsAppSignature('app-secret', body, null), false);
  assert.equal(await verifyWhatsAppSignature('app-secret', body, h.replace('sha256=', '')), false);
  assert.equal(await verifyWhatsAppSignature('', body, h), false);
});

const wrap = (value: unknown) => ({ entry: [{ changes: [{ field: 'messages', value }] }] });
test('whatsapp events: text and voice with the sender name; other types, bad numbers and status updates are ignored', () => {
  const ev = parseWhatsAppEvents(wrap({
    contacts: [{ wa_id: '66812345678', profile: { name: 'Somchai' } }],
    messages: [
      { from: '66812345678', id: 'wamid.1', type: 'text', text: { body: 'สวัสดีครับ' } },
      { from: '66812345678', id: 'wamid.2', type: 'audio', audio: { id: 'media-9', mime_type: 'audio/ogg; codecs=opus' } },
      { from: '66812345678', id: 'wamid.3', type: 'image', image: { id: 'x' } },
      { from: 'not-a-number', id: 'wamid.4', type: 'text', text: { body: 'hi' } },
      { from: '66812345678', id: 'wamid.5', type: 'text', text: { body: '  ' } },
    ],
  }));
  assert.deepEqual(ev.map((e) => e.type), ['text', 'audio']);
  assert.equal(ev[0].contactId, 'wa:66812345678');
  assert.equal(ev[0].name, 'Somchai');
  assert.equal((ev[1] as { mediaId: string }).mediaId, 'media-9');
  assert.deepEqual(parseWhatsAppEvents(wrap({ statuses: [{ id: 'a', status: 'delivered' }] })), []);
  assert.deepEqual(parseWhatsAppEvents(null), []);
  assert.equal(isWhatsApp('wa:66812345678'), true);
  assert.equal(isWhatsApp('U' + 'a'.repeat(32)), false);
});
