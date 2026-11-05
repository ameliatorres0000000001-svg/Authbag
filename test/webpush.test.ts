import test from 'node:test';
import assert from 'node:assert/strict';
import { b64u, decryptPush, encryptPush, makeVapidKeys, vapidHeader } from '../src/shared/webpush.ts';

test('push message round trip (RFC 8291 aes128gcm)', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const p256dh = b64u.encode(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
  const msg = new TextEncoder().encode(JSON.stringify({ title: 'New request', body: 'Chanel 19' }));
  const body = await encryptPush(msg, p256dh, auth);
  // header layout: salt 16 | rs 4096 | idlen 65 | key 65
  assert.equal(body[20], 65);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 16, 0]);
  const out = await decryptPush(body, ua, auth);
  assert.equal(new TextDecoder().decode(out), new TextDecoder().decode(msg));
});

test('VAPID header is a signed ES256 JWT for the push service origin', async () => {
  const k = await makeVapidKeys();
  assert.equal(b64u.decode(k.publicKey).length, 65);
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', k.publicKey, k.privateJwk, 'https://example.com');
  const m = h.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m);
  const claims = JSON.parse(new TextDecoder().decode(b64u.decode(m![2])));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  // the signature verifies with the public key
  const pub = await crypto.subtle.importKey('raw', b64u.decode(k.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(m![3]), new TextEncoder().encode(`${m![1]}.${m![2]}`));
  assert.ok(ok);
});
