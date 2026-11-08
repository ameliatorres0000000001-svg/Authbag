/**
 * LINE Messaging API helpers that do not touch the network, so they are unit-tested.
 */

/** LINE signs each webhook body: base64(HMAC-SHA256(channel secret, raw body)) in the X-Line-Signature header. */
export async function lineSignatureOk(secret: string, body: string, signature: string | null | undefined): Promise<boolean> {
  if (!secret || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  let bin = ''; for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** A reply as LINE text messages: at most 5 messages of at most 5000 characters, split on paragraph breaks where possible. */
export function lineTexts(text: string, max = 5000, maxMessages = 5): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < maxMessages) {
    if (rest.length <= max) { out.push(rest); break; }
    let cut = rest.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return out.filter(Boolean);
}

/** The AI ends a reply with [STAFF] when a person must take over (order, payment, bargaining, photos, unknown stock/price). */
export function splitHandoff(reply: string): { text: string; handoff: boolean } {
  const handoff = /\[STAFF\]/i.test(reply);
  return { text: reply.replace(/\s*\[STAFF\]\s*/gi, ' ').replace(/[ \t]+\n/g, '\n').trim(), handoff };
}

/** One-time code a staff member sends to the shop's LINE to get shop notifications there, e.g. "LINK 4821". */
export const linkCodeMatches = (text: string, code: string) => text.replace(/\s+/g, ' ').trim().toUpperCase() === `LINK ${code}`;

/** Add-friend link and QR image for a LINE OA basic ID such as "@123abcd". */
export function lineFriendLinks(basicId: string | null | undefined): { url: string; qr: string } | null {
  const id = (basicId ?? '').trim();
  if (!/^@[a-z0-9._-]{3,40}$/i.test(id)) return null;
  return { url: `https://line.me/R/ti/p/${encodeURIComponent(id)}`, qr: `https://qr-official.line.me/sid/L/${id.slice(1)}.png` };
}
