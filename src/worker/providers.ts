import type { Env } from './env.ts';

/**
 * Provider adapters. A provider is only ever 'connected' after a REAL, successful test call (the database also enforces this).
 * Nothing here fabricates a result. Entrupy's exact base URL / auth scheme / endpoints must be taken from its developer docs
 * (developer.entrupy.com) AFTER your business account is approved — they are configuration, not guesses baked into code.
 */
export interface ProviderConfig {
  base_url?: string;       // e.g. from the provider docs
  test_path?: string;      // a harmless read-only endpoint from the docs
  auth_header?: string;    // e.g. "Authorization" or "X-Api-Key" — as documented
  auth_prefix?: string;    // e.g. "Bearer " — as documented (can be empty)
}

export interface TestOutcome {
  status: 'not_configured' | 'awaiting_authorization' | 'connected' | 'test_failed';
  ok: boolean;
  message: string;
}

const SECRET_NAMES: Record<string, keyof Env> = { entrupy: 'ENTRUPY_API_KEY' };

export function secretPresent(env: Env, providerId: string): boolean {
  const n = SECRET_NAMES[providerId];
  return !!n && !!env[n];
}

export async function testProvider(env: Env, providerId: string, cfg: ProviderConfig): Promise<TestOutcome> {
  const secretName = SECRET_NAMES[providerId];
  if (!secretName) return { status: 'not_configured', ok: false, message: 'No adapter implemented for this provider yet.' };
  const secret = env[secretName] as string | undefined;
  if (!secret) return { status: 'not_configured', ok: false, message: `Secret ${String(secretName)} is not set. Run: wrangler secret put ${String(secretName)}` };
  if (!cfg.base_url || !cfg.test_path || !cfg.auth_header) {
    return { status: 'awaiting_authorization', ok: false, message: 'Secret is present, but base_url / test_path / auth_header are not configured. Copy them from the provider documentation.' };
  }
  let url: URL;
  try { url = new URL(cfg.test_path, cfg.base_url); } catch { return { status: 'test_failed', ok: false, message: 'base_url/test_path is not a valid URL.' }; }
  if (url.protocol !== 'https:') return { status: 'test_failed', ok: false, message: 'Provider URL must be https.' };
  try {
    const res = await fetch(url, { method: 'GET', headers: { [cfg.auth_header]: `${cfg.auth_prefix ?? ''}${secret}`, Accept: 'application/json' } });
    if (res.ok) return { status: 'connected', ok: true, message: `Test call succeeded (HTTP ${res.status}).` };
    return { status: 'test_failed', ok: false, message: `Provider answered HTTP ${res.status}. Check credentials, account approval and endpoint.` };
  } catch (e) {
    return { status: 'test_failed', ok: false, message: `Network error: ${(e as Error).message}` };
  }
}
