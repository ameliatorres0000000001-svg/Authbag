/**
 * TikTok account links for the customer finder. Pure, so it is unit-tested.
 * Handles are letters, digits, "_" and "." (2–24 characters); a link may be a profile, a video or a LIVE page.
 */
const TT = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/@([A-Za-z0-9._]{2,24})(?=[/?#]|$)/i;

/** The handle a TikTok link belongs to (lower-case), or null for any other link (search, discover, tag pages…). */
export function tiktokHandle(url: string): string | null {
  const m = TT.exec(url.trim());
  if (!m || m[1].endsWith('.')) return null;
  return m[1].toLowerCase();
}

/** "@name", "name" or a TikTok link → handle; null when it is none of these. */
export function handleFromInput(v: string): string | null {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return tiktokHandle(s);
  const m = /^@?([A-Za-z0-9._]{2,24})$/.exec(s);
  return m && !m[1].endsWith('.') ? m[1].toLowerCase() : null;
}

export const profileUrl = (handle: string) => `https://www.tiktok.com/@${handle}`;

/**
 * Keep an AI-proposed account only when a link the search really returned belongs to that handle.
 * Returns that link (the evidence) or null.
 */
export function evidenceFor(handle: string, found: Iterable<string>): string | null {
  const h = handle.replace(/^@/, '').toLowerCase();
  let best: string | null = null;
  for (const u of found) {
    if (tiktokHandle(u) !== h) continue;
    if (/\/live(?:[/?#]|$)/i.test(u)) return u; // a LIVE page is the best evidence
    best ??= u;
  }
  return best;
}
