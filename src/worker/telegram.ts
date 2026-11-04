import type { Env } from './env.ts';

// Telegram Bot API helpers for the experts' review group. The bot token and chat id are secrets; nothing here logs them.

export const telegramConfigured = (env: Env) => !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID;

async function tg(env: Env, method: string, body: Record<string, unknown> | FormData): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, body instanceof FormData
    ? { method: 'POST', body }
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!data.ok) throw new Error(`telegram_${method}: ${String(data.description ?? res.status).slice(0, 160)}`);
  return data.result;
}

/** Expert answers offered as buttons. Codes map to the system's four outcomes (never "authentic/fake"). */
export const EXPERT_ANSWERS: Record<string, { outcome: 'consistent_with_references' | 'concerns_found' | 'insufficient_evidence' | 'requires_expert_review'; button: string; status: 'answered' | 'more_photos' }> = {
  c: { outcome: 'consistent_with_references', button: '✅ Consistent with references', status: 'answered' },
  f: { outcome: 'concerns_found', button: '⚠️ Concerns found', status: 'answered' },
  m: { outcome: 'insufficient_evidence', button: '📷 Need more / clearer photos', status: 'more_photos' },
  r: { outcome: 'requires_expert_review', button: '🔍 Needs in-person review', status: 'answered' },
};

/** Send the request's photos as an album, then a message with the answer buttons. Returns that message's id. */
export async function sendReviewRequest(env: Env, req: { id: string; summary: string; photos: { step: string; data: ArrayBuffer; mime: string }[] }): Promise<number> {
  const chat = env.TELEGRAM_CHAT_ID!;
  for (let i = 0; i < req.photos.length; i += 10) {
    const chunk = req.photos.slice(i, i + 10);
    const fd = new FormData();
    fd.append('chat_id', chat);
    fd.append('media', JSON.stringify(chunk.map((p, j) => ({ type: 'photo', media: `attach://p${j}`, caption: p.step }))));
    chunk.forEach((p, j) => fd.append(`p${j}`, new Blob([p.data], { type: p.mime }), `${p.step}.jpg`));
    await tg(env, 'sendMediaGroup', fd);
  }
  const msg = await tg(env, 'sendMessage', {
    chat_id: chat,
    text: `${req.summary}\n\nTap an answer below. Reply to this message with text to add a note for the customer.`,
    reply_markup: { inline_keyboard: Object.entries(EXPERT_ANSWERS).map(([code, a]) => [{ text: a.button, callback_data: `vr|${req.id}|${code}` }]) },
  });
  return (msg as { message_id: number }).message_id;
}

export const answerCallback = (env: Env, id: string, text: string) => tg(env, 'answerCallbackQuery', { callback_query_id: id, text }).catch(() => {});
export const editDecision = (env: Env, chatId: number, messageId: number, text: string) =>
  tg(env, 'editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } }).catch(() => {});
export const sendText = (env: Env, text: string, replyTo?: number) =>
  tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text, ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}) }).catch(() => {});

export const setWebhook = (env: Env, url: string) =>
  tg(env, 'setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['callback_query', 'message'], drop_pending_updates: true });
export const webhookInfo = (env: Env) => tg(env, 'getWebhookInfo', {});
