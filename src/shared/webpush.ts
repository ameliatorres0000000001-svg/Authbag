// Web Push with WebCrypto only (runs in the Worker and in Node tests):
//  - message encryption: RFC 8291 (aes128gcm content coding, RFC 8188)
//  - VAPID: RFC 8292 (ES256 JWT)

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (u: Uint8Array): Bytes => new Uint8Array(u) as Bytes;

export const b64u = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Bytes {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Bytes;
  },
};

const concat = (...parts: Uint8Array[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)) as Bytes;
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', bytes(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bytes(salt), info: bytes(info) }, key, n * 8)) as Bytes;
}

/**
 * Encrypt a push message for one subscription (RFC 8291). Returns the request body:
 * salt(16) | record size(4) | key id length(1) | sender public key(65) | ciphertext.
 */
export async function encryptPush(payload: Uint8Array, p256dh: string, auth: string, opts: { salt?: Uint8Array; senderKeys?: CryptoKeyPair } = {}): Promise<Bytes> {
  const uaPub = b64u.decode(p256dh);
  const authSecret = b64u.decode(auth);
  const sender = opts.senderKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = bytes(opts.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // one record: the payload followed by the 0x02 "last record" delimiter
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/** Decrypt (the browser's side), used by the tests to check the encryption round trip. */
export async function decryptPush(raw: Uint8Array, ua: CryptoKeyPair, auth: string): Promise<Uint8Array> {
  const body = bytes(raw);
  const salt = body.slice(0, 16); const idlen = body[20];
  const asPub = body.slice(21, 21 + idlen); const ct = body.slice(21 + idlen);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(b64u.decode(auth), ecdh, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const rec = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  let end = rec.length - 1; while (end > 0 && rec[end] === 0) end--;
  return rec.slice(0, end); // drop the delimiter
}

/** VAPID key pair: public key as raw b64url (what the browser needs), private key as a JWK. */
export async function makeVapidKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { publicKey: b64u.encode(await crypto.subtle.exportKey('raw', kp.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
}

/** "Authorization: vapid t=…, k=…" for one push service (RFC 8292). */
export async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey, subject: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${publicKey}`;
}
