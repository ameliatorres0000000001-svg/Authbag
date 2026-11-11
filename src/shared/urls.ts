// Comparing a link the AI wrote with the links a web search really returned.
// The AI often rewrites a link slightly (http/https, "www.", a trailing "/", "#section", tracking parameters),
// so links are compared by a key that ignores those. The page (host + path + real query) must still be the same.

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|ref|ref_src|igshid|spm)$/i;

/** Same page ⇒ same key. Returns '' for something that is not an http(s) link. */
export function urlKey(raw: string): string {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const query = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).map(([k, v]) => `${k}=${v}`).sort().join('&');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/**
 * Of the links the AI wrote, keep only those the search really returned, and give them back exactly as the
 * search returned them (never the AI's spelling). No duplicates; order kept.
 */
export function matchFoundUrls(written: unknown[], found: Iterable<string>, max = 4): string[] {
  const byKey = new Map<string, string>();
  for (const f of found) { const k = urlKey(f); if (k && !byKey.has(k)) byKey.set(k, f); }
  const out: string[] = [];
  for (const w of written) {
    const real = byKey.get(urlKey(String(w)));
    if (real && !out.includes(real)) out.push(real);
    if (out.length >= max) break;
  }
  return out;
}
