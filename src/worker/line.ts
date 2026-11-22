import type { Env } from './env.ts';

// LINE Messaging API helpers for the shop's interpreter inbox. The channel secret and access token are secrets
// (wrangler secret put LINE_MESSAGING_SECRET / LINE_MESSAGING_TOKEN); nothing here logs them.

export const lineMessagingConfigured = (env: Env) => !!env.LINE_MESSAGING_SECRET?.trim() && !!env.LINE_MESSAGING_TOKEN?.trim();

const b64 = (buf: ArrayBuffer) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };

/** X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)). Compared in constant time. */
export async function verifyLineSignature(secret: string, rawBody: string, signature: string | null | undefined): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export type LineIncoming =
  | { type: 'follow' | 'unfollow'; userId: string }
  | { type: 'text'; userId: string; messageId: string; text: string }
  | { type: 'audio'; userId: string; messageId: string };

/** The events we use, from a webhook body: one-to-one chats only (no groups / rooms), text and voice only. */
export function parseLineEvents(body: unknown): LineIncoming[] {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const out: LineIncoming[] = [];
  for (const e of events.slice(0, 50)) {
    const userId = e?.source?.type === 'user' ? String(e.source.userId ?? '') : '';
    if (userId.length < 10 || userId.length > 64) continue;
    if (e.type === 'follow' || e.type === 'unfollow') out.push({ type: e.type, userId });
    else if (e.type === 'message' && typeof e.message?.id === 'string') {
      if (e.message.type === 'text' && typeof e.message.text === 'string' && e.message.text.trim()) out.push({ type: 'text', userId, messageId: e.message.id, text: e.message.text.slice(0, 5000) });
      else if (e.message.type === 'audio') out.push({ type: 'audio', userId, messageId: e.message.id });
    }
  }
  return out;
}

const auth = (env: Env) => ({ authorization: `Bearer ${env.LINE_MESSAGING_TOKEN?.trim()}` });

export async function lineDisplayName(env: Env, userId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, { headers: auth(env) });
    if (!r.ok) return null;
    const n = ((await r.json()) as { displayName?: string }).displayName;
    return n ? n.slice(0, 120) : null;
  } catch { return null; }
}

/** A voice message's audio (LINE keeps it for a limited time; files are small, usually m4a). */
export async function lineAudio(env: Env, messageId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const r = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: auth(env) });
  if (!r.ok) throw new Error(`line_content_${r.status}`);
  const data = await r.arrayBuffer();
  if (data.byteLength > 10 * 1024 * 1024) throw new Error('line_audio_too_big');
  const ct = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  return { data, mime: ct.startsWith('audio/') ? (ct === 'audio/x-m4a' ? 'audio/mp4' : ct) : 'audio/mp4' };
}

/** Push a text to one person. Staff always see and approve the text first; this is never called by the AI alone. */
export async function linePush(env: Env, userId: string, text: string): Promise<void> {
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { ...auth(env), 'content-type': 'application/json' },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });
  if (!r.ok) {
    const why = ((await r.json().catch(() => ({}))) as { message?: string }).message ?? '';
    throw new Error(`line_push_${r.status}${why ? `: ${why.slice(0, 120)}` : ''}`);
  }
}
