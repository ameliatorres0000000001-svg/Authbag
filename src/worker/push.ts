import type { Env } from './env.ts';
import { encryptPush, makeVapidKeys, vapidHeader } from '../shared/webpush.ts';

// Phone notifications for experts. The VAPID key pair is created once and kept in D1 (private key never sent out).

export async function vapidKeys(env: Env): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const row = await env.DB.prepare(`SELECT public_key, private_jwk FROM push_keys WHERE id = 'vapid'`).first<{ public_key: string; private_jwk: string }>();
  if (row) return { publicKey: row.public_key, privateJwk: JSON.parse(row.private_jwk) };
  const k = await makeVapidKeys();
  await env.DB.prepare(`INSERT OR IGNORE INTO push_keys (id, public_key, private_jwk) VALUES ('vapid', ?, ?)`).bind(k.publicKey, JSON.stringify(k.privateJwk)).run();
  return vapidKeys(env); // re-read in case another request created them first
}

export interface PushNote { title: string; body: string; url: string; tag?: string }

/** Send one notification to every phone of all active experts (staff). Dead subscriptions are removed. */
export async function notifyStaff(env: Env, note: PushNote, origin: string): Promise<number> {
  const subs = (await env.DB.prepare(
    `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN users u ON u.id = s.user_id
     WHERE u.active = 1 AND u.role IN ('owner','lead_authenticator','appraiser')`,
  ).all<{ id: string; endpoint: string; p256dh: string; auth: string }>()).results;
  if (!subs.length) return 0;
  const k = await vapidKeys(env);
  const payload = new TextEncoder().encode(JSON.stringify(note));
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      const body = await encryptPush(payload, s.p256dh, s.auth);
      const res = await fetch(s.endpoint, {
        method: 'POST',
        headers: { TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
          Authorization: await vapidHeader(s.endpoint, k.publicKey, k.privateJwk, origin) },
        body,
      });
      if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
      else if (res.ok) sent++;
      else console.error('push failed', res.status, (await res.text()).slice(0, 200));
    } catch (e) { console.error('push error', (e as Error).message); }
  }));
  return sent;
}

/** Send to one user's phones only (e.g. the "test" button). */
export async function notifyUser(env: Env, userId: string, note: PushNote, origin: string): Promise<number> {
  const subs = (await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').bind(userId).all<{ id: string; endpoint: string; p256dh: string; auth: string }>()).results;
  if (!subs.length) return 0;
  const k = await vapidKeys(env);
  const payload = new TextEncoder().encode(JSON.stringify(note));
  let sent = 0;
  for (const s of subs) {
    const res = await fetch(s.endpoint, {
      method: 'POST',
      headers: { TTL: '3600', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        Authorization: await vapidHeader(s.endpoint, k.publicKey, k.privateJwk, origin) },
      body: await encryptPush(payload, s.p256dh, s.auth),
    }).catch(() => null);
    if (res && (res.status === 404 || res.status === 410)) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
    else if (res?.ok) sent++;
  }
  return sent;
}
