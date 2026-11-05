import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv, Role } from './env.ts';
import {
  COOKIE, SESSION_DAYS, audit, createSession, getSettingNumber, hashPassword, nowIso, sha256Hex, sniffImage, uid,
  userFromToken, verifyAuditChain, verifyPassword,
} from './lib.ts';
import { resolveTemplates, runEvaluation } from './evaluate.ts';
import { secretPresent, testProvider, type ProviderConfig } from './providers.ts';
import { testAi, OUT_LANGS, type OutLang, translatePoints, writeModelGuide, suggestModelForPhoto, aiConfigured, aiModel, aiProvider, analyzeDateCodeAppearance, findPhotoRegions, identifyStyleCode, explainDifferences, suggestFocusRegions, suggestObservations, suggestTeachingPoints } from './vision.ts';
import { isValidRect } from '../shared/marks.ts';
import { EXPERT_ANSWERS, answerCallback, editDecision, sendReviewRequest, sendText, setWebhook, telegramConfigured, webhookInfo } from './telegram.ts';
import { coverageForModel, type CoverageEra } from '../shared/coverage.ts';

const app = new Hono<AppEnv>();
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MODEL_SET_SIZE = 5;

/** Language the AI writes in: the browser's chosen UI language (x-hz-lang), else the user's saved locale, else Khmer. */
const reqLang = (c: any): OutLang => {
  const h = String(c.req.header('x-hz-lang') ?? '').toLowerCase() as OutLang;
  if (OUT_LANGS.includes(h)) return h;
  const u = c.get('user')?.locale as OutLang | undefined;
  return u && OUT_LANGS.includes(u) ? u : 'km';
};
const STAFF: Role[] = ['owner', 'lead_authenticator', 'appraiser'];
const REVIEWERS: Role[] = ['owner', 'lead_authenticator', 'reviewer'];
const ADMINS: Role[] = ['owner', 'lead_authenticator'];

const need = (roles: Role[]) => async (c: any, next: any) => {
  if (!roles.includes(c.get('user').role)) return c.json({ error: 'forbidden' }, 403);
  await next();
};
const parse = async <T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> => schema.parse(await c.req.json());

app.onError((err, c) => {
  if (err instanceof z.ZodError) return c.json({ error: 'invalid_input', issues: err.issues }, 400);
  const msg = String((err as Error).message ?? err);
  if (msg.includes('CHECK constraint failed') || msg.includes('append-only') || msg.includes('immutable')) return c.json({ error: 'rejected_by_database_rule', detail: msg }, 409);
  if (msg.includes('UNIQUE constraint failed')) return c.json({ error: 'already_exists' }, 409);
  console.error(err);
  return c.json({ error: 'server_error' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, time: nowIso() }));

// ───────────────────────── auth ─────────────────────────
const pwSchema = z.string().min(12).max(200);

app.get('/api/auth/state', async (c) => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return c.json({ needsBootstrap: (n?.n ?? 0) === 0, line: !!(c.env.LINE_CHANNEL_ID && c.env.LINE_CHANNEL_SECRET) });
});

// ───────────────────────── LINE Login (OAuth 2.1 / OpenID Connect) ─────────────────────────
// Channel ID + secret come from LINE Developers (Cloudflare Secrets LINE_CHANNEL_ID / LINE_CHANNEL_SECRET).
// The callback URL to register in the LINE channel: https://<your domain>/api/auth/line/callback
const LINE_COOKIE = 'hz_line';
const lineRedirect = (c: any) => `${new URL(c.req.url).origin}/api/auth/line/callback`;

app.get('/api/auth/line/start', async (c) => {
  if (!c.env.LINE_CHANNEL_ID || !c.env.LINE_CHANNEL_SECRET) return c.redirect('/login?error=line_not_configured');
  const state = crypto.randomUUID(); const nonce = crypto.randomUUID();
  setCookie(c, LINE_COOKIE, `${state}.${nonce}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/api/auth/line', maxAge: 600 });
  const q = new URLSearchParams({ response_type: 'code', client_id: c.env.LINE_CHANNEL_ID, redirect_uri: lineRedirect(c), state, nonce, scope: 'profile openid' });
  return c.redirect(`https://access.line.me/oauth2/v2.1/authorize?${q}`);
});

app.get('/api/auth/line/callback', async (c) => {
  const fail = (why: string) => c.redirect(`/login?error=${encodeURIComponent(why)}`);
  const [state, nonce] = (getCookie(c, LINE_COOKIE) ?? '').split('.');
  deleteCookie(c, LINE_COOKIE, { path: '/api/auth/line' });
  const code = c.req.query('code');
  if (!code || !state || c.req.query('state') !== state) return fail('line_state');
  if (!c.env.LINE_CHANNEL_ID || !c.env.LINE_CHANNEL_SECRET) return fail('line_not_configured');
  // exchange the code, then let LINE verify the ID token (signature, audience, expiry, nonce)
  const tok = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: lineRedirect(c), client_id: c.env.LINE_CHANNEL_ID, client_secret: c.env.LINE_CHANNEL_SECRET }),
  }).then((r) => r.json() as Promise<{ id_token?: string }>).catch(() => ({} as { id_token?: string }));
  if (!tok.id_token) return fail('line_token');
  const who = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tok.id_token, client_id: c.env.LINE_CHANNEL_ID, nonce }),
  }).then((r) => (r.ok ? r.json() as Promise<{ sub?: string; name?: string; email?: string }> : null)).catch(() => null);
  if (!who?.sub) return fail('line_verify');

  // an existing LINE account signs in; otherwise a new customer account is created (never linked to staff by email)
  let user = await c.env.DB.prepare('SELECT id FROM users WHERE line_sub = ? AND active = 1').bind(who.sub).first<{ id: string }>();
  if (!user) {
    const taken = who.email ? await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(who.email.toLowerCase()).first() : null;
    const email = who.email && !taken ? who.email.toLowerCase() : `line-${who.sub}@line.hengz`;
    const id = uid('u_');
    const p = await hashPassword(crypto.randomUUID() + crypto.randomUUID()); // LINE accounts sign in through LINE only
    await c.env.DB.prepare('INSERT INTO users (id, email, name, role, pw_hash, pw_salt, pw_iter, line_sub) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, (who.name || 'LINE user').slice(0, 100), 'subscriber', p.hash, p.salt, p.iter, who.sub).run();
    await audit(c.env, id, 'user.register_line', 'user', id);
    user = { id };
  }
  const token = await createSession(c.env, user.id);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_DAYS * 86400 });
  await audit(c.env, user.id, 'auth.login_line', 'user', user.id);
  // a Strict session cookie is not sent on a redirect that started at LINE; a tiny page hops to the app instead
  return c.html('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><script>location.replace("/")</script>');
});

app.post('/api/auth/bootstrap', async (c) => {
  const body = await parse(c, z.object({ email: z.string().email(), name: z.string().min(1).max(100), password: pwSchema }));
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((n?.n ?? 0) > 0) return c.json({ error: 'already_bootstrapped' }, 409);
  const id = uid('u_');
  const p = await hashPassword(body.password);
  await c.env.DB.prepare('INSERT INTO users (id, email, name, role, pw_hash, pw_salt, pw_iter) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, body.email.toLowerCase(), body.name, 'owner', p.hash, p.salt, p.iter).run();
  await audit(c.env, id, 'user.bootstrap_owner', 'user', id);
  const token = await createSession(c.env, id);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_DAYS * 86400 });
  return c.json({ ok: true });
});

app.post('/api/auth/login', async (c) => {
  const body = await parse(c, z.object({ email: z.string().email(), password: z.string().min(1) }));
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(body.email.toLowerCase()).first<Record<string, any>>();
  const ok = u ? await verifyPassword(body.password, u.pw_hash, u.pw_salt, u.pw_iter) : false;
  if (!u || !ok) { await audit(c.env, null, 'auth.login_failed', 'user', null, { email: body.email }); return c.json({ error: 'invalid_credentials' }, 401); }
  const token = await createSession(c.env, u.id);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_DAYS * 86400 });
  await audit(c.env, u.id, 'auth.login', 'user', u.id);
  return c.json({ ok: true });
});

/** Customers create their own account (role: subscriber) to send bags for verification. */
app.post('/api/auth/register', async (c) => {
  const body = await parse(c, z.object({ email: z.string().email().max(200), name: z.string().trim().min(1).max(100), password: z.string().min(8).max(200) }));
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((n?.n ?? 0) === 0) return c.json({ error: 'needs_bootstrap' }, 409);
  const id = uid('u_');
  const p = await hashPassword(body.password);
  await c.env.DB.prepare('INSERT INTO users (id, email, name, role, pw_hash, pw_salt, pw_iter) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, body.email.toLowerCase(), body.name, 'subscriber', p.hash, p.salt, p.iter).run();
  await audit(c.env, id, 'user.register', 'user', id);
  const token = await createSession(c.env, id);
  setCookie(c, COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: SESSION_DAYS * 86400 });
  return c.json({ ok: true });
});

// Read-only pages a guest can open before signing in: the feed, albums, photos and the date-code tools.
const PUBLIC_GET = [
  /^\/api\/(taxonomy|datecode|style-codes|feed|feed\/timeline|feed\/folders)$/,
  /^\/api\/albums\/[^/]+$/,
  /^\/api\/assets\/[^/]+\/image$/,
  /^\/api\/studio\/assets\/[^/]+$/,
];

// everything below requires a session (or is a public read above)
app.use('/api/*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === '/api/health' || p.startsWith('/api/auth/') || p.startsWith('/api/entrupy/partner/') || p === '/api/telegram/webhook' || p.startsWith('/api/public/cert/')) return next();
  const user = await userFromToken(c.env, getCookie(c, COOKIE));
  if (!user) {
    // guests can browse the public teaching pages (read only); everything else needs an account
    if (c.req.method === 'GET' && PUBLIC_GET.some((r) => r.test(p))) {
      c.set('user', { id: '', email: '', name: 'Guest', role: 'readonly', locale: 'km' });
      return next();
    }
    return c.json({ error: 'unauthenticated' }, 401);
  }
  c.set('user', user);
  await next();
});

app.post('/api/auth/logout', async (c) => {
  const t = getCookie(c, COOKIE);
  if (t) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(t)).run();
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});
app.get('/api/me', (c) => c.json(c.get('user')));
app.put('/api/me/locale', async (c) => {
  const { locale } = await parse(c, z.object({ locale: z.enum(['km', 'en']) }));
  await c.env.DB.prepare('UPDATE users SET locale = ? WHERE id = ?').bind(locale, c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/api/users', need(['owner']), async (c) => {
  const body = await parse(c, z.object({ email: z.string().email(), name: z.string().min(1), role: z.enum(['lead_authenticator', 'appraiser', 'reviewer', 'subscriber', 'readonly']), password: pwSchema }));
  const id = uid('u_');
  const p = await hashPassword(body.password);
  await c.env.DB.prepare('INSERT INTO users (id, email, name, role, pw_hash, pw_salt, pw_iter) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, body.email.toLowerCase(), body.name, body.role, p.hash, p.salt, p.iter).run();
  await audit(c.env, c.get('user').id, 'user.create', 'user', id, { role: body.role });
  return c.json({ id });
});
app.get('/api/users', need(ADMINS), async (c) =>
  c.json((await c.env.DB.prepare('SELECT id, email, name, role, active, created_at FROM users ORDER BY created_at').all()).results));

// ───────────────────────── taxonomy & knowledge ─────────────────────────
app.get('/api/taxonomy', async (c) => {
  const [brands, models, eras] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM brands ORDER BY name').all(),
    c.env.DB.prepare('SELECT * FROM models ORDER BY name').all(),
    c.env.DB.prepare('SELECT * FROM eras ORDER BY start_year').all(),
  ]);
  return c.json({ brands: brands.results, models: models.results, eras: eras.results });
});

app.post('/api/brands', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ name: z.string().trim().min(1).max(80) }));
  const slug = b.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return c.json({ error: 'invalid_name' }, 400);
  const id = uid('b_');
  await c.env.DB.prepare(`INSERT INTO brands (id, slug, name, knowledge_status) VALUES (?, ?, ?, 'NO_DATA')`).bind(id, slug, b.name).run();
  await audit(c.env, c.get('user').id, 'brand.create', 'brand', id, b);
  return c.json({ id });
});

app.post('/api/models', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ brandId: z.string(), name: z.string().min(1), silhouette: z.string().optional() }));
  const id = uid('m_');
  const slug = b.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  await c.env.DB.prepare('INSERT INTO models (id, brand_id, slug, name, silhouette, status) VALUES (?, ?, ?, ?, ?, ?)').bind(id, b.brandId, slug, b.name, b.silhouette ?? null, 'STUB').run();
  await audit(c.env, c.get('user').id, 'model.create', 'model', id, b);
  return c.json({ id });
});

