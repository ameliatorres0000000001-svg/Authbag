import type { Env } from './env.ts';

// WhatsApp Business Cloud API helpers for the interpreter inbox. The access token, app secret and verify token are
// secrets (wrangler secret put …); nothing here logs them. A WhatsApp contact is stored as "wa:<number>" in line_contacts.

export const WA_PREFIX = 'wa:';
export const isWhatsApp = (contactId: string) => contactId.startsWith(WA_PREFIX);
export const whatsappConfigured = (env: Env) => !!env.WHATSAPP_TOKEN?.trim() && !!env.WHATSAPP_PHONE_NUMBER_ID?.trim() && !!env.WHATSAPP_APP_SECRET?.trim() && !!env.WHATSAPP_VERIFY_TOKEN?.trim();
/** WhatsApp lets a business send free-form text only within 24 hours of the customer's last message. */
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

const graph = (env: Env, path: string) => `https://graph.facebook.com/${env.WHATSAPP_API_VERSION?.trim() || 'v24.0'}/${path}`;
const auth = (env: Env) => ({ authorization: `Bearer ${env.WHATSAPP_TOKEN?.trim()}` });
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(app secret, raw body)). Compared in constant time. */
export async function verifyWhatsAppSignature(appSecret: string, rawBody: string, header: string | null | undefined): Promise<boolean> {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  const got = header.slice(7).toLowerCase();
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export type WaIncoming =
  | { type: 'text'; contactId: string; name: string | null; messageId: string; text: string }
  | { type: 'audio'; contactId: string; name: string | null; messageId: string; mediaId: string };

/** The messages we use from a webhook body: text and voice only; numbers are digits (wa_id), 8–15 long. */
export function parseWhatsAppEvents(body: unknown): WaIncoming[] {
  const out: WaIncoming[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const en of entries.slice(0, 20)) for (const ch of (Array.isArray(en?.changes) ? en.changes : []).slice(0, 20)) {
    const v = ch?.value;
    if (!v || !Array.isArray(v.messages)) continue;
    const names = new Map<string, string>();
    for (const k of Array.isArray(v.contacts) ? v.contacts : []) if (k?.wa_id && k?.profile?.name) names.set(String(k.wa_id), String(k.profile.name).slice(0, 120));
    for (const m of v.messages.slice(0, 50)) {
      const from = String(m?.from ?? '');
      if (!/^\d{8,15}$/.test(from) || typeof m?.id !== 'string') continue;
      const base = { contactId: WA_PREFIX + from, name: names.get(from) ?? null, messageId: m.id };
      if (m.type === 'text' && typeof m.text?.body === 'string' && m.text.body.trim()) out.push({ type: 'text', ...base, text: m.text.body.slice(0, 5000) });
      else if (m.type === 'audio' && typeof m.audio?.id === 'string') out.push({ type: 'audio', ...base, mediaId: m.audio.id });
    }
  }
  return out;
}

/** A voice note's audio (WhatsApp sends ogg/opus): ask for the media URL, then download it with the same token. */
export async function whatsappAudio(env: Env, mediaId: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const meta = await fetch(graph(env, encodeURIComponent(mediaId)), { headers: auth(env) });
  if (!meta.ok) throw new Error(`wa_media_${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
  if (!url || !/^https:\/\//.test(url)) throw new Error('wa_media_url');
  const r = await fetch(url, { headers: auth(env) });
  if (!r.ok) throw new Error(`wa_media_${r.status}`);
  const data = await r.arrayBuffer();
  if (data.byteLength > 10 * 1024 * 1024) throw new Error('wa_audio_too_big');
  return { data, mime: (mime_type ?? 'audio/ogg').split(';')[0].trim().toLowerCase() };
}

/** Send a text to one number. Staff approve the text first; never called by the AI alone. */
export async function whatsappSend(env: Env, contactId: string, text: string): Promise<void> {
  const r = await fetch(graph(env, `${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? '')}/messages`), {
    method: 'POST', headers: { ...auth(env), 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: contactId.slice(WA_PREFIX.length), type: 'text', text: { body: text.slice(0, 4000), preview_url: false } }),
  });
  if (!r.ok) {
    const e = ((await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } }).error;
    // 131047: more than 24 hours since the customer's last message
    throw new Error(`wa_send_${e?.code === 131047 ? 'window' : r.status}${e?.message ? `: ${e.message.slice(0, 120)}` : ''}`);
  }
}
