import type { Env, SessionUser } from './env.ts';

export const uid = (prefix = ''): string => prefix + crypto.randomUUID().replace(/-/g, '');
export const nowIso = (): string => new Date().toISOString();

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

// ───── passwords: PBKDF2-SHA256, per-user salt. No secrets needed in env. ─────
// Workers runtime caps PBKDF2 at 100k iterations; higher values throw NotSupportedError.
const PBKDF2_ITER = 100_000;
async function pbkdf2(password: string, saltHex: string, iter: number): Promise<string> {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
export async function hashPassword(password: string): Promise<{ hash: string; salt: string; iter: number }> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return { hash: await pbkdf2(password, salt, PBKDF2_ITER), salt, iter: PBKDF2_ITER };
}
export async function verifyPassword(password: string, hash: string, salt: string, iter: number): Promise<boolean> {
  const got = await pbkdf2(password, salt, iter);
  if (got.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// ───── sessions ─────
export const COOKIE = 'hz_session';
export const SESSION_DAYS = 7;

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const exp = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256Hex(token), userId, exp).run();
  return token;
}

export async function userFromToken(env: Env, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.locale FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`,
  ).bind(await sha256Hex(token), nowIso()).first<SessionUser>();
  return row ?? null;
}

// ───── append-only, hash-chained audit log ─────
export async function audit(
  env: Env, userId: string | null, action: string, resourceType: string, resourceId: string | null, detail: unknown = null,
): Promise<void> {
  const last = await env.DB.prepare('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1').first<{ hash: string }>();
  const prev = last?.hash ?? '0'.repeat(64);
  const ts = nowIso();
  const detailJson = detail == null ? null : JSON.stringify(detail);
  const hash = await sha256Hex([prev, ts, userId ?? '', action, resourceType, resourceId ?? '', detailJson ?? ''].join('|'));
  await env.DB.prepare(
    'INSERT INTO audit_log (ts, user_id, action, resource_type, resource_id, detail_json, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(ts, userId, action, resourceType, resourceId, detailJson, prev, hash).run();
}

export async function verifyAuditChain(env: Env): Promise<{ ok: boolean; checked: number; brokenAtId?: number }> {
  const { results } = await env.DB.prepare(
    'SELECT id, ts, user_id, action, resource_type, resource_id, detail_json, prev_hash, hash FROM audit_log ORDER BY id ASC',
  ).all<{ id: number; ts: string; user_id: string | null; action: string; resource_type: string; resource_id: string | null; detail_json: string | null; prev_hash: string; hash: string }>();
  let prev = '0'.repeat(64);
  for (const r of results) {
    const expect = await sha256Hex([prev, r.ts, r.user_id ?? '', r.action, r.resource_type, r.resource_id ?? '', r.detail_json ?? ''].join('|'));
    if (r.prev_hash !== prev || r.hash !== expect) return { ok: false, checked: results.length, brokenAtId: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: results.length };
}

export async function getSettingNumber(env: Env, key: string, fallback: number): Promise<number> {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  const n = r ? Number(r.value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** magic-byte sniffing so a renamed file can't masquerade as an image */
export function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}