app.post('/api/eras', need(STAFF), async (c) => {
  const b = await parse(c, z.object({
    modelId: z.string(), name: z.string().min(1), startYear: z.number().int().nullable(), endYear: z.number().int().nullable(),
    identifierType: z.enum(['NONE', 'DATE_CODE', 'RFID_MICROCHIP', 'SERIAL', 'BLIND_STAMP', 'UNKNOWN']), identifierNotes: z.string().optional(),
  }));
  const id = uid('e_');
  await c.env.DB.prepare('INSERT INTO eras (id, model_id, name, start_year, end_year, identifier_type, identifier_notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, b.modelId, b.name, b.startYear, b.endYear, b.identifierType, b.identifierNotes ?? null, 'DRAFT').run();
  await audit(c.env, c.get('user').id, 'era.create_draft', 'era', id, b);
  return c.json({ id });
});
app.post('/api/eras/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['APPROVED', 'RETIRED', 'DRAFT']) }));
  await c.env.DB.prepare('UPDATE eras SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  await audit(c.env, c.get('user').id, `era.${status.toLowerCase()}`, 'era', c.req.param('id'));
  return c.json({ ok: true });
});

app.get('/api/models/:id/requirements', async (c) => {
  const model = await c.env.DB.prepare('SELECT * FROM models WHERE id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!model) return c.json({ error: 'not_found' }, 404);
  const [templates, eras, defs] = await Promise.all([
    resolveTemplates(c.env, model.brand_id, model.id),
    c.env.DB.prepare('SELECT * FROM eras WHERE model_id = ? ORDER BY start_year').bind(model.id).all(),
    c.env.DB.prepare('SELECT * FROM observation_defs ORDER BY component_code, key').all(),
  ]);
  return c.json({ model, templates, eras: eras.results, observationDefs: defs.results });
});

app.get('/api/components', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM components').all()).results));

// ───────────────────────── rules + 4-eyes review ─────────────────────────
app.get('/api/rules', async (c) => {
  const { brandId, status } = c.req.query();
  const where: string[] = []; const args: string[] = [];
  if (brandId) { where.push('brand_id = ?'); args.push(brandId); }
  if (status) { where.push('status = ?'); args.push(status); }
  const sql = `SELECT r.*, (SELECT COUNT(*) FROM rule_approvals a WHERE a.rule_id = r.id AND a.decision = 'approve') AS approvals
               FROM rules r ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY brand_id, component_code, code`;
  return c.json((await c.env.DB.prepare(sql).bind(...args).all()).results);
});

const ruleBody = z.object({
  code: z.string().min(3), brandId: z.string(), modelId: z.string().nullable().default(null), eraId: z.string().nullable().default(null),
  componentCode: z.string(), observationKey: z.string(),
  check: z.union([
    z.object({ type: z.literal('in'), values: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1) }),
    z.object({ type: z.literal('equals'), value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ type: z.literal('range'), min: z.number().optional(), max: z.number().optional() }),
    z.object({ type: z.literal('regex'), pattern: z.string() }),
    z.object({ type: z.literal('present') }),
  ]),
  polarity: z.enum(['authentic_indicator', 'concern_indicator']), severity: z.enum(['major', 'minor', 'info']), required: z.boolean().default(false),
  titleEn: z.string().min(3), titleKm: z.string().min(3), rationale: z.string().optional(),
  sourceTier: z.number().int().min(1).max(4), citations: z.array(z.object({ type: z.string(), note: z.string().optional(), url: z.string().url().optional() })).default([]),
});

app.post('/api/rules', need(STAFF), async (c) => {
  const b = await parse(c, ruleBody);
  const id = uid('r_');
  const ver = await c.env.DB.prepare('SELECT COALESCE(MAX(version),0)+1 AS v FROM rules WHERE code = ?').bind(b.code).first<{ v: number }>();
  await c.env.DB.prepare(
    `INSERT INTO rules (id, code, brand_id, model_id, era_id, component_code, observation_key, check_json, polarity, severity, required, title_en, title_km, rationale, source_tier, citations_json, status, version, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
  ).bind(id, b.code, b.brandId, b.modelId, b.eraId, b.componentCode, b.observationKey, JSON.stringify(b.check), b.polarity, b.severity, b.required ? 1 : 0, b.titleEn, b.titleKm, b.rationale ?? null, b.sourceTier, JSON.stringify(b.citations), ver!.v, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'rule.create_draft', 'rule', id, { code: b.code, version: ver!.v });
  return c.json({ id, version: ver!.v });
});

app.post('/api/rules/:id/submit', need(STAFF), async (c) => {
  const r = await c.env.DB.prepare('SELECT status FROM rules WHERE id = ?').bind(c.req.param('id')).first<{ status: string }>();
  if (!r || r.status !== 'draft') return c.json({ error: 'not_a_draft' }, 409);
  await c.env.DB.prepare(`UPDATE rules SET status = 'pending_review', updated_at = ? WHERE id = ?`).bind(nowIso(), c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'rule.submit', 'rule', c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/api/rules/:id/review', need(REVIEWERS), async (c) => {
  const { decision, comment } = await parse(c, z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(2000).optional() }));
  const id = c.req.param('id'); const me = c.get('user');
  const r = await c.env.DB.prepare('SELECT status, author_id FROM rules WHERE id = ?').bind(id).first<{ status: string; author_id: string | null }>();
  if (!r || r.status !== 'pending_review') return c.json({ error: 'not_pending_review' }, 409);
  const required = await getSettingNumber(c.env, 'approvals_required', 2);
  // 4-eyes: the author can never approve their own rule — unless the owner explicitly lowered approvals_required to 1 (single-appraiser mode, audit-logged).
  if (r.author_id === me.id && required > 1) return c.json({ error: 'author_cannot_review_own_rule' }, 403);
  await c.env.DB.prepare('INSERT OR REPLACE INTO rule_approvals (rule_id, user_id, decision, comment) VALUES (?, ?, ?, ?)').bind(id, me.id, decision, comment ?? null).run();
  if (decision === 'reject') {
    await c.env.DB.prepare(`UPDATE rules SET status = 'draft', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  } else {
    const n = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM rule_approvals WHERE rule_id = ? AND decision = 'approve'`).bind(id).first<{ n: number }>();
    if ((n?.n ?? 0) >= required) await c.env.DB.prepare(`UPDATE rules SET status = 'approved', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
  }
  await audit(c.env, me.id, `rule.review_${decision}`, 'rule', id, { comment, required });
  const after = await c.env.DB.prepare('SELECT status FROM rules WHERE id = ?').bind(id).first<{ status: string }>();
  return c.json({ status: after?.status });
});

app.post('/api/rules/:id/retire', need(ADMINS), async (c) => {
  await c.env.DB.prepare(`UPDATE rules SET status = 'retired', updated_at = ? WHERE id = ?`).bind(nowIso(), c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'rule.retire', 'rule', c.req.param('id'));
  return c.json({ ok: true });
});

// decoding tables (data, not code)
app.get('/api/datecode', async (c) => {
  const [formats, factories, guides, lookups] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM datecode_formats ORDER BY brand_id, start_year').all(),
    c.env.DB.prepare('SELECT * FROM factory_codes ORDER BY brand_id, code').all(),
    // teaching cards and year-window lookups (Chanel serial series, Hermès letters); never read by the engine
    c.env.DB.prepare(`SELECT g.*, b.name AS brand FROM code_guides g JOIN brands b ON b.id = g.brand_id WHERE g.status <> 'retired' ORDER BY g.sort`).all(),
    c.env.DB.prepare(`SELECT * FROM code_lookups WHERE status <> 'retired' ORDER BY brand_id, sort`).all(),
  ]);
  return c.json({ formats: formats.results, factories: factories.results, guides: guides.results, lookups: lookups.results });
});
// ───────────────────────── style / article codes (e.g. MCM): part dictionary, known codes, AI web identification ─────────────────────────
app.get('/api/style-codes', async (c) => {
  const brandId = c.req.query('brandId') ?? '';
  const brand = await c.env.DB.prepare('SELECT id, slug, name FROM brands WHERE id = ?').bind(brandId).first<{ id: string; slug: string; name: string }>();
  if (!brand) return c.json({ error: 'not_found' }, 404);
  const [parts, codes] = await Promise.all([
    c.env.DB.prepare(`SELECT field, code, meaning_en, meaning_km, year, status FROM style_code_parts WHERE brand_id = ? AND status <> 'retired'`).bind(brand.id).all(),
    c.env.DB.prepare(`SELECT id, code, model_name, colour_name, product_url, source, sources_json, notes, status, created_at FROM style_codes WHERE brand_id = ? AND status <> 'retired' ORDER BY code`).bind(brand.id).all(),
  ]);
  return c.json({ brand, parts: parts.results, codes: codes.results, aiWeb: aiProvider(c.env) === 'anthropic' });
});

// Find the model for a code: the database first, then (once per code) Claude's web search. AI results are saved as DRAFT.
app.post('/api/style-codes/identify', async (c) => {
  const { brandId, code, hint } = await parse(c, z.object({ brandId: z.string(), code: z.string().min(3).max(40), hint: z.string().max(400).optional() }));
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const brand = await c.env.DB.prepare('SELECT id, name FROM brands WHERE id = ?').bind(brandId).first<{ id: string; name: string }>();
  if (!brand || norm.length < 3) return c.json({ error: 'bad_request' }, 400);
  const known = await c.env.DB.prepare(`SELECT * FROM style_codes WHERE brand_id = ? AND code = ? AND status <> 'retired'`).bind(brand.id, norm).first();
  if (known) return c.json({ match: known, from: 'database' });
  if (aiProvider(c.env) !== 'anthropic') return c.json({ error: 'ai_web_not_configured' }, 501);
  let r;
  try { r = await identifyStyleCode(c.env, brand.name, norm, hint ?? '', reqLang(c)); }
  catch (e) { return c.json({ error: 'ai_failed', detail: String((e as Error).message ?? e).slice(0, 200) }, 502); }
  if (!r.found) return c.json({ match: null, from: 'ai_web', note: r.note, sources: r.sources });
  const id = 'sc_' + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO style_codes (id, brand_id, code, model_name, colour_name, product_url, source, sources_json, notes, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'ai_web', ?, ?, 'draft', ?)`,
  ).bind(id, brand.id, norm, r.model_name, r.colour, r.product_url, JSON.stringify(r.sources), r.note, c.get('user').id).run();
  const saved = await c.env.DB.prepare('SELECT * FROM style_codes WHERE brand_id = ? AND code = ?').bind(brand.id, norm).first();
  return c.json({ match: saved, from: 'ai_web' });
});

app.post('/api/style-codes/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['draft', 'approved', 'retired']) }));
  const r = await c.env.DB.prepare('UPDATE style_codes SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

app.post('/api/datecode/formats/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['draft', 'approved', 'retired']) }));
  await c.env.DB.prepare('UPDATE datecode_formats SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  await audit(c.env, c.get('user').id, `datecode_format.${status}`, 'datecode_format', c.req.param('id'));
  return c.json({ ok: true });
});
app.post('/api/datecode/factories', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ brandId: z.string(), code: z.string().min(1).max(4), country: z.string().optional(), location: z.string().optional(), notes: z.string().optional() }));
  const id = uid('fc_');
  await c.env.DB.prepare(`INSERT INTO factory_codes (id, brand_id, code, country, location, notes, status) VALUES (?, ?, ?, ?, ?, ?, 'draft')`)
    .bind(id, b.brandId, b.code.toUpperCase(), b.country ?? null, b.location ?? null, b.notes ?? null).run();
  await audit(c.env, c.get('user').id, 'factory_code.create_draft', 'factory_code', id, b);
  return c.json({ id });
});
app.post('/api/datecode/factories/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['draft', 'approved', 'retired']) }));
  await c.env.DB.prepare('UPDATE factory_codes SET status = ? WHERE id = ?').bind(status, c.req.param('id')).run();
  await audit(c.env, c.get('user').id, `factory_code.${status}`, 'factory_code', c.req.param('id'));
  return c.json({ ok: true });
});

// ───────────────────────── coverage: what data is still missing per model × era ─────────────────────────
app.get('/api/coverage', async (c) => {
  const t = {
    minApprovedRules: 3,
    retrievalMinAuthentic: await getSettingNumber(c.env, 'retrieval_min_authentic_per_model_era', 5),
    finetuneMinAuthentic: await getSettingNumber(c.env, 'finetune_min_authentic_per_model_era', 30),
    finetuneMinCounterfeit: await getSettingNumber(c.env, 'finetune_min_counterfeit_per_model_era', 10),
  };
  const models = (await c.env.DB.prepare('SELECT m.id, m.name, m.brand_id, b.name AS brand_name FROM models m JOIN brands b ON b.id = m.brand_id ORDER BY b.name, m.name').all<Record<string, any>>()).results;
  const eras = (await c.env.DB.prepare('SELECT * FROM eras').all<Record<string, any>>()).results;
  const rules = (await c.env.DB.prepare(`SELECT brand_id, model_id, era_id FROM rules WHERE status = 'approved'`).all<Record<string, any>>()).results;
  const assets = (await c.env.DB.prepare(`SELECT era_id, label, COUNT(*) AS n FROM reference_assets WHERE status = 'approved' GROUP BY era_id, label`).all<Record<string, any>>()).results;
  const fmts = (await c.env.DB.prepare(`SELECT brand_id, COUNT(*) AS n FROM datecode_formats WHERE status = 'approved' GROUP BY brand_id`).all<Record<string, any>>()).results;
  const out = models.map((m) => {
    const ce: CoverageEra[] = eras.filter((e) => e.model_id === m.id).map((e) => ({
      eraId: e.id, eraName: e.name, eraStatus: e.status, identifierType: e.identifier_type,
      approvedRules: rules.filter((r) => r.brand_id === m.brand_id && (r.model_id === null || r.model_id === m.id) && (r.era_id === null || r.era_id === e.id)).length,
      approvedAuthenticAssets: assets.find((a) => a.era_id === e.id && a.label === 'authentic')?.n ?? 0,
      approvedCounterfeitAssets: assets.find((a) => a.era_id === e.id && a.label === 'counterfeit')?.n ?? 0,
      approvedDateCodeFormats: fmts.find((f) => f.brand_id === m.brand_id)?.n ?? 0,
    }));
    return { modelId: m.id, modelName: m.name, brandName: m.brand_name, rows: coverageForModel(ce, t) };
  });
  return c.json({ thresholds: t, models: out });
});

// ───────────────────────── inspections ─────────────────────────
app.get('/api/inspections', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.ref_code, i.status, i.outcome, i.created_at, i.item_ref, b.name AS brand, m.name AS model,
            (SELECT COUNT(*) FROM captures c WHERE c.inspection_id = i.id) AS captures
     FROM inspections i JOIN brands b ON b.id = i.brand_id JOIN models m ON m.id = i.model_id ORDER BY i.created_at DESC LIMIT 200`,
  ).all();
  return c.json(results);
});

app.get('/api/dashboard', async (c) => {
  const q = (sql: string) => c.env.DB.prepare(sql).first<{ n: number }>().then((r) => r?.n ?? 0);
  const [total, awaiting, review, signed, pendingRules, quarantined, providersConnected] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM inspections'),
    q(`SELECT COUNT(*) AS n FROM inspections WHERE status IN ('draft','awaiting_evidence')`),
    q(`SELECT COUNT(*) AS n FROM inspections WHERE outcome = 'requires_expert_review' AND status <> 'signed_off'`),
    q(`SELECT COUNT(*) AS n FROM inspections WHERE status = 'signed_off'`),
    q(`SELECT COUNT(*) AS n FROM rules WHERE status = 'pending_review'`),
    q(`SELECT COUNT(*) AS n FROM reference_assets WHERE status = 'quarantine'`),
    q(`SELECT COUNT(*) AS n FROM providers WHERE status = 'connected'`),
  ]);
  const byOutcome = (await c.env.DB.prepare(`SELECT outcome, COUNT(*) AS n FROM inspections WHERE outcome IS NOT NULL GROUP BY outcome`).all()).results;
  return c.json({ total, awaiting, review, signed, pendingRules, quarantined, providersConnected, byOutcome });
});

app.post('/api/inspections', need(STAFF), async (c) => {
  const b = await parse(c, z.object({
    brandId: z.string(), modelId: z.string(), eraId: z.string().nullable().default(null), claimedYear: z.number().int().min(1850).max(2100).nullable().default(null),
    itemRef: z.string().max(200).optional(), customerRef: z.string().max(200).optional(),
  }));
  const id = uid('i_');
  const n = await c.env.DB.prepare('SELECT COUNT(*)+1 AS n FROM inspections').first<{ n: number }>();
  const ref = `HZ-${new Date().getUTCFullYear()}-${String(n!.n).padStart(5, '0')}`;
  await c.env.DB.prepare(`INSERT INTO inspections (id, ref_code, created_by, brand_id, model_id, era_id, claimed_year, item_ref, customer_ref, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_evidence')`)
    .bind(id, ref, c.get('user').id, b.brandId, b.modelId, b.eraId, b.claimedYear, b.itemRef ?? null, b.customerRef ?? null).run();
  await audit(c.env, c.get('user').id, 'inspection.create', 'inspection', id, { ref });
  return c.json({ id, refCode: ref });
});

app.get('/api/inspections/:id', async (c) => {
  const id = c.req.param('id');
  const insp = await c.env.DB.prepare(
    `SELECT i.*, b.name AS brand, m.name AS model FROM inspections i JOIN brands b ON b.id = i.brand_id JOIN models m ON m.id = i.model_id WHERE i.id = ?`,
  ).bind(id).first<Record<string, any>>();
  if (!insp) return c.json({ error: 'not_found' }, 404);
  const [captures, observations, evaluation, templates, defs, marks] = await Promise.all([
    c.env.DB.prepare('SELECT id, template_code, mime, bytes, width, height, quality_json, created_at FROM captures WHERE inspection_id = ? ORDER BY created_at').bind(id).all(),
    c.env.DB.prepare('SELECT id, capture_id, component_code, key, value_json, source, confidence, entered_by, created_at FROM observations WHERE inspection_id = ? ORDER BY created_at').bind(id).all(),
    c.env.DB.prepare('SELECT id, engine_version, outcome, detail_json, rules_snapshot_hash, created_at FROM evaluations WHERE inspection_id = ? ORDER BY created_at DESC LIMIT 1').bind(id).first(),
    resolveTemplates(c.env, insp.brand_id, insp.model_id),
    c.env.DB.prepare('SELECT * FROM observation_defs ORDER BY component_code, key').all(),
    // tolerate a deploy that lands before migration 0006: the page still works, just without analysis points
    c.env.DB.prepare('SELECT id, capture_id, x, y, w, h, label, note, source, created_at FROM capture_marks WHERE inspection_id = ? ORDER BY created_at').bind(id).all()
      .catch(() => ({ results: [] })),
  ]);
  return c.json({ inspection: insp, captures: captures.results, observations: observations.results, evaluation, templates, observationDefs: defs.results, marks: marks.results });
});

app.post('/api/inspections/:id/captures', need(STAFF), async (c) => {
  const id = c.req.param('id');
  const form = await c.req.formData();
  const file = form.get('file'); const templateCode = String(form.get('templateCode') ?? '');
  if (!(file instanceof File) || !templateCode) return c.json({ error: 'file_and_templateCode_required' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large', maxBytes: MAX_IMAGE_BYTES }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf, 0, 16));
  if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
  const sha = await sha256Hex(buf);
  const capId = uid('c_'); const key = `inspections/${id}/${capId}`;
  const quality = String(form.get('quality') ?? '') || null;
  await c.env.VAULT.put(key, buf, { httpMetadata: { contentType: mime }, customMetadata: { sha256: sha } });
  await c.env.DB.prepare('INSERT INTO captures (id, inspection_id, template_code, r2_key, sha256, mime, bytes, width, height, quality_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(capId, id, templateCode, key, sha, mime, buf.byteLength, Number(form.get('width')) || null, Number(form.get('height')) || null, quality).run();
  await audit(c.env, c.get('user').id, 'capture.upload', 'capture', capId, { inspection: id, templateCode, sha256: sha });
  return c.json({ id: capId, sha256: sha });
});

app.get('/api/captures/:id/image', async (c) => {
  const row = await c.env.DB.prepare('SELECT r2_key, mime FROM captures WHERE id = ?').bind(c.req.param('id')).first<{ r2_key: string; mime: string }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(row.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=300' } });
});

app.post('/api/inspections/:id/observations', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ key: z.string(), value: z.union([z.string(), z.number(), z.boolean()]), captureId: z.string().nullable().default(null) }));
  const def = await c.env.DB.prepare('SELECT * FROM observation_defs WHERE key = ?').bind(b.key).first<Record<string, any>>();
  if (!def) return c.json({ error: 'unknown_observation_key' }, 400);
  if (def.value_type === 'enum' && !(JSON.parse(def.enum_json) as string[]).includes(String(b.value))) return c.json({ error: 'value_not_allowed' }, 400);
  if (def.value_type === 'number' && typeof b.value !== 'number') return c.json({ error: 'number_required' }, 400);
  if (def.value_type === 'boolean' && typeof b.value !== 'boolean') return c.json({ error: 'boolean_required' }, 400);
  const id = uid('o_');
  await c.env.DB.prepare(`INSERT INTO observations (id, inspection_id, capture_id, component_code, key, value_json, source, entered_by) VALUES (?, ?, ?, ?, ?, ?, 'appraiser', ?)`)
    .bind(id, c.req.param('id'), b.captureId, def.component_code, b.key, JSON.stringify(b.value), c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'observation.add', 'observation', id, { inspection: c.req.param('id'), key: b.key });
  return c.json({ id });
});

