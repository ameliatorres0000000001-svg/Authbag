import type { Env } from './env.ts';
import { lineTexts } from '../shared/line.ts';

// LINE Official Account (Messaging API channel — separate from the LINE Login channel).
// Secrets: LINE_MESSAGING_SECRET (webhook signature) and LINE_MESSAGING_TOKEN (long-lived channel access token).

export const lineBotConfigured = (env: Env) => !!env.LINE_MESSAGING_SECRET && !!env.LINE_MESSAGING_TOKEN;

async function call(env: Env, method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.line.me${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.LINE_MESSAGING_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`line_${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Answer a message (free; the reply token is valid for about a minute). */
export const lineReply = (env: Env, replyToken: string, text: string) =>
  call(env, 'POST', '/v2/bot/message/reply', { replyToken, messages: lineTexts(text).map((t) => ({ type: 'text', text: t })) });

/** Send without a reply token (counts against the OA's monthly message quota). */
export const linePush = (env: Env, to: string, text: string) =>
  call(env, 'POST', '/v2/bot/message/push', { to, messages: lineTexts(text, 5000, 1).map((t) => ({ type: 'text', text: t })) });

export const lineProfile = (env: Env, userId: string): Promise<{ displayName?: string }> => call(env, 'GET', `/v2/bot/profile/${encodeURIComponent(userId)}`).catch(() => ({}));
export const lineBotInfo = (env: Env): Promise<{ basicId?: string; displayName?: string; pictureUrl?: string }> => call(env, 'GET', '/v2/bot/info');
export const lineWebhookInfo = (env: Env): Promise<{ endpoint?: string; active?: boolean }> => call(env, 'GET', '/v2/bot/channel/webhook/endpoint');
export const lineSetWebhook = (env: Env, endpoint: string) => call(env, 'PUT', '/v2/bot/channel/webhook/endpoint', { endpoint });
export const lineTestWebhook = (env: Env): Promise<{ success?: boolean; statusCode?: number; reason?: string; detail?: string }> => call(env, 'POST', '/v2/bot/channel/webhook/test', {});
export const lineQuota = async (env: Env): Promise<{ limit: number | null; used: number | null }> => {
  const [q, u] = await Promise.all([call(env, 'GET', '/v2/bot/message/quota').catch(() => null), call(env, 'GET', '/v2/bot/message/quota/consumption').catch(() => null)]);
  return { limit: q?.type === 'limited' ? q.value : null, used: typeof u?.totalUsage === 'number' ? u.totalUsage : null };
};