app.post('/api/observations/:id/confirm', need(STAFF), async (c) => {
  const o = await c.env.DB.prepare(`SELECT * FROM observations WHERE id = ? AND source = 'ai_suggested'`).bind(c.req.param('id')).first<Record<string, any>>();
  if (!o) return c.json({ error: 'not_an_ai_suggestion' }, 404);
  const { value } = await parse(c, z.object({ value: z.union([z.string(), z.number(), z.boolean()]).optional() }));
  const id = uid('o_');
  await c.env.DB.prepare(`INSERT INTO observations (id, inspection_id, capture_id, component_code, key, value_json, source, confidence, entered_by) VALUES (?, ?, ?, ?, ?, ?, 'ai_confirmed', ?, ?)`)
    .bind(id, o.inspection_id, o.capture_id, o.component_code, o.key, value === undefined ? o.value_json : JSON.stringify(value), o.confidence, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'observation.confirm_ai', 'observation', id, { from: o.id, edited: value !== undefined });
  return c.json({ id });
});

app.post('/api/captures/:id/suggest', need(STAFF), async (c) => {
  const cap = await c.env.DB.prepare('SELECT c.*, t.component_code FROM captures c LEFT JOIN capture_templates t ON t.code = c.template_code WHERE c.id = ? LIMIT 1').bind(c.req.param('id')).first<Record<string, any>>();
  if (!cap) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(cap.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const defs = (await c.env.DB.prepare('SELECT key, value_type, enum_json, label_en FROM observation_defs WHERE component_code = ?').bind(cap.component_code).all<any>()).results;
  try {
    const sugg = await suggestObservations(c.env, await obj.arrayBuffer(), cap.mime, defs);
    for (const s of sugg) {
      const def = await c.env.DB.prepare('SELECT component_code FROM observation_defs WHERE key = ?').bind(s.key).first<{ component_code: string }>();
      await c.env.DB.prepare(`INSERT INTO observations (id, inspection_id, capture_id, component_code, key, value_json, source, confidence) VALUES (?, ?, ?, ?, ?, ?, 'ai_suggested', ?)`)
        .bind(uid('o_'), cap.inspection_id, cap.id, def!.component_code, s.key, JSON.stringify(s.value), s.confidence).run();
    }
    await audit(c.env, c.get('user').id, 'capture.ai_suggest', 'capture', cap.id, { count: sugg.length });
    return c.json({ suggestions: sugg.length });
  } catch (e) {
    if ((e as Error).message === 'ai_not_configured') return c.json({ error: 'ai_not_configured' }, 501);
    return c.json({ error: 'ai_failed', detail: (e as Error).message }, 502);
  }
});

// ───────────────────────── side-by-side: approved authentic references vs one inspected photo ─────────────────────────
async function referenceCandidates(env: AppEnv['Bindings'], captureId: string) {
  const cap = await env.DB.prepare(
    `SELECT c.id, c.inspection_id, c.r2_key, c.mime, c.template_code, i.brand_id, i.model_id, i.era_id,
            (SELECT t.component_code FROM capture_templates t WHERE t.code = c.template_code LIMIT 1) AS component_code
     FROM captures c JOIN inspections i ON i.id = c.inspection_id WHERE c.id = ?`,
  ).bind(captureId).first<Record<string, any>>();
  if (!cap) return null;
  return { cap, refs: await approvedReferences(env, cap.brand_id, cap.model_id, cap.era_id, cap.component_code) };
}

/** Approved authentic reference photos for a scope, most specific first. Never includes quarantined or unlabelled assets. */
async function approvedReferences(env: AppEnv['Bindings'], brandId: string, modelId: string | null, eraId: string | null, component: string | null) {
  return (await env.DB.prepare(
    `SELECT id, model_id, era_id, component_code, label_basis, license FROM reference_assets
     WHERE status = 'approved' AND label = 'authentic' AND brand_id = ?1
       AND (model_id IS NULL OR model_id = ?2) AND (era_id IS NULL OR ?3 IS NULL OR era_id = ?3)
       AND (component_code IS NULL OR ?4 IS NULL OR component_code = ?4)
     ORDER BY (model_id = ?2) DESC, (era_id = ?3) DESC, (component_code = ?4) DESC, created_at DESC LIMIT 12`,
  ).bind(brandId, modelId, eraId, component).all<Record<string, any>>()).results;
}

// Approved examples for the guided scan's "how to look" panel (same scope as the side-by-side comparator).
app.get('/api/inspections/:id/references', async (c) => {
  const insp = await c.env.DB.prepare('SELECT brand_id, model_id, era_id FROM inspections WHERE id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!insp) return c.json({ error: 'not_found' }, 404);
  const component = c.req.query('component') || null;
  const refs = await approvedReferences(c.env, insp.brand_id, insp.model_id, insp.era_id, component);
  return c.json({ component, candidates: refs, aiConfigured: aiConfigured(c.env) });
});

// ───────────────────────── analysis points (marks): annotation only, never read by the engine ─────────────────────────
async function markableCapture(env: AppEnv['Bindings'], captureId: string) {
  return env.DB.prepare(
    `SELECT c.id, c.inspection_id, c.r2_key, c.mime, c.template_code, i.status,
            (SELECT t.component_code FROM capture_templates t WHERE t.code = c.template_code LIMIT 1) AS component_code,
            (SELECT t.label_en FROM capture_templates t WHERE t.code = c.template_code LIMIT 1) AS shot
     FROM captures c JOIN inspections i ON i.id = c.inspection_id WHERE c.id = ?`,
  ).bind(captureId).first<Record<string, any>>();
}

app.post('/api/captures/:id/marks', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), label: z.string().trim().min(1).max(80), note: z.string().max(500).optional() }));
  if (!isValidRect(b)) return c.json({ error: 'invalid_rect' }, 400);
  const cap = await markableCapture(c.env, c.req.param('id'));
  if (!cap) return c.json({ error: 'not_found' }, 404);
  if (cap.status === 'signed_off') return c.json({ error: 'inspection_signed_off' }, 409);
  const id = uid('mk_');
  await c.env.DB.prepare(`INSERT INTO capture_marks (id, capture_id, inspection_id, x, y, w, h, label, note, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'appraiser', ?)`)
    .bind(id, cap.id, cap.inspection_id, b.x, b.y, b.w, b.h, b.label, b.note ?? null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'mark.add', 'capture', cap.id, { mark: id, label: b.label });
  return c.json({ id });
});

app.delete('/api/marks/:id', need(STAFF), async (c) => {
  const m = await c.env.DB.prepare('SELECT m.id, m.capture_id, m.label, i.status FROM capture_marks m JOIN inspections i ON i.id = m.inspection_id WHERE m.id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!m) return c.json({ error: 'not_found' }, 404);
  if (m.status === 'signed_off') return c.json({ error: 'inspection_signed_off' }, 409);
  await c.env.DB.prepare('DELETE FROM capture_marks WHERE id = ?').bind(m.id).run();
  await audit(c.env, c.get('user').id, 'mark.delete', 'capture', m.capture_id, { mark: m.id, label: m.label });
  return c.json({ ok: true });
});

app.post('/api/captures/:id/marks/suggest', need(STAFF), async (c) => {
  const cap = await markableCapture(c.env, c.req.param('id'));
  if (!cap) return c.json({ error: 'not_found' }, 404);
  if (cap.status === 'signed_off') return c.json({ error: 'inspection_signed_off' }, 409);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const obj = await c.env.VAULT.get(cap.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  try {
    const sugg = await suggestFocusRegions(c.env, { data: await obj.arrayBuffer(), mime: cap.mime }, cap.component_code ?? 'unspecified', cap.shot ?? cap.template_code);
    for (const s of sugg) {
      await c.env.DB.prepare(`INSERT INTO capture_marks (id, capture_id, inspection_id, x, y, w, h, label, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai_suggested')`)
        .bind(uid('mk_'), cap.id, cap.inspection_id, s.x, s.y, s.w, s.h, s.label).run();
    }
    await audit(c.env, c.get('user').id, 'mark.ai_suggest', 'capture', cap.id, { count: sugg.length });
    return c.json({ suggestions: sugg.length });
  } catch (e) {
    return c.json({ error: 'ai_failed', detail: (e as Error).message }, 502);
  }
});

app.get('/api/captures/:id/references', async (c) => {
  const r = await referenceCandidates(c.env, c.req.param('id'));
  if (!r) return c.json({ error: 'not_found' }, 404);
  const history = (await c.env.DB.prepare('SELECT id, asset_ids_json, result_json, model, created_at FROM comparisons WHERE capture_id = ? ORDER BY created_at DESC LIMIT 5').bind(c.req.param('id')).all()).results;
  return c.json({ component: r.cap.component_code, candidates: r.refs, history, aiConfigured: aiConfigured(c.env) });
});

app.get('/api/assets/:id/image', async (c) => {
  const row = await c.env.DB.prepare('SELECT r2_key FROM reference_assets WHERE id = ?').bind(c.req.param('id')).first<{ r2_key: string }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(row.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'private, max-age=300' } });
});

app.post('/api/captures/:id/compare', need(STAFF), async (c) => {
  const { assetIds } = await parse(c, z.object({ assetIds: z.array(z.string()).max(4).optional() }));
  const r = await referenceCandidates(c.env, c.req.param('id'));
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const allowed = new Set(r.refs.map((x) => x.id));
  const chosen = (assetIds?.length ? assetIds.filter((id) => allowed.has(id)) : r.refs.slice(0, 3).map((x) => x.id));
  if (chosen.length === 0) return c.json({ error: 'no_approved_references' }, 409); // honest: no verified references yet → no comparison
  const insp = await c.env.VAULT.get(r.cap.r2_key);
  if (!insp) return c.json({ error: 'not_found' }, 404);
  const refImgs = [] as { data: ArrayBuffer; mime: string }[];
  for (const id of chosen) {
    const row = await c.env.DB.prepare('SELECT r2_key FROM reference_assets WHERE id = ?').bind(id).first<{ r2_key: string }>();
    const o = row && (await c.env.VAULT.get(row.r2_key));
    if (o) refImgs.push({ data: await o.arrayBuffer(), mime: o.httpMetadata?.contentType ?? 'image/jpeg' });
  }
  try {
    const out = await explainDifferences(c.env, { data: await insp.arrayBuffer(), mime: r.cap.mime }, refImgs, r.cap.component_code ?? 'unspecified', reqLang(c));
    const id = uid('cmp_');
    await c.env.DB.prepare('INSERT INTO comparisons (id, inspection_id, capture_id, asset_ids_json, result_json, model, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, r.cap.inspection_id, r.cap.id, JSON.stringify(chosen), JSON.stringify(out), aiModel(c.env), c.get('user').id).run();
    await audit(c.env, c.get('user').id, 'capture.ai_compare', 'capture', r.cap.id, { references: chosen.length, differences: out.differences.length });
    return c.json({ id, assetIds: chosen, ...out });
  } catch (e) {
    return c.json({ error: 'ai_failed', detail: (e as Error).message }, 502);
  }
});

app.post('/api/inspections/:id/evaluate', need(STAFF), async (c) => {
  const r = await runEvaluation(c.env, c.req.param('id'), c.get('user').id);
  await audit(c.env, c.get('user').id, 'inspection.evaluate', 'inspection', c.req.param('id'), { outcome: r.outcome, evaluationId: r.evaluationId, rulesSnapshotHash: r.rulesSnapshotHash });
  return c.json(r);
});

app.post('/api/inspections/:id/signoff', need(ADMINS.concat(['appraiser'])), async (c) => {
  const { note } = await parse(c, z.object({ note: z.string().min(10).max(4000) }));
  const insp = await c.env.DB.prepare('SELECT outcome, status FROM inspections WHERE id = ?').bind(c.req.param('id')).first<{ outcome: string | null; status: string }>();
  if (!insp?.outcome) return c.json({ error: 'evaluate_first' }, 409);
  await c.env.DB.prepare(`UPDATE inspections SET status = 'signed_off', signed_off_by = ?, signed_off_at = ?, signoff_note = ? WHERE id = ?`)
    .bind(c.get('user').id, nowIso(), note, c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'inspection.signoff', 'inspection', c.req.param('id'), { outcome: insp.outcome });
  return c.json({ ok: true });
});

// ───────────────────────── reference library (quarantine → review → approved) ─────────────────────────
app.get('/api/assets', async (c) =>
  c.json((await c.env.DB.prepare('SELECT id, brand_id, model_id, era_id, component_code, label, label_basis, license, status, created_at FROM reference_assets ORDER BY created_at DESC LIMIT 300').all()).results));

// ───────────────────────── AI: cut one composite image (comparison chart) into its separate photos ─────────────────────────
// Returns rectangles only; the browser crops, and the admin reviews every piece before anything is uploaded.
app.post('/api/ai/crop-regions', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf, 0, 16));
  if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
  const parts = (await c.env.DB.prepare('SELECT code FROM components').all<{ code: string }>()).results.map((r) => r.code);
  try {
    return c.json({ regions: await findPhotoRegions(c.env, { data: buf, mime }, parts), model: aiModel(c.env) });
  } catch (e) {
    return c.json({ error: 'ai_failed', detail: String((e as Error).message ?? e).slice(0, 200) }, 502);
  }
});

app.post('/api/assets', need(STAFF), async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf, 0, 16));
  if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
  const meta = z.object({
    brandId: z.string(), modelId: z.string().optional(), eraId: z.string().optional(), componentCode: z.string().optional(),
    label: z.enum(['authentic', 'counterfeit', 'unknown']), labelBasis: z.enum(['purchase_receipt', 'brand_boutique', 'provider_certificate', 'expert_consensus', 'seller_claim', 'unverified']),
    license: z.enum(['own', 'consented', 'licensed', 'public_domain', 'unknown']), consentRef: z.string().optional(), sourceUrl: z.string().optional(),
    purpose: z.enum(['general', 'model_set', 'study']).default('general'),
    slot: z.coerce.number().int().min(1).max(MODEL_SET_SIZE).optional(),
    teachingTitle: z.string().max(120).optional(), teachingNote: z.string().max(4000).optional(), aiPrompt: z.string().max(2000).optional(),
    lessonStepId: z.string().optional(),
  }).parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));

  // A model teaching set holds up to MODEL_SET_SIZE photos of a KNOWN-GENUINE item, one per slot.
  if (meta.purpose === 'model_set') {
    if (!meta.modelId) return c.json({ error: 'model_required' }, 400);
    if (meta.label !== 'authentic') return c.json({ error: 'model_set_requires_genuine_reference' }, 400);
    const used = (await c.env.DB.prepare(`SELECT slot FROM reference_assets WHERE purpose = 'model_set' AND model_id = ? AND status <> 'rejected'`).bind(meta.modelId).all<{ slot: number | null }>()).results.map((r) => r.slot);
    if (used.length >= MODEL_SET_SIZE) return c.json({ error: 'model_set_full' }, 409);
    if (meta.slot == null) meta.slot = [1, 2, 3, 4, 5].find((n) => !used.includes(n));
    else if (used.includes(meta.slot)) return c.json({ error: 'slot_taken' }, 409);
  } else if (meta.slot != null) return c.json({ error: 'slot_only_for_model_set' }, 400);

  // A photo attached to a lesson step belongs to that step's model; the part defaults to the step's part.
  if (meta.lessonStepId) {
    const step = await c.env.DB.prepare('SELECT s.model_id, s.component_code, m.brand_id FROM lesson_steps s JOIN models m ON m.id = s.model_id WHERE s.id = ?').bind(meta.lessonStepId).first<Record<string, any>>();
    if (!step) return c.json({ error: 'lesson_step_not_found' }, 404);
    if (step.brand_id !== meta.brandId || (meta.modelId && meta.modelId !== step.model_id)) return c.json({ error: 'lesson_step_model_mismatch' }, 400);
    meta.modelId = step.model_id;
    meta.componentCode ??= step.component_code ?? undefined;
  }

  // Fewer approval steps: an owner / lead authenticator's upload is approved immediately when its provenance already
  // satisfies the database CHECK (known licence, label basis not a seller claim / unverified). Everything else waits in quarantine.
  const provenanceOk = meta.license !== 'unknown' && !['seller_claim', 'unverified'].includes(meta.labelBasis) && meta.label !== 'unknown';
  const status = ADMINS.includes(c.get('user').role) && provenanceOk ? 'approved' : 'quarantine';

  const id = uid('a_'); const key = `reference/${id}`; const sha = await sha256Hex(buf);
  await c.env.VAULT.put(key, buf, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare(`INSERT INTO reference_assets (id, brand_id, model_id, era_id, component_code, r2_key, sha256, label, label_basis, license, consent_ref, source_url, status, created_by, purpose, slot, teaching_title, teaching_note, ai_prompt, lesson_step_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, meta.brandId, meta.modelId ?? null, meta.eraId ?? null, meta.componentCode ?? null, key, sha, meta.label, meta.labelBasis, meta.license, meta.consentRef ?? null, meta.sourceUrl ?? null, status, c.get('user').id,
      meta.purpose, meta.slot ?? null, meta.teachingTitle || null, meta.teachingNote || null, meta.aiPrompt || null, meta.lessonStepId ?? null).run();
  await audit(c.env, c.get('user').id, status === 'approved' ? 'asset.upload_approved' : 'asset.upload_quarantine', 'asset', id, { label: meta.label, basis: meta.labelBasis, license: meta.license, purpose: meta.purpose, slot: meta.slot ?? null });
  return c.json({ id, status });
});

app.post('/api/assets/:id/review', need(REVIEWERS), async (c) => {
  const { decision } = await parse(c, z.object({ decision: z.enum(['approve', 'reject']) }));
  // the database CHECK constraint refuses 'approved' for unknown license / seller-claim labels
  await c.env.DB.prepare('UPDATE reference_assets SET status = ? WHERE id = ?').bind(decision === 'approve' ? 'approved' : 'rejected', c.req.param('id')).run();
  await audit(c.env, c.get('user').id, `asset.${decision}`, 'asset', c.req.param('id'));
  return c.json({ ok: true });
});


// ───────────────────────── learning studio: model teaching sets + study photos ─────────────────────────
// Teaching data (notes, AI prompts, points) is annotation only. The engine never reads it.
app.get('/api/studio', async (c) => {
  const [models, set, study, points] = await Promise.all([
    c.env.DB.prepare(`SELECT m.id, m.name, m.brand_id, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.status <> 'RETIRED' ORDER BY b.name, m.name`).all<Record<string, any>>(),
    c.env.DB.prepare(`SELECT id, model_id, slot, status, teaching_title, teaching_note IS NOT NULL AS has_note FROM reference_assets WHERE purpose = 'model_set' AND status <> 'rejected' ORDER BY slot`).all<Record<string, any>>(),
    c.env.DB.prepare(`SELECT model_id, label, COUNT(*) AS n FROM reference_assets WHERE purpose = 'study' AND status <> 'rejected' GROUP BY model_id, label`).all<Record<string, any>>(),
    c.env.DB.prepare(`SELECT p.asset_id, COUNT(*) AS n FROM reference_points p JOIN reference_assets a ON a.id = p.asset_id WHERE a.purpose = 'model_set' GROUP BY p.asset_id`).all<Record<string, any>>(),
  ]);
  const pts = new Map(points.results.map((r) => [r.asset_id, r.n]));
  const out = models.results.map((m) => ({
    ...m,
    set: set.results.filter((a) => a.model_id === m.id).map((a) => ({ ...a, points: pts.get(a.id) ?? 0 })),
    study: {
      genuine: study.results.find((r) => r.model_id === m.id && r.label === 'authentic')?.n ?? 0,
      counterfeit: study.results.find((r) => r.model_id === m.id && r.label === 'counterfeit')?.n ?? 0,
    },
  }));
  const recentStudy = (await c.env.DB.prepare(`SELECT a.id, a.model_id, a.label, a.label_basis, a.status, a.teaching_note, a.created_at, m.name AS model FROM reference_assets a LEFT JOIN models m ON m.id = a.model_id WHERE a.purpose = 'study' AND a.status <> 'rejected' ORDER BY a.created_at DESC LIMIT 12`).all()).results;
  return c.json({ setSize: MODEL_SET_SIZE, models: out, recentStudy, aiConfigured: aiConfigured(c.env) });
});

app.get('/api/studio/assets/:id', async (c) => {
  const a = await c.env.DB.prepare(`SELECT a.id, a.brand_id, a.model_id, a.component_code, a.label, a.label_basis, a.license, a.source_url, a.status, a.purpose, a.slot, a.teaching_title, a.teaching_note, a.ai_prompt, a.created_at, m.name AS model FROM reference_assets a LEFT JOIN models m ON m.id = a.model_id WHERE a.id = ?`).bind(c.req.param('id')).first<Record<string, any>>();
  if (!a) return c.json({ error: 'not_found' }, 404);
  const points = (await c.env.DB.prepare('SELECT id, x, y, w, h, label, note, i18n_json, source, created_at FROM reference_points WHERE asset_id = ? ORDER BY created_at').bind(a.id).all()).results;
  return c.json({ ...a, points, aiConfigured: aiConfigured(c.env) });
});

app.put('/api/assets/:id/teaching', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ teachingTitle: z.string().max(120).optional(), teachingNote: z.string().max(4000).optional(), aiPrompt: z.string().max(2000).optional() }));
  const r = await c.env.DB.prepare('UPDATE reference_assets SET teaching_title = ?, teaching_note = ?, ai_prompt = ? WHERE id = ?')
    .bind(b.teachingTitle || null, b.teachingNote || null, b.aiPrompt || null, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  await audit(c.env, c.get('user').id, 'asset.teaching_update', 'asset', c.req.param('id'));
  return c.json({ ok: true });
});

app.post('/api/assets/:id/points', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), label: z.string().trim().min(1).max(80), note: z.string().max(1000).optional() }));
  if (!isValidRect(b)) return c.json({ error: 'invalid_rect' }, 400);
  const a = await c.env.DB.prepare('SELECT id FROM reference_assets WHERE id = ?').bind(c.req.param('id')).first();
  if (!a) return c.json({ error: 'not_found' }, 404);
  const id = uid('rp_');
  await c.env.DB.prepare(`INSERT INTO reference_points (id, asset_id, x, y, w, h, label, note, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'appraiser', ?)`)
    .bind(id, c.req.param('id'), b.x, b.y, b.w, b.h, b.label, b.note || null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'reference_point.add', 'asset', c.req.param('id'), { point: id, label: b.label });
  return c.json({ id });
});

app.delete('/api/reference-points/:id', need(STAFF), async (c) => {
  const p = await c.env.DB.prepare('SELECT id, asset_id, label FROM reference_points WHERE id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('DELETE FROM reference_points WHERE id = ?').bind(p.id).run();
  await audit(c.env, c.get('user').id, 'reference_point.delete', 'asset', p.asset_id, { point: p.id, label: p.label });
  return c.json({ ok: true });
});

app.post('/api/assets/:id/points/suggest', need(STAFF), async (c) => {
  const a = await c.env.DB.prepare(`SELECT a.id, a.r2_key, a.brand_id, a.model_id, a.component_code, a.label, a.teaching_title, a.teaching_note, a.ai_prompt, m.name AS model, cp.name_en AS part, b.name AS brand
    FROM reference_assets a JOIN brands b ON b.id = a.brand_id LEFT JOIN models m ON m.id = a.model_id LEFT JOIN components cp ON cp.code = a.component_code WHERE a.id = ?`).bind(c.req.param('id')).first<Record<string, any>>();
  if (!a) return c.json({ error: 'not_found' }, 404);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const obj = await c.env.VAULT.get(a.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  // A counterfeit-labelled photo is compared with an approved genuine photo of the same brand and part (same model first).
  let reference: { data: ArrayBuffer; mime: string } | null = null;
  let referenceId: string | null = null;
  if (a.label === 'counterfeit' && a.component_code) {
    const ref = await c.env.DB.prepare(`SELECT id, r2_key FROM reference_assets WHERE brand_id = ? AND component_code = ? AND label = 'authentic' AND status = 'approved' AND id <> ?
      ORDER BY (model_id IS ?) DESC, created_at DESC LIMIT 1`).bind(a.brand_id, a.component_code, a.id, a.model_id).first<{ id: string; r2_key: string }>();
    const ro = ref && (await c.env.VAULT.get(ref.r2_key));
    if (ro) { reference = { data: await ro.arrayBuffer(), mime: ro.httpMetadata?.contentType ?? 'image/jpeg' }; referenceId = ref!.id; }
  }
  // For other photos: a genuine reference of the same part (same model first) helps the AI recognise what it sees.
  if (!reference && a.component_code) {
    const ref = await c.env.DB.prepare(`SELECT id, r2_key FROM reference_assets WHERE brand_id = ? AND component_code = ? AND label = 'authentic' AND status <> 'rejected' AND id <> ?
      ORDER BY (model_id IS ?) DESC, (status = 'approved') DESC, created_at DESC LIMIT 1`).bind(a.brand_id, a.component_code, a.id, a.model_id).first<{ id: string; r2_key: string }>();
    const ro = ref && (await c.env.VAULT.get(ref.r2_key));
    if (ro) { reference = { data: await ro.arrayBuffer(), mime: ro.httpMetadata?.contentType ?? 'image/jpeg' }; referenceId = ref!.id; }
  }
  // What HENGZ already teaches for this brand / model / part: curated (not AI) points, then the approved code guide.
  const curated = (await c.env.DB.prepare(`SELECT DISTINCT p.label, p.note FROM reference_points p JOIN reference_assets x ON x.id = p.asset_id
    WHERE x.brand_id = ? AND (x.component_code IS ? OR x.model_id IS ?) AND p.source <> 'ai_suggested' AND x.label <> 'counterfeit' AND x.id <> ?
    ORDER BY (x.model_id IS ?) DESC, (x.component_code IS ?) DESC LIMIT 12`)
    .bind(a.brand_id, a.component_code, a.model_id, a.id, a.model_id, a.component_code).all<{ label: string; note: string | null }>()).results;
  const guides = ['date_code', 'heat_stamp'].includes(a.component_code)
    ? (await c.env.DB.prepare(`SELECT title_en, where_en, body_en FROM code_guides WHERE brand_id = ? AND status = 'approved' ORDER BY sort LIMIT 3`).bind(a.brand_id).all<Record<string, string | null>>().catch(() => ({ results: [] as Record<string, string | null>[] }))).results
    : [];
  const knowledge = [
    ...curated.map((p) => `${p.label}${p.note ? `: ${p.note.split('\n')[0]}` : ''}`.slice(0, 220)),
    ...guides.map((g) => `${g.title_en}${g.where_en ? ` (where: ${g.where_en})` : ''}: ${g.body_en ?? ''}`.slice(0, 300)),
  ];
  const existing = (await c.env.DB.prepare('SELECT x, y, w, h, label FROM reference_points WHERE asset_id = ?').bind(a.id).all<{ x: number; y: number; w: number; h: number; label: string }>()).results;
  try {
    const sugg = await suggestTeachingPoints(c.env, { data: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? 'image/jpeg' },
      { model: a.model ?? 'unspecified', part: a.part, title: a.teaching_title, note: a.teaching_note, prompt: a.ai_prompt, label: a.label, reference, lang: reqLang(c),
        brand: a.brand, knowledge, existing });
    for (const s of sugg) {
      await c.env.DB.prepare(`INSERT INTO reference_points (id, asset_id, x, y, w, h, label, note, i18n_json, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_suggested')`)
        .bind(uid('rp_'), a.id, s.x, s.y, s.w, s.h, s.label, s.note ?? null, s.i18n ? JSON.stringify(s.i18n) : null).run();
    }
    await audit(c.env, c.get('user').id, 'reference_point.ai_suggest', 'asset', a.id, { count: sugg.length, comparedWith: referenceId });
    return c.json({ suggestions: sugg.length, comparedWith: referenceId });
  } catch (e) {
    return c.json({ error: 'ai_failed', detail: (e as Error).message }, 502);
  }
});


// ───────────────────────── date-code appearance (AI description of shape / size / font; never a verdict) ─────────────────────────
const DCA_REFS = 3;

/** Approved KNOWN-GENUINE date-code photos of the same brand (excluding the photo itself), newest first. */
async function dateCodeReferences(env: AppEnv['Bindings'], brandId: string, excludeAssetId: string | null) {
  return (await env.DB.prepare(
    `SELECT id, r2_key FROM reference_assets WHERE brand_id = ? AND component_code = 'date_code' AND label = 'authentic' AND status = 'approved' AND id <> ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(brandId, excludeAssetId ?? '', DCA_REFS).all<{ id: string; r2_key: string }>()).results;
}

async function runDateCodeAnalysis(c: any, target: { type: 'asset' | 'capture'; id: string; r2_key: string; mime: string; brand_id: string; brand: string; model: string | null; typed: string | null }) {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const obj = await c.env.VAULT.get(target.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  const refs = await dateCodeReferences(c.env, target.brand_id, target.type === 'asset' ? target.id : null);
  const refImgs = [] as { data: ArrayBuffer; mime: string }[];
  const used: string[] = [];
  for (const r of refs) {
    const o = await c.env.VAULT.get(r.r2_key);
    if (o) { refImgs.push({ data: await o.arrayBuffer(), mime: o.httpMetadata?.contentType ?? 'image/jpeg' }); used.push(r.id); }
  }
  try {
    const out = await analyzeDateCodeAppearance(c.env, { data: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? target.mime }, refImgs, { brand: target.brand, model: target.model, typed: target.typed, lang: reqLang(c) });
    if (!out) return c.json({ error: 'ai_unreadable_reply' }, 502);
    const id = uid('dca_');
    await c.env.DB.prepare('INSERT INTO datecode_analyses (id, target_type, target_id, brand_id, reference_ids_json, result_json, model, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, target.type, target.id, target.brand_id, JSON.stringify(used), JSON.stringify(out), aiModel(c.env), c.get('user').id).run();
    await audit(c.env, c.get('user').id, 'datecode.ai_appearance', target.type, target.id, { references: used.length });
    return c.json({ id, referenceIds: used, result: out, created_at: nowIso() });
  } catch (e) {
    return c.json({ error: 'ai_failed', detail: (e as Error).message }, 502);
  }
}

const latestDca = async (env: AppEnv['Bindings'], type: string, id: string) => {
  const r = await env.DB.prepare('SELECT id, reference_ids_json, result_json, model, created_at FROM datecode_analyses WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC LIMIT 1').bind(type, id).first<Record<string, any>>();
  return r ? { id: r.id, referenceIds: JSON.parse(r.reference_ids_json), result: JSON.parse(r.result_json), model: r.model, created_at: r.created_at } : null;
};

app.get('/api/assets/:id/datecode-analysis', async (c) => c.json({ analysis: await latestDca(c.env, 'asset', c.req.param('id')), aiConfigured: aiConfigured(c.env) }));
app.get('/api/captures/:id/datecode-analysis', async (c) => c.json({ analysis: await latestDca(c.env, 'capture', c.req.param('id')), aiConfigured: aiConfigured(c.env) }));

app.post('/api/assets/:id/datecode-analysis', need(STAFF), async (c) => {
  const a = await c.env.DB.prepare('SELECT a.id, a.r2_key, a.brand_id, b.name AS brand, m.name AS model, a.teaching_title FROM reference_assets a JOIN brands b ON b.id = a.brand_id LEFT JOIN models m ON m.id = a.model_id WHERE a.id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!a) return c.json({ error: 'not_found' }, 404);
  const { typed } = await parse(c, z.object({ typed: z.string().max(20).optional() }));
  return runDateCodeAnalysis(c, { type: 'asset', id: a.id, r2_key: a.r2_key, mime: 'image/jpeg', brand_id: a.brand_id, brand: a.brand, model: a.model, typed: typed ?? null });
});

app.post('/api/captures/:id/datecode-analysis', need(STAFF), async (c) => {
  const cap = await c.env.DB.prepare(
    `SELECT c.id, c.r2_key, c.mime, i.id AS inspection_id, i.brand_id, b.name AS brand, m.name AS model FROM captures c JOIN inspections i ON i.id = c.inspection_id JOIN brands b ON b.id = i.brand_id JOIN models m ON m.id = i.model_id WHERE c.id = ?`,
  ).bind(c.req.param('id')).first<Record<string, any>>();
  if (!cap) return c.json({ error: 'not_found' }, 404);
  const typed = await c.env.DB.prepare(`SELECT value_json FROM observations WHERE inspection_id = ? AND key = 'datecode.value' AND source IN ('appraiser','ai_confirmed') ORDER BY created_at DESC LIMIT 1`).bind(cap.inspection_id).first<{ value_json: string }>();
  let typedStr: string | null = null;
  try { typedStr = typed ? String(JSON.parse(typed.value_json)) : null; } catch { typedStr = null; }
  return runDateCodeAnalysis(c, { type: 'capture', id: cap.id, r2_key: cap.r2_key, mime: cap.mime, brand_id: cap.brand_id, brand: cap.brand, model: cap.model, typed: typedStr });
});


// ───────────────────────── lessons: step-by-step "how to look" per model (teaching only; never read by the engine) ─────────────────────────
const parseChecks = (j: string) => { try { const a = JSON.parse(j); return Array.isArray(a) ? a : []; } catch { return []; } };

app.get('/api/lessons', async (c) => {
  const rows = (await c.env.DB.prepare(
    `SELECT m.id, m.name, b.id AS brand_id, b.name AS brand,
            COUNT(DISTINCT s.id) AS steps,
            COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN s.id END) AS steps_with_photos,
            COUNT(DISTINCT a.id) AS photos,
            (SELECT a2.id FROM reference_assets a2 JOIN lesson_steps s2 ON s2.id = a2.lesson_step_id
              WHERE s2.model_id = m.id AND a2.label = 'authentic' AND a2.status <> 'rejected' ORDER BY s2.sort, a2.created_at LIMIT 1) AS cover_id
     FROM lesson_steps s JOIN models m ON m.id = s.model_id JOIN brands b ON b.id = m.brand_id
     LEFT JOIN reference_assets a ON a.lesson_step_id = s.id AND a.status <> 'rejected'
     WHERE s.status <> 'retired' GROUP BY m.id ORDER BY b.name, m.name`,
  ).all()).results;
  return c.json(rows);
});

app.get('/api/lessons/:modelId', async (c) => {
  const model = await c.env.DB.prepare('SELECT m.id, m.name, b.id AS brand_id, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.id = ?').bind(c.req.param('modelId')).first<Record<string, any>>();
  if (!model) return c.json({ error: 'not_found' }, 404);
  const steps = (await c.env.DB.prepare(`SELECT * FROM lesson_steps WHERE model_id = ? AND status <> 'retired' ORDER BY sort`).bind(model.id).all<Record<string, any>>()).results;
  const assets = (await c.env.DB.prepare(
    `SELECT a.id, a.lesson_step_id, a.label, a.label_basis, a.status, a.teaching_note, a.source_url, a.created_at FROM reference_assets a
     JOIN lesson_steps s ON s.id = a.lesson_step_id WHERE s.model_id = ? AND a.status <> 'rejected' ORDER BY a.created_at`,
  ).bind(model.id).all<Record<string, any>>()).results;
  const points = assets.length ? (await c.env.DB.prepare(
    `SELECT p.id, p.asset_id, p.x, p.y, p.w, p.h, p.label, p.note, p.i18n_json, p.source FROM reference_points p JOIN reference_assets a ON a.id = p.asset_id
     JOIN lesson_steps s ON s.id = a.lesson_step_id WHERE s.model_id = ? ORDER BY p.created_at`,
  ).bind(model.id).all<Record<string, any>>()).results : [];
  return c.json({
    model,
    aiConfigured: aiConfigured(c.env),
    steps: steps.map((s) => ({
      id: s.id, sort: s.sort, component_code: s.component_code, status: s.status, source_note: s.source_note,
      title_en: s.title_en, title_km: s.title_km, body_en: s.body_en, body_km: s.body_km, checks: parseChecks(s.checks_json),
      photos: assets.filter((a) => a.lesson_step_id === s.id).map((a) => ({ ...a, points: points.filter((p) => p.asset_id === a.id) })),
    })),
  });
});


// ───────────────────────── feed: uploaded photos as posts (newest first), with points and the latest date-code reading ─────────────────────────
const POST_COLS = `a.id, a.brand_id, b.name AS brand, a.model_id, m.name AS model, a.component_code, cp.name_en AS part_en, cp.name_km AS part_km,
            a.label, a.label_basis, a.status, a.purpose, a.teaching_title, a.teaching_note, a.lesson_step_id, a.created_at, u.name AS author`;
const POST_FROM = `FROM reference_assets a JOIN brands b ON b.id = a.brand_id LEFT JOIN models m ON m.id = a.model_id
     LEFT JOIN components cp ON cp.code = a.component_code LEFT JOIN users u ON u.id = a.created_by`;

/** Attach points, the latest date-code reading and (for counterfeit-labelled photos) a genuine reference to each post. */
async function buildPosts(c: any, page: Record<string, any>[]): Promise<Record<string, any>[]> {
  const ids = page.map((p) => p.id);
  const marks = ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)';
  const [points, readings, refs] = await Promise.all([
    ids.length ? c.env.DB.prepare(`SELECT id, asset_id, x, y, w, h, label, note, i18n_json, source FROM reference_points WHERE asset_id IN ${marks} ORDER BY created_at`).bind(...ids).all() : null,
    ids.length ? c.env.DB.prepare(`SELECT target_id, result_json, created_at FROM datecode_analyses WHERE target_type = 'asset' AND target_id IN ${marks} ORDER BY created_at DESC`).bind(...ids).all() : null,
    // one approved genuine photo per brand + part, to show beside counterfeit-labelled posts
    c.env.DB.prepare(`SELECT a.id, a.brand_id, a.component_code, a.model_id FROM reference_assets a WHERE a.label = 'authentic' AND a.status = 'approved' AND a.component_code IS NOT NULL ORDER BY a.created_at DESC LIMIT 200`).all(),
  ]) as [any, any, any];
  const out = page.map((p) => {
    const reading = readings?.results.find((r: any) => r.target_id === p.id);
    let transcription: string | null = null;
    try { transcription = reading ? (JSON.parse(reading.result_json).transcription || null) : null; } catch { transcription = null; }
    const pick = p.label === 'counterfeit' && p.component_code
      ? (refs.results.find((r: any) => r.brand_id === p.brand_id && r.component_code === p.component_code && r.model_id === p.model_id && r.id !== p.id)
        ?? refs.results.find((r: any) => r.brand_id === p.brand_id && r.component_code === p.component_code && r.id !== p.id))
      : null;
    return { ...p, points: points?.results.filter((x: any) => x.asset_id === p.id) ?? [], transcription, genuineRefId: pick?.id ?? null };
  });
  // self-healing translations: points shown here without Khmer + English get translated in the background,
  // so the next load shows the viewer's language (KH -> Khmer, EN -> English)
  const missing = (points?.results ?? []).filter((x: any) => !x.i18n_json).slice(0, 6);
  if (missing.length && aiConfigured(c.env)) {
    c.executionCtx.waitUntil((async () => {
      const tr = await translatePoints(c.env, missing.map((x: any) => ({ id: x.id, label: x.label, note: x.note })));
      for (const [id, v] of Object.entries(tr)) {
        await c.env.DB.prepare('UPDATE reference_points SET i18n_json = ? WHERE id = ? AND i18n_json IS NULL').bind(JSON.stringify(v), id).run();
      }
    })().catch(() => {}));
  }
  return out;
}

app.get('/api/feed', async (c) => {
  const q = c.req.query();
  const limit = Math.min(30, Math.max(1, Number(q.limit) || 10));
  const where: string[] = [`a.status <> 'rejected'`]; const args: unknown[] = [];
  if (q.brandId) { where.push('a.brand_id = ?'); args.push(q.brandId); }
  if (q.modelId) { where.push('a.model_id = ?'); args.push(q.modelId); }
  if (q.noModel) where.push('a.model_id IS NULL');
  if (q.before) { where.push('a.created_at < ?'); args.push(q.before); }
  const posts = (await c.env.DB.prepare(`SELECT ${POST_COLS} ${POST_FROM} WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ?`)
    .bind(...args, limit + 1).all<Record<string, any>>()).results;
  const more = posts.length > limit;
  const page = posts.slice(0, limit);
  const out = await buildPosts(c, page);
  return c.json({ posts: out, next: more ? page[page.length - 1].created_at : null, aiConfigured: aiConfigured(c.env) });
});

const ALBUM_PREVIEW = 12;
const guideOf = (row: { i18n_json: string; status: string; updated_at: string } | null | undefined) => {
  if (!row) return null;
  try { return { ...JSON.parse(row.i18n_json), status: row.status, updated_at: row.updated_at }; } catch { return null; }
};

/**
 * Home timeline, newest activity first, mixing three kinds of item:
 *  album   — every photo of one model (genuine / unlabelled), swipe through, with the model's study guide
 *  photo   — a single photo not filed under a model yet
 *  compare — a counterfeit-labelled photo, shown next to a genuine reference of the same part
 */
app.get('/api/feed/timeline', async (c) => {
  const q = c.req.query();
  const limit = Math.min(20, Math.max(1, Number(q.limit) || 6));
  const brand = q.brandId ? 'AND a.brand_id = ?' : '';
  const before = q.before ? 'WHERE at < ?' : '';
  const b = q.brandId ? [q.brandId] : [];
  const rows = (await c.env.DB.prepare(
    `SELECT * FROM (
       SELECT 'album' AS kind, a.model_id AS key, MAX(a.created_at) AS at FROM reference_assets a
         WHERE a.status <> 'rejected' AND a.model_id IS NOT NULL AND a.label <> 'counterfeit' ${brand} GROUP BY a.model_id
       UNION ALL
       SELECT 'photo', a.id, a.created_at FROM reference_assets a WHERE a.status <> 'rejected' AND a.model_id IS NULL AND a.label <> 'counterfeit' ${brand}
       UNION ALL
       SELECT 'compare', a.id, a.created_at FROM reference_assets a WHERE a.status <> 'rejected' AND a.label = 'counterfeit' ${brand}
     ) ${before} ORDER BY at DESC LIMIT ?`,
  ).bind(...b, ...b, ...b, ...(q.before ? [q.before] : []), limit + 1).all<{ kind: string; key: string; at: string }>()).results;
  const more = rows.length > limit;
  const page = rows.slice(0, limit);

  const single = page.filter((r) => r.kind !== 'album').map((r) => r.key);
  const albumIds = page.filter((r) => r.kind === 'album').map((r) => r.key);
  const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');
  const [singleRows, albumRows, totals, guides, covers] = await Promise.all([
    single.length ? c.env.DB.prepare(`SELECT ${POST_COLS} ${POST_FROM} WHERE a.id IN (${ph(single.length)})`).bind(...single).all<Record<string, any>>() : null,
    // first photos of each album, oldest first so the overview photo leads
    albumIds.length ? c.env.DB.prepare(`SELECT * FROM (SELECT ${POST_COLS}, ROW_NUMBER() OVER (PARTITION BY a.model_id ORDER BY a.created_at) AS n ${POST_FROM}
       WHERE a.status <> 'rejected' AND a.label <> 'counterfeit' AND a.model_id IN (${ph(albumIds.length)})) WHERE n <= ${ALBUM_PREVIEW} ORDER BY created_at`).bind(...albumIds).all<Record<string, any>>() : null,
    albumIds.length ? c.env.DB.prepare(`SELECT model_id, COUNT(*) AS n FROM reference_assets WHERE status <> 'rejected' AND label <> 'counterfeit' AND model_id IN (${ph(albumIds.length)}) GROUP BY model_id`).bind(...albumIds).all<{ model_id: string; n: number }>() : null,
    albumIds.length ? c.env.DB.prepare(`SELECT model_id, i18n_json, status, updated_at FROM model_guides WHERE model_id IN (${ph(albumIds.length)})`).bind(...albumIds).all<any>().catch(() => ({ results: [] })) : null,
    albumIds.length ? c.env.DB.prepare(`SELECT id, cover_asset_id FROM models WHERE id IN (${ph(albumIds.length)})`).bind(...albumIds).all<{ id: string; cover_asset_id: string | null }>().catch(() => ({ results: [] as { id: string; cover_asset_id: string | null }[] })) : null,
  ]);
  const posts = await buildPosts(c, [...(singleRows?.results ?? []), ...(albumRows?.results ?? [])]);
  const items = page.map((r) => {
    if (r.kind !== 'album') return { kind: r.kind, at: r.at, post: posts.find((p) => p.id === r.key) };
    const photos = posts.filter((p) => p.model_id === r.key && (albumRows?.results ?? []).some((x) => x.id === p.id));
    return {
      kind: 'album', at: r.at,
      album: { model_id: r.key, model: photos[0]?.model ?? '', brand_id: photos[0]?.brand_id, brand: photos[0]?.brand ?? '',
        total: totals?.results.find((t) => t.model_id === r.key)?.n ?? photos.length, photos,
        guide: guideOf(guides?.results.find((g: any) => g.model_id === r.key)),
        cover_id: covers?.results.find((m) => m.id === r.key)?.cover_asset_id ?? null },
    };
  }).filter((x: any) => x.post || x.album);
  return c.json({ items, next: more ? page[page.length - 1].at : null, aiConfigured: aiConfigured(c.env) });
});

/** One album: all its photos with points, the study guide and other models of the same brand. */
app.get('/api/albums/:modelId', async (c) => {
  const id = c.req.param('modelId');
  const model = await c.env.DB.prepare('SELECT m.id, m.name, m.brand_id, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.id = ?').bind(id).first<Record<string, any>>();
  if (!model) return c.json({ error: 'not_found' }, 404);
  model.cover_asset_id = (await c.env.DB.prepare('SELECT cover_asset_id FROM models WHERE id = ?').bind(id).first<{ cover_asset_id: string | null }>().catch(() => null))?.cover_asset_id ?? null;
  const rows = (await c.env.DB.prepare(`SELECT ${POST_COLS} ${POST_FROM} WHERE a.status <> 'rejected' AND a.model_id = ? ORDER BY (a.label = 'counterfeit'), a.created_at LIMIT 80`).bind(id).all<Record<string, any>>()).results;
  const [photos, guide, similar] = await Promise.all([
    buildPosts(c, rows),
    c.env.DB.prepare('SELECT i18n_json, status, updated_at FROM model_guides WHERE model_id = ?').bind(id).first<any>().catch(() => null),
    c.env.DB.prepare(`SELECT m.id, m.name, COUNT(a.id) AS photos, (SELECT x.id FROM reference_assets x WHERE x.model_id = m.id AND x.status <> 'rejected' ORDER BY x.created_at LIMIT 1) AS cover
       FROM models m JOIN reference_assets a ON a.model_id = m.id AND a.status <> 'rejected'
       WHERE m.brand_id = ? AND m.id <> ? GROUP BY m.id ORDER BY MAX(a.created_at) DESC LIMIT 12`).bind(model.brand_id, id).all(),
  ]);
  return c.json({ model, photos, guide: guideOf(guide), similar: similar.results, aiConfigured: aiConfigured(c.env) });
});

/** Staff choose the album's large photo (the whole bag). */
app.put('/api/albums/:modelId/cover', need(STAFF), async (c) => {
  const { assetId } = await parse(c, z.object({ assetId: z.string().min(1).nullable() }));
  const id = c.req.param('modelId');
  if (assetId) {
    const a = await c.env.DB.prepare('SELECT model_id FROM reference_assets WHERE id = ?').bind(assetId).first<{ model_id: string | null }>();
    if (!a || a.model_id !== id) return c.json({ error: 'photo_not_in_album' }, 400);
  }
  const res = await c.env.DB.prepare('UPDATE models SET cover_asset_id = ? WHERE id = ?').bind(assetId, id).run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  await audit(c.env, c.get('user').id, 'album.cover', 'model', id, { assetId });
  return c.json({ ok: true });
});

/** AI drafts the album's study guide from its teaching points (staff). Stored as a draft until approved. */
app.post('/api/albums/:modelId/guide', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const id = c.req.param('modelId');
  const model = await c.env.DB.prepare('SELECT m.id, m.name, b.name AS brand FROM models m JOIN brands b ON b.id = m.brand_id WHERE m.id = ?').bind(id).first<Record<string, any>>();
  if (!model) return c.json({ error: 'not_found' }, 404);
  const pts = (await c.env.DB.prepare(`SELECT p.label, p.note, cp.name_en AS part FROM reference_points p JOIN reference_assets a ON a.id = p.asset_id
     LEFT JOIN components cp ON cp.code = a.component_code
     WHERE a.model_id = ? AND a.status <> 'rejected' AND a.label <> 'counterfeit' ORDER BY a.created_at, p.created_at LIMIT 60`).bind(id).all<{ label: string; note: string | null; part: string | null }>()).results;
  if (!pts.length) return c.json({ error: 'no_points_yet' }, 409);
  let g;
  try { g = await writeModelGuide(c.env, { brand: model.brand, model: model.name, points: pts }); }
  catch (e) { return c.json({ error: 'ai_failed', detail: String((e as Error).message ?? e).slice(0, 200) }, 502); }
  if (!g) return c.json({ error: 'ai_failed' }, 502);
  await c.env.DB.prepare(`INSERT INTO model_guides (model_id, i18n_json, status, ai_model, updated_by, updated_at) VALUES (?, ?, 'ai_draft', ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET i18n_json = excluded.i18n_json, status = 'ai_draft', ai_model = excluded.ai_model, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(id, JSON.stringify(g), aiModel(c.env), c.get('user').id, nowIso()).run();
  await audit(c.env, c.get('user').id, 'guide.ai_draft', 'model', id);
  return c.json({ guide: { ...g, status: 'ai_draft' } });
});

/** Staff edit and/or approve the guide. */
app.put('/api/albums/:modelId/guide', need(STAFF), async (c) => {
  const gt = z.object({ title: z.string().min(1).max(120), intro: z.string().max(400), steps: z.array(z.string().min(1).max(240)).min(1).max(6) });
  const body = await parse(c, z.object({ km: gt, en: gt, approve: z.boolean() }));
  const id = c.req.param('modelId');
  const status = body.approve ? 'approved' : 'ai_draft';
  await c.env.DB.prepare(`INSERT INTO model_guides (model_id, i18n_json, status, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(model_id) DO UPDATE SET i18n_json = excluded.i18n_json, status = excluded.status, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
    .bind(id, JSON.stringify({ km: body.km, en: body.en }), status, c.get('user').id, nowIso()).run();
  await audit(c.env, c.get('user').id, body.approve ? 'guide.approve' : 'guide.edit', 'model', id);
  return c.json({ ok: true, status });
});

/** AI suggests which album (model) a loose photo belongs to. Staff confirm before anything moves. */
app.post('/api/assets/:id/suggest-model', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const a = await c.env.DB.prepare('SELECT a.r2_key, a.brand_id, b.name AS brand FROM reference_assets a JOIN brands b ON b.id = a.brand_id WHERE a.id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!a) return c.json({ error: 'not_found' }, 404);
  const models = (await c.env.DB.prepare('SELECT id, name FROM models WHERE brand_id = ? ORDER BY name').bind(a.brand_id).all<{ id: string; name: string }>()).results;
  if (!models.length) return c.json({ modelId: null, confidence: 0, reason: 'no_models' });
  const obj = await c.env.VAULT.get(a.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  let r;
  try { r = await suggestModelForPhoto(c.env, { data: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? 'image/jpeg' }, a.brand, models); }
  catch (e) { return c.json({ error: 'ai_failed', detail: String((e as Error).message ?? e).slice(0, 200) }, 502); }
  return c.json({ ...r, model: models.find((m) => m.id === r.modelId)?.name ?? null });
});

/** File a photo under a model (album), or take it out (null). */
app.put('/api/assets/:id/model', need(STAFF), async (c) => {
  const { modelId } = await parse(c, z.object({ modelId: z.string().min(1).nullable() }));
  const a = await c.env.DB.prepare('SELECT brand_id, model_id FROM reference_assets WHERE id = ?').bind(c.req.param('id')).first<{ brand_id: string; model_id: string | null }>();
  if (!a) return c.json({ error: 'not_found' }, 404);
  if (modelId) {
    const m = await c.env.DB.prepare('SELECT brand_id FROM models WHERE id = ?').bind(modelId).first<{ brand_id: string }>();
    if (!m || m.brand_id !== a.brand_id) return c.json({ error: 'model_not_in_brand' }, 400);
  }
  await c.env.DB.prepare('UPDATE reference_assets SET model_id = ? WHERE id = ?').bind(modelId, c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'asset.set_model', 'asset', c.req.param('id'), { from: a.model_id, to: modelId });
  return c.json({ ok: true });
});

// ───────────────────────── teaching points: fill in Khmer + English for points that have only one language ─────────────────────────
// Staff run it in batches from the admin panel; returns how many points still need a translation.
app.post('/api/points/translate', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  // small batches: one Claude call per request stays well inside time limits
  const rows = (await c.env.DB.prepare(`SELECT id, label, note FROM reference_points WHERE i18n_json IS NULL ORDER BY created_at LIMIT 8`).all<{ id: string; label: string; note: string | null }>()).results;
  let done = 0;
  if (rows.length) {
    let tr;
    try { tr = await translatePoints(c.env, rows); }
    catch (e) { return c.json({ error: 'ai_failed', detail: String((e as Error).message ?? e).slice(0, 200) }, 502); }
    for (const [id, v] of Object.entries(tr)) {
      await c.env.DB.prepare('UPDATE reference_points SET i18n_json = ? WHERE id = ? AND i18n_json IS NULL').bind(JSON.stringify(v), id).run();
      done++;
    }
  }
  const left = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM reference_points WHERE i18n_json IS NULL').first<{ n: number }>())?.n ?? 0;
  return c.json({ done, left });
});

// ───────────────────────── feed folders: one folder per model (photos grouped), newest activity first ─────────────────────────
app.get('/api/feed/folders', async (c) => {
  const brandId = c.req.query('brandId');
  const args: unknown[] = brandId ? [brandId] : [];
  const folders = (await c.env.DB.prepare(
    `SELECT a.model_id AS id, m.name AS model, a.brand_id, b.name AS brand, COUNT(*) AS photos, MAX(a.created_at) AS latest,
            COUNT(DISTINCT a.component_code) AS parts,
            SUM(a.label = 'authentic') AS genuine, SUM(a.label = 'counterfeit') AS counterfeit,
            EXISTS (SELECT 1 FROM lesson_steps s WHERE s.model_id = a.model_id AND s.status <> 'retired') AS has_lesson
     FROM reference_assets a JOIN models m ON m.id = a.model_id JOIN brands b ON b.id = a.brand_id
     WHERE a.status <> 'rejected' AND a.model_id IS NOT NULL ${brandId ? 'AND a.brand_id = ?' : ''}
     GROUP BY a.model_id ORDER BY latest DESC LIMIT 60`,
  ).bind(...args).all<Record<string, any>>()).results;
  const ids = folders.map((f) => f.id);
  // up to four cover photos per folder, earliest first so the overview photo leads
  const covers = ids.length ? (await c.env.DB.prepare(
    `SELECT id, model_id FROM (SELECT a.id, a.model_id, ROW_NUMBER() OVER (PARTITION BY a.model_id ORDER BY a.created_at) AS n
       FROM reference_assets a WHERE a.status <> 'rejected' AND a.model_id IN (${ids.map(() => '?').join(',')})) WHERE n <= 4`,
  ).bind(...ids).all<Record<string, any>>()).results : [];
  const looseRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n, MAX(a.created_at) AS latest, (SELECT x.id FROM reference_assets x WHERE x.status <> 'rejected' AND x.model_id IS NULL ${brandId ? 'AND x.brand_id = ?' : ''} ORDER BY x.created_at DESC LIMIT 1) AS cover
     FROM reference_assets a WHERE a.status <> 'rejected' AND a.model_id IS NULL ${brandId ? 'AND a.brand_id = ?' : ''}`,
  ).bind(...args, ...args).first<{ n: number; latest: string | null; cover: string | null }>();
  const loose = looseRow?.n ?? 0;
  // brands that have any post, for the filter chips (independent of the chosen brand)
  const brands = (await c.env.DB.prepare(
    `SELECT DISTINCT b.id, b.name FROM reference_assets a JOIN brands b ON b.id = a.brand_id WHERE a.status <> 'rejected' ORDER BY b.name`,
  ).all<{ id: string; name: string }>()).results;
  return c.json({
    folders: folders.map((f) => ({ ...f, has_lesson: !!f.has_lesson, covers: covers.filter((x) => x.model_id === f.id).map((x) => x.id) })),
    loose, looseCover: looseRow?.cover ?? null, looseLatest: looseRow?.latest ?? null, brands,
  });
});
// ───────────────────────── hidden admin panel: multi-brand library (genuine / counterfeit by part) ─────────────────────────
app.get('/api/admin/library', need(STAFF), async (c) => {
  const q = c.req.query();
  const where: string[] = [`a.status <> 'rejected'`]; const args: unknown[] = [];
  if (q.brandId) { where.push('a.brand_id = ?'); args.push(q.brandId); }
  if (q.component) { where.push(q.component === 'none' ? 'a.component_code IS NULL' : 'a.component_code = ?'); if (q.component !== 'none') args.push(q.component); }
  if (q.label) { where.push('a.label = ?'); args.push(q.label); }
  const [items, matrix] = await Promise.all([
    c.env.DB.prepare(`SELECT a.id, a.brand_id, b.name AS brand, a.model_id, m.name AS model, a.component_code, a.label, a.label_basis, a.license, a.status, a.purpose, a.teaching_note, a.source_url, a.created_at,
        (SELECT COUNT(*) FROM datecode_analyses d WHERE d.target_type = 'asset' AND d.target_id = a.id) AS analyses
      FROM reference_assets a JOIN brands b ON b.id = a.brand_id LEFT JOIN models m ON m.id = a.model_id WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT 200`).bind(...args).all(),
    c.env.DB.prepare(`SELECT a.brand_id, COALESCE(a.component_code, 'none') AS component, a.label, COUNT(*) AS n FROM reference_assets a WHERE a.status <> 'rejected' GROUP BY a.brand_id, component, a.label`).all(),
  ]);
  return c.json({ items: items.results, matrix: matrix.results, aiConfigured: aiConfigured(c.env) });
});


// ───────────────────────── Entrupy SDK partner backend (used by the HENGZ Android app) ─────────────────────────
// Same contract as Entrupy's sample partner backend: POST login → { token }, then
// POST authorize-entrupy-sdk-user (Authorization: Token <token>) → { signed_authorization_request }.
// The Entrupy API key stays in the Worker secret ENTRUPY_API_KEY and never reaches the phone.
const ENTRUPY_ROLES: Role[] = ['owner', 'lead_authenticator', 'appraiser'];

app.post('/api/entrupy/partner/login', async (c) => {
  const body = await parse(c, z.object({ username: z.string().email(), password: z.string().min(1).max(200) }));
  const u = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1').bind(body.username.toLowerCase()).first<Record<string, any>>();
  const ok = u ? await verifyPassword(body.password, u.pw_hash, u.pw_salt, u.pw_iter) : false;
  if (!u || !ok) { await audit(c.env, null, 'entrupy.partner_login_failed', 'user', null, { email: body.username }); return c.json({ error: 'invalid_credentials' }, 401); }
  if (!ENTRUPY_ROLES.includes(u.role)) return c.json({ error: 'forbidden' }, 403);
  const token = await createSession(c.env, u.id);
  await audit(c.env, u.id, 'entrupy.partner_login', 'user', u.id);
  return c.json({ token });
});

app.post('/api/entrupy/partner/authorize-entrupy-sdk-user', async (c) => {
  const header = c.req.header('Authorization') ?? '';
  const user = await userFromToken(c.env, header.startsWith('Token ') ? header.slice(6).trim() : undefined);
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
  if (!ENTRUPY_ROLES.includes(user.role)) return c.json({ error: 'forbidden' }, 403);
  if (!c.env.ENTRUPY_API_KEY) return c.json({ error: 'entrupy_not_configured', detail: 'Set it with: wrangler secret put ENTRUPY_API_KEY' }, 501);
  const b = await parse(c, z.object({ sdk_authorization_request: z.string().min(1).max(20000) }).passthrough());
  const [first, ...rest] = user.name.trim().split(/\s+/);
  const res = await fetch(new URL('/v2/integrations/authorize-user', c.env.ENTRUPY_API_BASE || 'https://api.entrupy.com'), {
    method: 'POST',
    headers: { Authorization: `Token ${c.env.ENTRUPY_API_KEY}`, 'Accept-Language': 'en', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sdk_authorization_request: b.sdk_authorization_request, unique_user_id: user.id.slice(0, 40), first_name: first || undefined, last_name: rest.join(' ') || undefined }),
  });
  const data = (await res.json().catch(() => ({}))) as { signed_authorization_request?: string; username?: string };
  if (!res.ok || !data.signed_authorization_request) {
    await audit(c.env, user.id, 'entrupy.authorize_failed', 'user', user.id, { status: res.status });
    return c.json({ error: 'entrupy_authorize_failed', status: res.status }, 502);
  }
  await audit(c.env, user.id, 'entrupy.authorize', 'user', user.id, { entrupyUsername: data.username ?? null });
  return c.json({ signed_authorization_request: data.signed_authorization_request });
});

// ───────────────────────── providers & certificates ─────────────────────────
app.get('/api/providers', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM providers ORDER BY name').all<Record<string, any>>()).results;
  return c.json(rows.map((p) => ({ ...p, config: JSON.parse(p.config_json), secret: secretPresent(c.env, p.id) ? 'present' : 'missing' })));
});

app.put('/api/providers/:id/config', need(['owner']), async (c) => {
  const cfg = await parse(c, z.object({ base_url: z.string().url().startsWith('https://').optional(), test_path: z.string().startsWith('/').optional(), auth_header: z.string().max(50).optional(), auth_prefix: z.string().max(20).optional() }));
  await c.env.DB.prepare(`UPDATE providers SET config_json = ?, status = 'awaiting_authorization', last_test_ok = NULL, updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(cfg), nowIso(), c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'provider.config', 'provider', c.req.param('id'), { keys: Object.keys(cfg) }); // never log secret values
  return c.json({ ok: true });
});

app.post('/api/providers/:id/test', need(['owner', 'lead_authenticator']), async (c) => {
  const p = await c.env.DB.prepare('SELECT * FROM providers WHERE id = ?').bind(c.req.param('id')).first<Record<string, any>>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  const out = await testProvider(c.env, p.id, JSON.parse(p.config_json) as ProviderConfig);
  await c.env.DB.prepare('UPDATE providers SET status = ?, last_test_at = ?, last_test_ok = ?, last_test_message = ?, updated_at = ? WHERE id = ?')
    .bind(out.status, nowIso(), out.ok ? 1 : 0, out.message, nowIso(), p.id).run();
  await audit(c.env, c.get('user').id, 'provider.test', 'provider', p.id, { status: out.status });
  return c.json(out);
});

app.get('/api/certificates', async (c) =>
  c.json((await c.env.DB.prepare('SELECT * FROM certificates ORDER BY created_at DESC LIMIT 300').all()).results));

// Only UNVERIFIED uploads can be created by users. 'provider_verified' rows may only be written by a provider sync that has a real provider response.
app.post('/api/certificates', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ certNo: z.string().min(1), inspectionId: z.string().optional(), issueDate: z.string().optional(), externalUrl: z.string().url().optional(), officialResult: z.string().optional() }));
  const id = uid('cert_');
  await c.env.DB.prepare(`INSERT INTO certificates (id, cert_no, kind, inspection_id, issue_date, external_url, official_result, verification_status, created_by) VALUES (?, ?, 'user_uploaded_unverified', ?, ?, ?, ?, 'unverified', ?)`)
    .bind(id, b.certNo, b.inspectionId ?? null, b.issueDate ?? null, b.externalUrl ?? null, b.officialResult ?? null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'certificate.register_unverified', 'certificate', id);
  return c.json({ id });
});

// ───────────────────────── audit & settings ─────────────────────────
app.get('/api/audit', need(ADMINS), async (c) =>
  c.json((await c.env.DB.prepare('SELECT id, ts, user_id, action, resource_type, resource_id, detail_json, hash FROM audit_log ORDER BY id DESC LIMIT 300').all()).results));
app.get('/api/audit/verify', need(ADMINS), async (c) => c.json(await verifyAuditChain(c.env)));

const SETTING_KEYS = ['approvals_required', 'min_authentic_supports', 'retrieval_min_authentic_per_model_era', 'finetune_min_authentic_per_model_era', 'finetune_min_counterfeit_per_model_era'];
app.get('/api/settings', async (c) => c.json((await c.env.DB.prepare('SELECT key, value FROM settings').all()).results));
app.put('/api/settings/:key', need(['owner']), async (c) => {
  const key = c.req.param('key');
  if (!SETTING_KEYS.includes(key)) return c.json({ error: 'unknown_setting' }, 400);
  const { value } = await parse(c, z.object({ value: z.number().int().min(1).max(1000) }));
  await c.env.DB.prepare('UPDATE settings SET value = ?, updated_by = ?, updated_at = ? WHERE key = ?').bind(String(value), c.get('user').id, nowIso(), key).run();
  await audit(c.env, c.get('user').id, 'settings.update', 'settings', key, { value });
  return c.json({ ok: true });
});

// ───────────────────────── expert verification (photos → experts' Telegram group) ─────────────────────────
// The expert answers with one of the system's four outcomes. This system never issues a certificate;
// an official Entrupy certificate is only recorded as a requested add-on.
const VERIFY_STEPS = ['model', 'logo', 'serial', 'material', 'hardware', 'zipper', 'extra'] as const;
const VERIFY_REQUIRED = ['model', 'logo', 'serial'] as const;
const VERIFY_TRIAL = 3;
const MAX_VERIFY_PHOTOS = 10;
// where to find an example photo for each step among the brand's reference photos
const STEP_COMPONENT: Record<string, string> = { model: 'canvas', logo: 'heat_stamp', serial: 'date_code', material: 'canvas', hardware: 'hardware', zipper: 'zipper' };

const trialUsed = async (env: AppEnv['Bindings'], userId: string) =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM verify_requests WHERE user_id = ? AND free_trial = 1').bind(userId).first<{ n: number }>())?.n ?? 0;

/**
 * The best reference photo for each verification step: same brand and part, the customer's model first,
 * approved and genuine-labelled first, never a counterfeit-labelled photo. Teaching material for the comparison only.
 */
async function verifyRefs(env: AppEnv['Bindings'], brandId: string, modelText: string | null) {
  const model = modelText
    ? await env.DB.prepare(`SELECT id FROM models WHERE brand_id = ? AND (lower(name) = lower(?) OR lower(name) LIKE lower(?)) ORDER BY lower(name) = lower(?) DESC LIMIT 1`)
      .bind(brandId, modelText, `%${modelText}%`, modelText).first<{ id: string }>()
    : null;
  const out: Record<string, { id: string; label: string; status: string; model: string | null; same_model: boolean; r2_key: string }> = {};
  for (const [step, comp] of Object.entries(STEP_COMPONENT)) {
    const r = await env.DB.prepare(`SELECT a.id, a.label, a.status, a.r2_key, a.model_id, m.name AS model FROM reference_assets a LEFT JOIN models m ON m.id = a.model_id
      WHERE a.brand_id = ? AND a.component_code = ? AND a.status <> 'rejected' AND a.label <> 'counterfeit'
      ORDER BY (a.model_id IS NOT NULL AND a.model_id = ?) DESC, (a.status = 'approved') DESC, (a.label = 'authentic') DESC, a.created_at DESC LIMIT 1`)
      .bind(brandId, comp, model?.id ?? '').first<Record<string, any>>();
    if (r) out[step] = { id: r.id, label: r.label, status: r.status, model: r.model, same_model: !!model && r.model_id === model.id, r2_key: r.r2_key };
  }
  return out;
}

async function planForBrand(env: AppEnv['Bindings'], brandSlug: string) {
  const plans = (await env.DB.prepare('SELECT * FROM verify_plans WHERE active = 1 ORDER BY sort').all<Record<string, any>>()).results;
  return plans.find((p) => { try { return (JSON.parse(p.brands_json) as string[]).includes(brandSlug); } catch { return false; } }) ?? plans[0] ?? null;
}

app.get('/api/verify/plans', async (c) =>
  c.json({ plans: (await c.env.DB.prepare('SELECT * FROM verify_plans ORDER BY sort').all()).results }));

app.get('/api/verify/meta', async (c) => {
  const me = c.get('user'); const brandId = c.req.query('brandId') ?? '';
  const staff = STAFF.includes(me.role);
  const used = staff ? 0 : await trialUsed(c.env, me.id);
  const out: Record<string, any> = { trial: { used, limit: VERIFY_TRIAL, unlimited: staff }, telegram: telegramConfigured(c.env), examples: {}, plan: null };
  if (brandId) {
    const b = await c.env.DB.prepare('SELECT slug FROM brands WHERE id = ?').bind(brandId).first<{ slug: string }>();
    if (b) out.plan = await planForBrand(c.env, b.slug);
    const refs = await verifyRefs(c.env, brandId, c.req.query('model')?.trim() || null);
    for (const step of Object.keys(STEP_COMPONENT)) out.examples[step] = refs[step]?.id ?? null;
  }
  return c.json(out);
});

app.post('/api/verify', async (c) => {
  const me = c.get('user');
  const form = await c.req.formData();
  const brandId = String(form.get('brandId') ?? ''); const mode = String(form.get('mode') ?? '');
  const modelText = String(form.get('model') ?? '').trim().slice(0, 120) || null;
  const entrupy = form.get('entrupy') === '1' ? 1 : 0;
  if (!['scan', 'upload'].includes(mode)) return c.json({ error: 'invalid_mode' }, 400);
  const brand = await c.env.DB.prepare('SELECT id, slug, name FROM brands WHERE id = ?').bind(brandId).first<{ id: string; slug: string; name: string }>();
  if (!brand) return c.json({ error: 'brand_required' }, 400);
  // a brand that is not in the list yet: the placeholder "Other" brand plus the name the customer typed
  const brandText = brand.slug === 'other' ? String(form.get('brandText') ?? '').trim().slice(0, 80) || null : null;
  if (brand.slug === 'other' && !brandText) return c.json({ error: 'brand_name_required' }, 400);
  const brandName = brandText ?? brand.name;

  const photos: { step: string; data: ArrayBuffer; mime: string }[] = [];
  for (const step of VERIFY_STEPS) {
    for (const f of form.getAll(step)) {
      if (!(f instanceof File)) continue;
      if (f.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large', maxBytes: MAX_IMAGE_BYTES }, 413);
      const data = await f.arrayBuffer();
      const mime = sniffImage(new Uint8Array(data, 0, 16));
      if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
      photos.push({ step, data, mime });
    }
  }
  const missing = VERIFY_REQUIRED.filter((s) => !photos.some((p) => p.step === s));
  if (missing.length) return c.json({ error: 'photos_required', missing }, 400);
  if (photos.length > MAX_VERIFY_PHOTOS) return c.json({ error: 'too_many_photos', max: MAX_VERIFY_PHOTOS }, 400);

  const staff = STAFF.includes(me.role);
  const used = staff ? 0 : await trialUsed(c.env, me.id);
  // paid plans are not open yet: after the free trial, non-staff users wait for the plans to be priced
  if (!staff && used >= VERIFY_TRIAL) return c.json({ error: 'trial_used', limit: VERIFY_TRIAL }, 402);
  const plan = await planForBrand(c.env, brand.slug);

  const id = uid('vr_');
  await c.env.DB.prepare('INSERT INTO verify_requests (id, user_id, brand_id, brand_text, model_text, mode, plan_id, free_trial, entrupy_requested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.id, brand.id, brandText, modelText, mode, plan?.id ?? null, staff ? 0 : 1, entrupy).run();
  for (const p of photos) {
    const pid = uid('vp_'); const key = `verify/${id}/${p.step}/${pid}`;
    await c.env.VAULT.put(key, p.data, { httpMetadata: { contentType: p.mime } });
    await c.env.DB.prepare('INSERT INTO verify_photos (id, request_id, step, r2_key, mime) VALUES (?, ?, ?, ?, ?)').bind(pid, id, p.step, key, p.mime).run();
  }
  await audit(c.env, me.id, 'verify.submit', 'verify_request', id, { brand: brand.slug, photos: photos.length, entrupy: !!entrupy });

  if (telegramConfigured(c.env)) {
    const summary = [`🔎 Verification request ${id}`, `Brand: ${brandName}${brandText ? ' (not in the list yet)' : ''}`, modelText ? `Model: ${modelText}` : null,
      `Customer: ${me.name} (${me.email})`, `Mode: ${mode} · ${photos.length} photos`, entrupy ? '➕ Customer also asked for an official Entrupy certificate' : null,
      staff ? null : `Free trial ${used + 1}/${VERIFY_TRIAL}`].filter(Boolean).join('\n');
    c.executionCtx.waitUntil((async () => {
      // reference photos of the same parts go along, so the expert can compare side by side
      const refs = await verifyRefs(c.env, brand.id, modelText);
      const refPhotos: { step: string; data: ArrayBuffer; mime: string }[] = [];
      for (const [step, r] of Object.entries(refs)) {
        if (!photos.some((p) => p.step === step)) continue;
        const o = await c.env.VAULT.get(r.r2_key);
        if (o) refPhotos.push({ step: `REF · ${step}${r.model ? ` · ${r.model}` : ''} · ${r.label}`, data: await o.arrayBuffer(), mime: o.httpMetadata?.contentType ?? 'image/jpeg' });
      }
      return sendReviewRequest(c.env, { id, summary, photos, refs: refPhotos });
    })()
      .then((mid) => c.env.DB.prepare('UPDATE verify_requests SET telegram_message_id = ?, telegram_error = NULL WHERE id = ?').bind(mid, id).run())
      .catch((e) => c.env.DB.prepare('UPDATE verify_requests SET telegram_error = ? WHERE id = ?').bind(String((e as Error).message).slice(0, 300), id).run()));
  } else {
    await c.env.DB.prepare('UPDATE verify_requests SET telegram_error = ? WHERE id = ?').bind('telegram_not_configured', id).run();
  }
  return c.json({ id });
});

const VR_COLS = `r.id, r.user_id, r.brand_id, COALESCE(r.brand_text, b.name) AS brand, r.model_text, r.mode, r.plan_id, r.free_trial, r.entrupy_requested, r.status,
  r.expert_outcome, r.expert_note, r.expert_name, r.created_at, r.answered_at, (r.telegram_message_id IS NOT NULL) AS sent, r.telegram_error`;

app.get('/api/verify', async (c) => {
  const me = c.get('user');
  const all = c.req.query('all') === '1' && ADMINS.includes(me.role);
  const rows = await c.env.DB.prepare(`SELECT ${VR_COLS}, (SELECT id FROM verify_photos WHERE request_id = r.id ORDER BY created_at LIMIT 1) AS cover,
      (SELECT cert_no FROM hengz_certificates h WHERE h.request_id = r.id AND h.status = 'valid') AS cert_no,
      (SELECT public_code FROM hengz_certificates h WHERE h.request_id = r.id AND h.status = 'valid') AS cert_code,
      (SELECT status FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_status,
      (SELECT from_side FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_from,
      (SELECT amount_cents FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_cents,
      (SELECT currency FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_currency
    FROM verify_requests r JOIN brands b ON b.id = r.brand_id ${all ? '' : 'WHERE r.user_id = ?'} ORDER BY r.created_at DESC LIMIT 100`)
    .bind(...(all ? [] : [me.id])).all();
  return c.json({ requests: rows.results });
});

const canSeeRequest = (me: { id: string; role: Role }, userId: string) => me.id === userId || STAFF.includes(me.role) || ADMINS.includes(me.role);

app.get('/api/verify/:id', async (c) => {
  const me = c.get('user');
  const r = await c.env.DB.prepare(`SELECT ${VR_COLS} FROM verify_requests r JOIN brands b ON b.id = r.brand_id WHERE r.id = ?`).bind(c.req.param('id')).first<Record<string, any>>();
  if (!r || !canSeeRequest(me, r.user_id)) return c.json({ error: 'not_found' }, 404);
  const photos = (await c.env.DB.prepare('SELECT id, step FROM verify_photos WHERE request_id = ? ORDER BY created_at').bind(r.id).all()).results;
  const plan = r.plan_id ? await c.env.DB.prepare('SELECT * FROM verify_plans WHERE id = ?').bind(r.plan_id).first() : null;
  const found = await verifyRefs(c.env, r.brand_id, r.model_text);
  const ids = Object.values(found).map((x) => x.id);
  const pts = ids.length ? (await c.env.DB.prepare(`SELECT id, asset_id, x, y, w, h, label, note, i18n_json, source FROM reference_points WHERE asset_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).bind(...ids).all<Record<string, any>>()).results : [];
  const refs = Object.fromEntries(Object.entries(found).map(([step, x]) => [step, { id: x.id, label: x.label, status: x.status, model: x.model, same_model: x.same_model, points: pts.filter((p) => p.asset_id === x.id) }]));
  const certificate = await c.env.DB.prepare(`SELECT ${CERT_COLS} FROM hengz_certificates c JOIN brands b ON b.id = c.brand_id WHERE c.request_id = ? AND NOT EXISTS (SELECT 1 FROM hengz_certificate_hidden h WHERE h.cert_id = c.id)`).bind(r.id).first().catch(() => null);
  const offers = (await c.env.DB.prepare(`SELECT o.id, o.from_side, o.amount_cents, o.currency, o.note, o.status, o.created_at, o.responded_at, u.name AS by_name
    FROM buyback_offers o JOIN users u ON u.id = o.created_by WHERE o.request_id = ? ORDER BY o.created_at`).bind(r.id).all().catch(() => ({ results: [] }))).results;
  return c.json({ request: r, photos, plan, refs, certificate, offers });
});

app.get('/api/verify/photos/:pid/image', async (c) => {
  const me = c.get('user');
  const row = await c.env.DB.prepare('SELECT p.r2_key, p.mime, r.user_id FROM verify_photos p JOIN verify_requests r ON r.id = p.request_id WHERE p.id = ?')
    .bind(c.req.param('pid')).first<{ r2_key: string; mime: string; user_id: string }>();
  if (!row || !canSeeRequest(me, row.user_id)) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(row.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': row.mime, 'cache-control': 'private, max-age=300' } });
});

/** After "need more photos", the customer adds photos to the same request (no new trial used) and it goes back to the experts. */
app.post('/api/verify/:id/photos', async (c) => {
  const me = c.get('user');
  const r = await c.env.DB.prepare('SELECT r.id, r.user_id, r.status, r.telegram_message_id, b.name AS brand FROM verify_requests r JOIN brands b ON b.id = r.brand_id WHERE r.id = ?')
    .bind(c.req.param('id')).first<Record<string, any>>();
  if (!r || r.user_id !== me.id) return c.json({ error: 'not_found' }, 404);
  if (r.status !== 'more_photos') return c.json({ error: 'not_waiting_for_photos' }, 409);
  const form = await c.req.formData();
  const photos: { step: string; data: ArrayBuffer; mime: string }[] = [];
  for (const step of VERIFY_STEPS) for (const f of form.getAll(step)) {
    if (!(f instanceof File)) continue;
    if (f.size > MAX_IMAGE_BYTES) return c.json({ error: 'file_too_large', maxBytes: MAX_IMAGE_BYTES }, 413);
    const data = await f.arrayBuffer(); const mime = sniffImage(new Uint8Array(data, 0, 16));
    if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
    photos.push({ step, data, mime });
  }
  if (!photos.length) return c.json({ error: 'photos_required' }, 400);
  if (photos.length > MAX_VERIFY_PHOTOS) return c.json({ error: 'too_many_photos', max: MAX_VERIFY_PHOTOS }, 400);
  for (const p of photos) {
    const pid = uid('vp_'); const key = `verify/${r.id}/${p.step}/${pid}`;
    await c.env.VAULT.put(key, p.data, { httpMetadata: { contentType: p.mime } });
    await c.env.DB.prepare('INSERT INTO verify_photos (id, request_id, step, r2_key, mime) VALUES (?, ?, ?, ?, ?)').bind(pid, r.id, p.step, key, p.mime).run();
  }
  await c.env.DB.prepare(`UPDATE verify_requests SET status = 'submitted', expert_outcome = NULL, answered_at = NULL WHERE id = ?`).bind(r.id).run();
  await audit(c.env, me.id, 'verify.more_photos', 'verify_request', r.id, { photos: photos.length });
  await revokeForRequest(c.env, r.id, me.id, 'Request reopened with new photos');
  if (telegramConfigured(c.env)) {
    const summary = `📷 More photos for ${r.id} (${r.brand}) from ${me.name}`;
    c.executionCtx.waitUntil(sendReviewRequest(c.env, { id: r.id, summary, photos })
      .then((mid) => c.env.DB.prepare('UPDATE verify_requests SET telegram_message_id = ?, telegram_error = NULL WHERE id = ?').bind(mid, r.id).run())
      .catch((e) => c.env.DB.prepare('UPDATE verify_requests SET telegram_error = ? WHERE id = ?').bind(String((e as Error).message).slice(0, 300), r.id).run()));
  }
  return c.json({ ok: true });
});

// ───────────────────────── HENGZ expert certificates ─────────────────────────
// Issued by hand by a named HENGZ expert, only for a request answered "consistent with references" (DB triggers enforce it).
// The system and AI never issue one. Numbered, checkable by QR, revocable, never edited.
const CERT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CERT_ALPHABET[b % CERT_ALPHABET.length]).join('');

async function revokeForRequest(env: AppEnv['Bindings'], requestId: string, actor: string | null, reason: string) {
  // open buy-back offers no longer stand once the expert answer is not "consistent" any more
  await env.DB.prepare(`UPDATE buyback_offers SET status = 'withdrawn', responded_at = ? WHERE request_id = ? AND status = 'open'`).bind(nowIso(), requestId).run().catch(() => null);
  const res = await env.DB.prepare(`UPDATE hengz_certificates SET status = 'revoked', revoked_reason = ?, revoked_at = ? WHERE request_id = ? AND status = 'valid'`)
    .bind(reason, nowIso(), requestId).run().catch(() => null);
  if (res?.meta.changes) await audit(env, actor, 'certificate.revoke', 'verify_request', requestId, { reason, automatic: true });
}

const CERT_COLS = `c.id, c.cert_no, c.public_code, c.request_id, c.brand_id, COALESCE((SELECT v.brand_text FROM verify_requests v WHERE v.id = c.request_id), b.name) AS brand, c.model_text, c.item_desc, c.photo_id, c.customer_name,
  c.expert_name, c.issued_at, c.status, c.revoked_reason, c.revoked_at`;

app.post('/api/verify/:id/certificate', need(STAFF), async (c) => {
  const body = await parse(c, z.object({ itemDesc: z.string().max(300).optional(), photoId: z.string().optional() }));
  const me = c.get('user');
  const r = await c.env.DB.prepare(`SELECT r.id, r.brand_id, r.model_text, r.status, r.expert_outcome, u.name AS customer FROM verify_requests r JOIN users u ON u.id = r.user_id WHERE r.id = ?`)
    .bind(c.req.param('id')).first<Record<string, any>>();
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (r.status !== 'answered' || r.expert_outcome !== 'consistent_with_references') return c.json({ error: 'needs_consistent_answer' }, 409);
  const existing = await c.env.DB.prepare(`SELECT status FROM hengz_certificates WHERE request_id = ?`).bind(r.id).first<{ status: string }>();
  if (existing) return c.json({ error: existing.status === 'valid' ? 'already_issued' : 'revoked_certificate_exists' }, 409);
  const photo = body.photoId
    ? await c.env.DB.prepare(`SELECT id FROM verify_photos WHERE id = ? AND request_id = ?`).bind(body.photoId, r.id).first<{ id: string }>()
    : await c.env.DB.prepare(`SELECT id FROM verify_photos WHERE request_id = ? ORDER BY (step = 'model') DESC, created_at LIMIT 1`).bind(r.id).first<{ id: string }>();
  const id = uid('hc_');
  const certNo = `HZ-${new Date().getUTCFullYear()}-${randomCode(6)}`;
  const code = randomCode(16);
  await c.env.DB.prepare(`INSERT INTO hengz_certificates (id, cert_no, public_code, request_id, brand_id, model_text, item_desc, photo_id, customer_name, expert_id, expert_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, certNo, code, r.id, r.brand_id, r.model_text, body.itemDesc?.trim() || null, photo?.id ?? null, r.customer, me.id, me.name).run();
  await audit(c.env, me.id, 'certificate.issue', 'hengz_certificate', id, { certNo, request: r.id });
  return c.json({ id, certNo, code });
});

app.post('/api/hengz-certificates/:id/revoke', need(ADMINS), async (c) => {
  const { reason } = await parse(c, z.object({ reason: z.string().min(3).max(300) }));
  const res = await c.env.DB.prepare(`UPDATE hengz_certificates SET status = 'revoked', revoked_reason = ?, revoked_at = ? WHERE id = ? AND status = 'valid'`)
    .bind(reason, nowIso(), c.req.param('id')).run();
  if (!res.meta.changes) return c.json({ error: 'not_found_or_already_revoked' }, 404);
  await audit(c.env, c.get('user').id, 'certificate.revoke', 'hengz_certificate', c.req.param('id'), { reason });
  return c.json({ ok: true });
});

/**
 * Admin "delete" (e.g. after a test): revokes the certificate if it is still valid, then takes it out of every list.
 * The record stays, immutable, so its QR code keeps showing "revoked" (DB triggers forbid real deletion).
 */
app.post('/api/hengz-certificates/:id/remove', need(ADMINS), async (c) => {
  const { reason } = await parse(c, z.object({ reason: z.string().trim().min(3).max(300).default('Removed by admin') }));
  const id = c.req.param('id'); const me = c.get('user');
  const cert = await c.env.DB.prepare('SELECT status FROM hengz_certificates WHERE id = ?').bind(id).first<{ status: string }>();
  if (!cert) return c.json({ error: 'not_found' }, 404);
  if (cert.status === 'valid') {
    await c.env.DB.prepare(`UPDATE hengz_certificates SET status = 'revoked', revoked_reason = ?, revoked_at = ? WHERE id = ? AND status = 'valid'`).bind(reason, nowIso(), id).run();
  }
  await c.env.DB.prepare('INSERT OR IGNORE INTO hengz_certificate_hidden (cert_id, hidden_by) VALUES (?, ?)').bind(id, me.id).run();
  await audit(c.env, me.id, 'certificate.remove', 'hengz_certificate', id, { reason });
  return c.json({ ok: true });
});

app.get('/api/hengz-certificates', need(STAFF), async (c) =>
  c.json({ certificates: (await c.env.DB.prepare(`SELECT ${CERT_COLS} FROM hengz_certificates c JOIN brands b ON b.id = c.brand_id WHERE NOT EXISTS (SELECT 1 FROM hengz_certificate_hidden h WHERE h.cert_id = c.id) ORDER BY c.issued_at DESC LIMIT 200`).all()).results }));

/** Public check (the QR code on the certificate): shows the certificate as issued, or that it was revoked. */
app.get('/api/public/cert/:code', async (c) => {
  const row = await c.env.DB.prepare(`SELECT ${CERT_COLS} FROM hengz_certificates c JOIN brands b ON b.id = c.brand_id WHERE c.public_code = ?`)
    .bind(c.req.param('code')).first<Record<string, any>>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const { request_id: _r, ...pub } = row;
  return c.json({ certificate: pub });
});
app.get('/api/public/cert/:code/photo', async (c) => {
  const row = await c.env.DB.prepare(`SELECT p.r2_key, p.mime FROM hengz_certificates c JOIN verify_photos p ON p.id = c.photo_id WHERE c.public_code = ?`)
    .bind(c.req.param('code')).first<{ r2_key: string; mime: string }>();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(row.r2_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=3600' } });
});

// ───────────────────────── buy-back offers (after "consistent with references") ─────────────────────────
const money = (cents: number, cur: string) => `${(cents / 100).toFixed(2)} ${cur}`;

/** HENGZ (staff) offers a buy-back price, or the customer (request owner) sends the price they want. */
app.post('/api/verify/:id/offers', async (c) => {
  const body = await parse(c, z.object({ side: z.enum(['hengz', 'customer']), amount: z.number().positive().max(10_000_000), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), note: z.string().max(500).optional() }));
  const me = c.get('user');
  const r = await c.env.DB.prepare(`SELECT r.id, r.user_id, r.status, r.expert_outcome, r.model_text, COALESCE(r.brand_text, b.name) AS brand FROM verify_requests r JOIN brands b ON b.id = r.brand_id WHERE r.id = ?`)
    .bind(c.req.param('id')).first<Record<string, any>>();
  if (!r) return c.json({ error: 'not_found' }, 404);
  if (body.side === 'hengz' && !STAFF.includes(me.role)) return c.json({ error: 'forbidden' }, 403);
  if (body.side === 'customer' && r.user_id !== me.id) return c.json({ error: 'forbidden' }, 403);
  if (r.status !== 'answered' || r.expert_outcome !== 'consistent_with_references') return c.json({ error: 'needs_consistent_answer' }, 409);
  if (await c.env.DB.prepare(`SELECT 1 FROM buyback_offers WHERE request_id = ? AND status = 'accepted'`).bind(r.id).first()) return c.json({ error: 'already_agreed' }, 409);
  const now = nowIso();
  // a new offer replaces any offer still open on this request
  await c.env.DB.prepare(`UPDATE buyback_offers SET status = 'superseded', responded_at = ? WHERE request_id = ? AND status = 'open'`).bind(now, r.id).run();
  const id = uid('bo_'); const cents = Math.round(body.amount * 100);
  await c.env.DB.prepare(`INSERT INTO buyback_offers (id, request_id, from_side, amount_cents, currency, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, r.id, body.side, cents, body.currency, body.note?.trim() || null, me.id).run();
  await audit(c.env, me.id, 'buyback.offer', 'verify_request', r.id, { side: body.side, amount_cents: cents, currency: body.currency });
  if (body.side === 'customer' && telegramConfigured(c.env)) {
    c.executionCtx.waitUntil(sendText(c.env, `💰 ${me.name} asks ${money(cents, body.currency)} for ${r.brand}${r.model_text ? ` ${r.model_text}` : ''} (${r.id})${body.note ? `\n“${body.note.trim()}”` : ''}\nAnswer on the request page.`));
  }
  return c.json({ id });
});

/** The other side accepts or declines an open offer; the sender can withdraw it. */
app.post('/api/verify/offers/:oid/respond', async (c) => {
  const { action } = await parse(c, z.object({ action: z.enum(['accept', 'decline', 'withdraw']) }));
  const me = c.get('user');
  const o = await c.env.DB.prepare(`SELECT o.*, r.user_id, r.model_text, COALESCE(r.brand_text, b.name) AS brand FROM buyback_offers o JOIN verify_requests r ON r.id = o.request_id JOIN brands b ON b.id = r.brand_id WHERE o.id = ?`)
    .bind(c.req.param('oid')).first<Record<string, any>>();
  if (!o || o.status !== 'open') return c.json({ error: 'not_open' }, 409);
  const isCustomer = o.user_id === me.id; const isStaff = STAFF.includes(me.role);
  const allowed = action === 'withdraw'
    ? (o.from_side === 'customer' ? isCustomer : isStaff)
    : (o.from_side === 'hengz' ? isCustomer : isStaff);
  if (!allowed) return c.json({ error: 'forbidden' }, 403);
  const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn';
  await c.env.DB.prepare(`UPDATE buyback_offers SET status = ?, responded_by = ?, responded_at = ? WHERE id = ? AND status = 'open'`).bind(status, me.id, nowIso(), o.id).run();
  await audit(c.env, me.id, `buyback.${action}`, 'verify_request', o.request_id, { offer: o.id });
  if (isCustomer && action !== 'withdraw' && telegramConfigured(c.env)) {
    c.executionCtx.waitUntil(sendText(c.env, `${action === 'accept' ? '✅' : '✖'} ${me.name} ${action === 'accept' ? 'ACCEPTED' : 'declined'} the buy-back offer ${money(o.amount_cents, o.currency)} for ${o.brand}${o.model_text ? ` ${o.model_text}` : ''} (${o.request_id}).${action === 'accept' ? ' Please contact the customer to arrange the buy-back.' : ''}`));
  }
  return c.json({ ok: true, status });
});

// ───────────────────────── NFC chip reads ─────────────────────────
/**
 * Record a chip read (hash of the UID only) and say how often the same chip ID was read before,
 * in total and on other accounts. A signal for the expert, never a verdict.
 */
app.post('/api/nfc/scans', async (c) => {
  const body = await parse(c, z.object({ uid: z.string().trim().min(4).max(64), brand: z.enum(['lv', 'chanel', 'other']) }));
  const me = c.get('user');
  const uidHash = await sha256Hex(body.uid.toLowerCase().replace(/[^0-9a-f]/g, ''));
  const prev = await c.env.DB.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT CASE WHEN user_id <> ? THEN user_id END) AS others, MIN(created_at) AS first
    FROM nfc_scans WHERE uid_hash = ?`).bind(me.id, uidHash).first<{ total: number; others: number; first: string | null }>();
  await c.env.DB.prepare('INSERT INTO nfc_scans (id, uid_hash, brand, user_id) VALUES (?, ?, ?, ?)').bind(uid('nf_'), uidHash, body.brand, me.id).run();
  return c.json({ before: prev?.total ?? 0, otherAccounts: prev?.others ?? 0, firstSeen: prev?.first ?? null });
});

/** Staff can also answer from the web (e.g. when Telegram is down). Same four outcomes. */
app.post('/api/verify/:id/answer', need(STAFF), async (c) => {
  const body = await parse(c, z.object({ code: z.enum(['c', 'f', 'm', 'r']), note: z.string().max(2000).optional() }));
  const a = EXPERT_ANSWERS[body.code];
  const me = c.get('user');
  const res = await c.env.DB.prepare(`UPDATE verify_requests SET status = ?, expert_outcome = ?, expert_name = ?, expert_note = COALESCE(?, expert_note), answered_at = ? WHERE id = ? AND status <> 'cancelled'`)
    .bind(a.status, a.outcome, me.name, body.note?.trim() || null, nowIso(), c.req.param('id')).run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  await audit(c.env, me.id, 'verify.answer', 'verify_request', c.req.param('id'), { outcome: a.outcome, via: 'web' });
  if (a.outcome !== 'consistent_with_references') await revokeForRequest(c.env, c.req.param('id'), me.id, 'Expert answer changed');
  return c.json({ ok: true });
});

app.put('/api/admin/verify/plans/:id', need(ADMINS), async (c) => {
  const cents = z.number().int().min(0).max(100_000_00).nullable();
  const body = await parse(c, z.object({
    name_en: z.string().min(1).max(160), name_km: z.string().min(1).max(160), brands: z.array(z.string().min(1).max(60)).max(60),
    price_cents: cents, entrupy_price_cents: cents, currency: z.string().regex(/^[A-Z]{3}$/), active: z.boolean(),
  }));
  const res = await c.env.DB.prepare('UPDATE verify_plans SET name_en = ?, name_km = ?, brands_json = ?, price_cents = ?, entrupy_price_cents = ?, currency = ?, active = ?, updated_at = ? WHERE id = ?')
    .bind(body.name_en, body.name_km, JSON.stringify(body.brands), body.price_cents, body.entrupy_price_cents, body.currency, body.active ? 1 : 0, nowIso(), c.req.param('id')).run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  await audit(c.env, c.get('user').id, 'verify.plan_update', 'verify_plan', c.req.param('id'), body);
  return c.json({ ok: true });
});

/** Admin: is the AI working right now? One tiny call per configured model, plus the translation backlog. */
app.get('/api/admin/ai/test', need(ADMINS), async (c) => {
  const results = aiConfigured(c.env) ? await testAi(c.env) : [];
  const left = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM reference_points WHERE i18n_json IS NULL').first<{ n: number }>())?.n ?? 0;
  return c.json({ configured: aiConfigured(c.env), results, untranslated: left });
});

app.get('/api/admin/telegram/status', need(ADMINS), async (c) => {
  const st = { botToken: !!c.env.TELEGRAM_BOT_TOKEN, chatId: !!c.env.TELEGRAM_CHAT_ID, webhookSecret: !!c.env.TELEGRAM_WEBHOOK_SECRET };
  let webhook: { url?: string; pending?: number; lastError?: string } | null = null;
  if (st.botToken) {
    const info = await webhookInfo(c.env).catch(() => null) as any;
    if (info) webhook = { url: info.url || '', pending: info.pending_update_count, lastError: info.last_error_message };
  }
  return c.json({ ...st, webhook });
});

app.post('/api/admin/telegram/setup', need(ADMINS), async (c) => {
  if (!telegramConfigured(c.env) || !c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: 'telegram_secrets_missing' }, 400);
  const url = `${new URL(c.req.url).origin}/api/telegram/webhook`;
  await setWebhook(c.env, url);
  await audit(c.env, c.get('user').id, 'telegram.webhook_set', 'settings', null, { url });
  return c.json({ ok: true, url });
});

/** Telegram → us. Authenticated by the secret token header, and only the experts' group is accepted. */
app.post('/api/telegram/webhook', async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || c.req.header('x-telegram-bot-api-secret-token') !== secret) return c.json({ error: 'forbidden' }, 403);
  const u = await c.req.json().catch(() => null) as any;
  const chatOk = (id: unknown) => String(id) === String(c.env.TELEGRAM_CHAT_ID);
  const who = (f: any) => [f?.first_name, f?.last_name].filter(Boolean).join(' ') || (f?.username ? `@${f.username}` : 'Expert');

  const cb = u?.callback_query;
  if (cb?.data && cb.message && chatOk(cb.message.chat?.id)) {
    const [tag, id, code] = String(cb.data).split('|');
    const a = EXPERT_ANSWERS[code];
    if (tag !== 'vr' || !a) { await answerCallback(c.env, cb.id, 'Unknown action'); return c.json({ ok: true }); }
    const name = who(cb.from).slice(0, 100);
    const res = await c.env.DB.prepare(`UPDATE verify_requests SET status = ?, expert_outcome = ?, expert_name = ?, answered_at = ? WHERE id = ? AND status <> 'cancelled'`)
      .bind(a.status, a.outcome, name, nowIso(), id).run();
    if (!res.meta.changes) { await answerCallback(c.env, cb.id, 'Request not found'); return c.json({ ok: true }); }
    await audit(c.env, null, 'verify.answer', 'verify_request', id, { outcome: a.outcome, via: 'telegram', expert: name });
    if (a.outcome !== 'consistent_with_references') await revokeForRequest(c.env, id, null, 'Expert answer changed');
    await answerCallback(c.env, cb.id, 'Saved');
    await editDecision(c.env, cb.message.chat.id, cb.message.message_id, `${cb.message.text ?? ''}\n\n→ ${a.button} — ${name}\n(Reply to this message to add or change the note for the customer.)`);
    return c.json({ ok: true });
  }

  const m = u?.message;
  if (m?.text && m.reply_to_message?.message_id && chatOk(m.chat?.id)) {
    const res = await c.env.DB.prepare('UPDATE verify_requests SET expert_note = ?, expert_name = COALESCE(expert_name, ?) WHERE telegram_message_id = ?')
      .bind(String(m.text).slice(0, 2000), who(m.from).slice(0, 100), m.reply_to_message.message_id).run();
    if (res.meta.changes) await sendText(c.env, '📝 Note saved for the customer.', m.message_id);
  }
  return c.json({ ok: true });
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
/**
 * Every 10 minutes: translate teaching points that are still missing Khmer + English, in small batches,
 * so translations finish on their own without anyone opening the app. Does nothing once all are done.
 */
async function translateBacklog(env: AppEnv['Bindings']) {
  if (!aiConfigured(env)) return;
  for (let round = 0; round < 5; round++) {
    const rows = (await env.DB.prepare(`SELECT id, label, note FROM reference_points WHERE i18n_json IS NULL ORDER BY created_at LIMIT 8`).all<{ id: string; label: string; note: string | null }>()).results;
    if (!rows.length) return;
    let tr;
    try { tr = await translatePoints(env, rows); } catch (e) { console.error('translate backlog failed:', (e as Error).message); return; }
    for (const [id, v] of Object.entries(tr)) {
      await env.DB.prepare('UPDATE reference_points SET i18n_json = ? WHERE id = ? AND i18n_json IS NULL').bind(JSON.stringify(v), id).run();
    }
    console.log(`translate backlog: ${Object.keys(tr).length}/${rows.length} done`);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(translateBacklog(env));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
