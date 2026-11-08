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
import { assessVerification, pointsModel, testAi, OUT_LANGS, type OutLang, translatePoints, writeModelGuide, suggestModelForPhoto, aiConfigured, aiModel, aiProvider, analyzeDateCodeAppearance, findPhotoRegions, identifyStyleCode, explainDifferences, suggestFocusRegions, suggestObservations, suggestTeachingPoints, chatAssistant, draftCareLesson, draftSkill, findTiktokSellers, draftOutreach, paintMethod, repairAdvice, researchPaintProduct, identifyBag, researchMarket } from './vision.ts';
import { checkMeasurement, deltaE2000, labToHex, matchLevel, measuredLab } from '../shared/color.ts';
import { isValidRect } from '../shared/marks.ts';
import { notifyStaff, notifyUser, vapidKeys } from './push.ts';
import { removeBackground } from './cutout.ts';
import { sniffAudio, synthesize, ttsConfigured, ttsHash } from './tts.ts';
import { chooseSkills, type SkillRow, type SkillUse } from '../shared/skills.ts';
import { asFeature } from './usage.ts';
import { evidenceFor, handleFromInput, profileUrl } from '../shared/leads.ts';
import { STEP_ICONS, UI_VOICE_KEYS } from '../shared/voiceKeys.ts';
import { customerPrecheck, parseAiReview, trackRecord } from '../shared/aiReview.ts';
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
const lineRedirect = (c: any) => `${new URL(c.req.url).origin}/api/auth/line/callback`;

// The state is signed (HMAC with the channel secret) and expires in 10 minutes, so it does not depend on a cookie:
// on a phone LINE often signs in through the LINE app and returns in another browser that never saw our cookie.
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function lineSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
}
async function lineState(secret: string) {
  const nonce = crypto.randomUUID(); const exp = String(Date.now() + 10 * 60_000);
  return { state: `${nonce}.${exp}.${await lineSign(secret, `${nonce}.${exp}`)}`, nonce };
}
async function lineCheck(secret: string, state: string): Promise<string | null> {
  const [nonce, exp, sig] = state.split('.');
  if (!nonce || !exp || !sig || Number(exp) < Date.now()) return null;
  const want = await lineSign(secret, `${nonce}.${exp}`);
  if (want.length !== sig.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? nonce : null;
}

app.get('/api/auth/line/start', async (c) => {
  if (!c.env.LINE_CHANNEL_ID || !c.env.LINE_CHANNEL_SECRET) return c.redirect('/login?error=line_not_configured');
  const { state, nonce } = await lineState(c.env.LINE_CHANNEL_SECRET);
  const q = new URLSearchParams({ response_type: 'code', client_id: c.env.LINE_CHANNEL_ID, redirect_uri: lineRedirect(c), state, nonce, scope: 'profile openid' });
  return c.redirect(`https://access.line.me/oauth2/v2.1/authorize?${q}`);
});

app.get('/api/auth/line/callback', async (c) => {
  const fail = (why: string) => c.redirect(`/login?error=${encodeURIComponent(why)}`);
  if (!c.env.LINE_CHANNEL_ID || !c.env.LINE_CHANNEL_SECRET) return fail('line_not_configured');
  if (c.req.query('error')) return fail(`line_${c.req.query('error')}`); // e.g. the person cancelled on LINE
  const code = c.req.query('code');
  const nonce = await lineCheck(c.env.LINE_CHANNEL_SECRET, c.req.query('state') ?? '');
  if (!code || !nonce) return fail('line_state');
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
  /^\/api\/contact(\/qr)?$/,
  /^\/api\/market\/(trends|overview|updates)$/,
  /^\/api\/market\/images\/[^/]+$/,
  /^\/api\/care\/lessons(\/[^/]+(\/photo\/(before|after))?)?$/,
  /^\/api\/care\/steps\/[^/]+\/photo$/,
  /^\/api\/lessons(\/[^/]+)?$/,
  /^\/api\/stats\/public$/,
  /^\/api\/paint\/(recipes|products)(\/[^/]+\/photo)?$/,
  /^\/api\/paint\/steps\/[^/]+\/(photo|audio)$/,
  /^\/api\/paint\/recipes\/[^/]+\/mix-audio$/,
  /^\/api\/voice\/ui(\/[a-z]{2}\/[\w.]+)?$/,
];

// everything below requires a session (or is a public read above)
app.use('/api/*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === '/api/health' || p.startsWith('/api/auth/') || p.startsWith('/api/entrupy/partner/') || p === '/api/telegram/webhook' || p.startsWith('/api/public/cert/')) return next();
  const user = await userFromToken(c.env, getCookie(c, COOKIE));
  if (!user) {
    // guests can browse the public teaching pages (read only); everything else needs an account
    // the paint colour match is a calculation on numbers the phone measured: open to guests too
    if ((c.req.method === 'GET' && PUBLIC_GET.some((r) => r.test(p))) || (c.req.method === 'POST' && p === '/api/paint/match')) {
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

const SETTING_KEYS = ['ai_precheck_daily_limit', 'approvals_required', 'min_authentic_supports', 'retrieval_min_authentic_per_model_era', 'finetune_min_authentic_per_model_era', 'finetune_min_counterfeit_per_model_era'];
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
/** Experts answer requests (1) or expert review is paused and customers get the AI pre-check only (0). */
const expertReviewOn = async (env: AppEnv['Bindings']) => (await getSettingNumber(env, 'expert_review_enabled', 1)) === 1;
const precheckDay = () => `precheck:${new Date().toISOString().slice(0, 10)}`;
async function precheckUsage(env: AppEnv['Bindings'], userId: string) {
  const limit = await getSettingNumber(env, 'ai_precheck_daily_limit', 5);
  const used = (await env.DB.prepare('SELECT n FROM ai_chat_usage WHERE user_id = ? AND day = ?').bind(userId, precheckDay()).first<{ n: number }>())?.n ?? 0;
  return { used, limit };
}
/** Count one AI pre-check for today; false when the daily limit is reached. */
const takePrecheck = async (env: AppEnv['Bindings'], userId: string) => {
  const { limit } = await precheckUsage(env, userId);
  const r = await env.DB.prepare(`INSERT INTO ai_chat_usage (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 WHERE n < ?`).bind(userId, precheckDay(), limit).run();
  return !!r.meta.changes;
};
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
  const experts = await expertReviewOn(c.env);
  const out: Record<string, any> = { trial: { used, limit: VERIFY_TRIAL, unlimited: staff || !experts }, telegram: telegramConfigured(c.env), examples: {}, plan: null,
    expertReview: experts, aiConfigured: aiConfigured(c.env), precheck: me.id ? await precheckUsage(c.env, me.id) : null };
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
  // "model" carries both the typed model name (text) and the whole-bag photo (file): take the text value
  const modelText = String(form.getAll('model').find((v) => typeof v === 'string') ?? '').trim().slice(0, 120) || null;
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
  const experts = await expertReviewOn(c.env);
  const used = staff || !experts ? 0 : await trialUsed(c.env, me.id);
  // paid plans are not open yet: after the free trial, non-staff users wait for the plans to be priced
  if (experts && !staff && used >= VERIFY_TRIAL) return c.json({ error: 'trial_used', limit: VERIFY_TRIAL }, 402);
  if (!staff) { const gate = await memberGate(c); if (gate) return gate; }
  // expert review paused: the AI pre-check is the answer, so it must be available, within today's limit
  if (!experts && !aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 503);
  if (!experts && !staff && !(await takePrecheck(c.env, me.id))) return c.json({ error: 'precheck_limit' }, 429);
  const plan = await planForBrand(c.env, brand.slug);

  const id = uid('vr_');
  await c.env.DB.prepare('INSERT INTO verify_requests (id, user_id, brand_id, brand_text, model_text, mode, plan_id, free_trial, entrupy_requested) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.id, brand.id, brandText, modelText, mode, plan?.id ?? null, staff || !experts ? 0 : 1, entrupy).run();
  for (const p of photos) {
    const pid = uid('vp_'); const key = `verify/${id}/${p.step}/${pid}`;
    await c.env.VAULT.put(key, p.data, { httpMetadata: { contentType: p.mime } });
    await c.env.DB.prepare('INSERT INTO verify_photos (id, request_id, step, r2_key, mime) VALUES (?, ?, ?, ?, ?)').bind(pid, id, p.step, key, p.mime).run();
  }
  await audit(c.env, me.id, 'verify.submit', 'verify_request', id, { brand: brand.slug, photos: photos.length, entrupy: !!entrupy });

  // the AI compares the photos with our references straight away (for the customer when experts are paused)
  c.executionCtx.waitUntil(asFeature('precheck', () => runAiReview(c.env, id)).then((x) => { if (!x.ok) console.error(`ai pre-check ${id}: ${x.error}`); }));
  if (!experts) return c.json({ id });

  const origin = new URL(c.req.url).origin;
  c.executionCtx.waitUntil(notifyStaff(c.env, { title: '🔎 New verification request', body: `${brandName}${modelText ? ` · ${modelText}` : ''} — ${me.name} · ${photos.length} photos`, url: `/verify/r/${id}`, tag: id }, origin).catch(() => 0));
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
  const all = c.req.query('all') === '1' && STAFF.includes(me.role);
  const rows = await c.env.DB.prepare(`SELECT ${VR_COLS}, (SELECT id FROM verify_photos WHERE request_id = r.id ORDER BY created_at LIMIT 1) AS cover,
      (SELECT cert_no FROM hengz_certificates h WHERE h.request_id = r.id AND h.status = 'valid') AS cert_no,
      (SELECT public_code FROM hengz_certificates h WHERE h.request_id = r.id AND h.status = 'valid') AS cert_code,
      (SELECT status FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_status,
      (SELECT from_side FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_from,
      (SELECT amount_cents FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_cents,
      (SELECT currency FROM buyback_offers o WHERE o.request_id = r.id ORDER BY o.created_at DESC LIMIT 1) AS offer_currency,
      (SELECT CASE a.suggested_outcome WHEN 'insufficient_evidence' THEN 'more_photos' WHEN 'concerns_found' THEN 'concerns'
         WHEN 'consistent_with_references' THEN 'no_differences_seen' WHEN 'requires_expert_review' THEN 'unclear' END
         FROM verify_ai_reviews a WHERE a.request_id = r.id AND a.suggested_outcome IS NOT NULL ORDER BY a.created_at DESC LIMIT 1) AS precheck_level
    FROM verify_requests r JOIN brands b ON b.id = r.brand_id ${all ? '' : 'WHERE r.user_id = ?'} ORDER BY r.created_at DESC LIMIT 100`)
    .bind(...(all ? [] : [me.id])).all<Record<string, unknown>>();
  // customers see the AI level only while expert review is paused (otherwise it is for the experts)
  if (!STAFF.includes(me.role) && (await expertReviewOn(c.env))) for (const x of rows.results) x.precheck_level = null;
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
  let ai = null as Record<string, unknown> | null;
  if (STAFF.includes(me.role)) {
    const row = await c.env.DB.prepare('SELECT model, suggested_outcome, confidence, findings_json, summary_en, summary_km, error, created_at FROM verify_ai_reviews WHERE request_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(r.id).first<Record<string, any>>().catch(() => null);
    if (row) ai = { ...row, findings: JSON.parse(row.findings_json || '[]'), track: await aiTrack(c.env) };
  }
  // AI pre-check for the customer while expert review is paused (staff see it too)
  let precheck = null as Record<string, unknown> | null;
  const experts = await expertReviewOn(c.env);
  if (!experts) {
    const row = await c.env.DB.prepare('SELECT suggested_outcome, findings_json, summary_en, summary_km, error, created_at FROM verify_ai_reviews WHERE request_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(r.id).first<{ suggested_outcome: string | null; findings_json: string | null; summary_en: string | null; summary_km: string | null; error: string | null; created_at: string }>().catch(() => null);
    precheck = { pending: !row, failed: !!row && !row.suggested_outcome, result: row ? customerPrecheck(row) : null, refs: Object.keys(found).length, at: row?.created_at ?? null };
  }
  return c.json({ request: r, photos, plan, refs, certificate, offers, ai, precheck, expertReview: experts });
});

/** The customer asks the AI to try again after a failed pre-check (counts toward today's limit). */
app.post('/api/verify/:id/precheck', async (c) => {
  const me = c.get('user');
  const r = await c.env.DB.prepare('SELECT id, user_id FROM verify_requests WHERE id = ?').bind(c.req.param('id')).first<{ id: string; user_id: string }>();
  if (!r || !canSeeRequest(me, r.user_id)) return c.json({ error: 'not_found' }, 404);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 503);
  const last = await c.env.DB.prepare('SELECT suggested_outcome FROM verify_ai_reviews WHERE request_id = ? ORDER BY created_at DESC LIMIT 1').bind(r.id).first<{ suggested_outcome: string | null }>();
  if (last?.suggested_outcome) return c.json({ error: 'already_done' }, 409);
  if (!STAFF.includes(me.role)) { const gate = await memberGate(c); if (gate) return gate; }
  if (!STAFF.includes(me.role) && !(await takePrecheck(c.env, me.id))) return c.json({ error: 'precheck_limit' }, 429);
  const x = await asFeature('precheck', () => runAiReview(c.env, r.id));
  return x.ok ? c.json({ ok: true }) : c.json({ error: 'ai_failed' }, 502);
});

/** Admins pause or resume expert review. */
app.put('/api/admin/expert-review', need(ADMINS), async (c) => {
  const { enabled } = await parse(c, z.object({ enabled: z.boolean() }));
  await c.env.DB.prepare("INSERT INTO settings (key, value, updated_by, updated_at) VALUES ('expert_review_enabled', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
    .bind(enabled ? '1' : '0', c.get('user').id, nowIso()).run();
  await audit(c.env, c.get('user').id, 'settings.expert_review', 'settings', 'expert_review_enabled', { enabled });
  return c.json({ ok: true });
});
app.get('/api/admin/expert-review', need(STAFF), async (c) => c.json({ enabled: await expertReviewOn(c.env), limit: await getSettingNumber(c.env, 'ai_precheck_daily_limit', 5) }));

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
  c.executionCtx.waitUntil(notifyStaff(c.env, { title: '📷 More photos', body: `${r.brand} — ${me.name} · ${photos.length} new photos`, url: `/verify/r/${r.id}`, tag: r.id }, new URL(c.req.url).origin).catch(() => 0));
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
  if (body.side === 'customer') {
    c.executionCtx.waitUntil(notifyStaff(c.env, { title: '💰 Customer price', body: `${me.name} asks ${money(cents, body.currency)} · ${r.brand}${r.model_text ? ` ${r.model_text}` : ''}`, url: `/verify/r/${r.id}`, tag: `offer-${r.id}` }, new URL(c.req.url).origin).catch(() => 0));
  }
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
  if (isCustomer && action !== 'withdraw') {
    c.executionCtx.waitUntil(notifyStaff(c.env, { title: action === 'accept' ? '✅ Buy-back accepted' : '✖ Buy-back declined', body: `${me.name} · ${money(o.amount_cents, o.currency)} · ${o.brand}${o.model_text ? ` ${o.model_text}` : ''}`, url: `/verify/r/${o.request_id}`, tag: `offer-${o.request_id}` }, new URL(c.req.url).origin).catch(() => 0));
  }
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

// ───────────────────────── expert phone notifications (Web Push) ─────────────────────────
app.get('/api/push/key', need(STAFF), async (c) => c.json({ publicKey: (await vapidKeys(c.env)).publicKey }));
app.get('/api/push/status', need(STAFF), async (c) =>
  c.json({ phones: (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').bind(c.get('user').id).first<{ n: number }>())?.n ?? 0 }));
app.post('/api/push/subscribe', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ endpoint: z.string().url().startsWith('https://').max(1000), keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }) }));
  await c.env.DB.prepare(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .bind(uid('ps_'), c.get('user').id, b.endpoint, b.keys.p256dh, b.keys.auth).run();
  return c.json({ ok: true });
});
app.post('/api/push/unsubscribe', async (c) => {
  const { endpoint } = await parse(c, z.object({ endpoint: z.string().max(1000) }));
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, c.get('user').id).run();
  return c.json({ ok: true });
});
app.post('/api/push/test', need(STAFF), async (c) => {
  const sent = await notifyUser(c.env, c.get('user').id, { title: '🔔 HENGZ AUTHENTIC', body: 'Notifications work on this phone.', url: '/admin', tag: 'test' }, new URL(c.req.url).origin);
  return c.json({ sent });
});

// ───────────────────────── expert accounts (set up by admins) ─────────────────────────
app.get('/api/admin/experts', need(ADMINS), async (c) => c.json({ experts: (await c.env.DB.prepare(
  `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at, (SELECT COUNT(*) FROM push_subscriptions s WHERE s.user_id = u.id) AS phones
   FROM users u WHERE u.role IN ('owner','lead_authenticator','appraiser') ORDER BY u.active DESC, u.created_at`).all()).results }));
app.post('/api/admin/experts', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ name: z.string().trim().min(1).max(100), email: z.string().email().max(200), password: z.string().min(8).max(200) }));
  const id = uid('u_'); const p = await hashPassword(b.password);
  await c.env.DB.prepare('INSERT INTO users (id, email, name, role, pw_hash, pw_salt, pw_iter) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, b.email.toLowerCase(), b.name, 'appraiser', p.hash, p.salt, p.iter).run();
  await audit(c.env, c.get('user').id, 'expert.create', 'user', id);
  return c.json({ id });
});
app.post('/api/admin/experts/:id/active', need(ADMINS), async (c) => {
  const { active } = await parse(c, z.object({ active: z.boolean() }));
  const id = c.req.param('id');
  if (id === c.get('user').id) return c.json({ error: 'cannot_change_self' }, 400);
  const res = await c.env.DB.prepare(`UPDATE users SET active = ? WHERE id = ? AND role = 'appraiser'`).bind(active ? 1 : 0, id).run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  if (!active) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await audit(c.env, c.get('user').id, active ? 'expert.activate' : 'expert.deactivate', 'user', id);
  return c.json({ ok: true });
});

// ───────────────────────── HENGZ contact (LINE ID, phone, QR) shown to customers ─────────────────────────
const CONTACT_KEYS = ['contact.line_id', 'contact.phone', 'contact.telegram', 'contact.note'] as const;
app.get('/api/contact', async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT key, value FROM settings WHERE key LIKE 'contact.%'`).all<{ key: string; value: string }>()).results;
  const v = (k: string) => rows.find((r) => r.key === k)?.value || null;
  return c.json({ lineId: v('contact.line_id'), phone: v('contact.phone'), telegram: v('contact.telegram'), note: v('contact.note'), qr: !!v('contact.qr'), qrVersion: v('contact.qr') });
});
app.get('/api/contact/qr', async (c) => {
  const obj = await c.env.VAULT.get('site/contact-qr');
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/png', 'cache-control': 'public, max-age=300' } });
});
app.put('/api/admin/contact', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ lineId: z.string().trim().max(80), phone: z.string().trim().max(40), telegram: z.string().trim().max(80), note: z.string().trim().max(300) }));
  const vals: Record<string, string> = { 'contact.line_id': b.lineId, 'contact.phone': b.phone, 'contact.telegram': b.telegram, 'contact.note': b.note };
  for (const k of CONTACT_KEYS) {
    await c.env.DB.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
      .bind(k, vals[k], c.get('user').id).run();
  }
  await audit(c.env, c.get('user').id, 'contact.update', 'settings', null);
  return c.json({ ok: true });
});
app.post('/api/admin/contact/qr', need(ADMINS), async (c) => {
  const f = (await c.req.formData()).get('file');
  if (!(f instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (f.size > 5 * 1024 * 1024) return c.json({ error: 'file_too_large' }, 413);
  const buf = await f.arrayBuffer(); const mime = sniffImage(new Uint8Array(buf, 0, 16));
  if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
  await c.env.VAULT.put('site/contact-qr', buf, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare(`INSERT INTO settings (key, value, updated_by) VALUES ('contact.qr', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(String(Date.now()), c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'contact.qr', 'settings', null);
  return c.json({ ok: true });
});
app.delete('/api/admin/contact/qr', need(ADMINS), async (c) => {
  await c.env.VAULT.delete('site/contact-qr');
  await c.env.DB.prepare(`DELETE FROM settings WHERE key = 'contact.qr'`).run();
  return c.json({ ok: true });
});

// ───────────────────────── AI analysis for the experts (never shown to the customer) ─────────────────────────
async function runAiReview(env: AppEnv['Bindings'], requestId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await env.DB.prepare(`SELECT r.id, r.brand_id, r.model_text, COALESCE(r.brand_text, b.name) AS brand FROM verify_requests r JOIN brands b ON b.id = r.brand_id WHERE r.id = ?`)
    .bind(requestId).first<Record<string, any>>();
  if (!r) return { ok: false, error: 'not_found' };
  const rows = (await env.DB.prepare('SELECT step, r2_key, mime FROM verify_photos WHERE request_id = ? ORDER BY created_at LIMIT 10').bind(r.id).all<{ step: string; r2_key: string; mime: string }>()).results;
  const photos: { step: string; image: { data: ArrayBuffer; mime: string } }[] = [];
  for (const p of rows) { const o = await env.VAULT.get(p.r2_key); if (o) photos.push({ step: p.step, image: { data: await o.arrayBuffer(), mime: p.mime } }); }
  if (!photos.length) return { ok: false, error: 'no_photos' };
  const found = await verifyRefs(env, r.brand_id, r.model_text);
  const refs: { step: string; image: { data: ArrayBuffer; mime: string }; model: string | null }[] = [];
  for (const [step, x] of Object.entries(found)) {
    if (!photos.some((p) => p.step === step)) continue;
    const o = await env.VAULT.get(x.r2_key); if (o) refs.push({ step, image: { data: await o.arrayBuffer(), mime: o.httpMetadata?.contentType ?? 'image/jpeg' }, model: x.model });
  }
  const knowledge = (await env.DB.prepare(`SELECT DISTINCT p.label, p.note FROM reference_points p JOIN reference_assets a ON a.id = p.asset_id
    WHERE a.brand_id = ? AND p.source <> 'ai_suggested' AND a.label <> 'counterfeit' LIMIT 14`).bind(r.brand_id).all<{ label: string; note: string | null }>()).results
    .map((p) => `${p.label}${p.note ? `: ${p.note.split('\n')[0]}` : ''}`.slice(0, 200));
  // what the experts wrote on earlier answered bags of this brand (the AI learns what they look at)
  const expertNotes = (await env.DB.prepare(`SELECT expert_note FROM verify_requests WHERE brand_id = ? AND id <> ? AND status = 'answered' AND expert_note IS NOT NULL
    ORDER BY (model_text IS ?) DESC, answered_at DESC LIMIT 8`).bind(r.brand_id, r.id, r.model_text).all<{ expert_note: string }>()).results.map((x) => x.expert_note.slice(0, 240));
  const id = uid('ar_');
  try {
    const skills = (await pickSkills(env, 'check', { brand: r.brand, text: r.model_text ?? '' }, 4000)).map((x) => `${x.title}: ${x.body}`);
    const text = await assessVerification(env, { brand: r.brand, model: r.model_text, photos, refs, knowledge, expertNotes, skills });
    const a = parseAiReview(text);
    if (!a) throw new Error('ai_unreadable_reply');
    await env.DB.prepare(`INSERT INTO verify_ai_reviews (id, request_id, model, suggested_outcome, confidence, findings_json, summary_en, summary_km) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, r.id, pointsModel(env), a.suggestion, a.confidence, JSON.stringify(a.findings), a.summary_en || null, a.summary_km || null).run();
    return { ok: true };
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await env.DB.prepare('INSERT INTO verify_ai_reviews (id, request_id, model, error) VALUES (?, ?, ?, ?)').bind(id, r.id, pointsModel(env), msg).run();
    return { ok: false, error: msg };
  }
}

/** Staff: run (or re-run) the AI analysis now. */
app.post('/api/verify/:id/ai-review', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const res = await runAiReview(c.env, c.req.param('id'));
  if (!res.ok) return c.json({ error: 'ai_failed', detail: res.error }, 502);
  return c.json({ ok: true });
});

/** The AI's track record: how often its suggestion matched the expert's answer. */
async function aiTrack(env: AppEnv['Bindings']) {
  const rows = (await env.DB.prepare(`SELECT a.suggested_outcome AS suggested, r.expert_outcome AS expert FROM verify_requests r
    JOIN verify_ai_reviews a ON a.id = (SELECT x.id FROM verify_ai_reviews x WHERE x.request_id = r.id AND x.suggested_outcome IS NOT NULL
      AND (r.answered_at IS NULL OR x.created_at <= r.answered_at) ORDER BY x.created_at DESC LIMIT 1)
    WHERE r.expert_outcome IS NOT NULL`).all<{ suggested: string; expert: string }>().catch(() => ({ results: [] as { suggested: string; expert: string }[] }))).results;
  return trackRecord(rows);
}
app.get('/api/admin/ai/track', need(STAFF), async (c) => c.json(await aiTrack(c.env)));

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

// ───────────────────────── Anajak Secondhand: market data (TH / ID / MY), entered by staff ─────────────────────────
const COUNTRIES = ['TH', 'ID', 'MY'] as const;
const countrySchema = z.enum(COUNTRIES);
const periodSchema = z.string().regex(/^20\d\d-(0[1-9]|1[0-2])$/);
type TrendRow = { id: string; country: string; period: string; rank: number; brand: string; model: string; movement: string | null; image_id?: string | null;
  price_min: number | null; price_max: number | null; currency: string | null; note: string | null; source: string; created_at: string };

const latestPeriod = async (env: AppEnv['Bindings'], country: string) =>
  (await env.DB.prepare('SELECT MAX(period) AS p FROM market_trends WHERE country = ?').bind(country).first<{ p: string | null }>())?.p ?? null;
const monthRows = async (env: AppEnv['Bindings'], country: string, period: string, limit = 50) =>
  (await env.DB.prepare(`SELECT t.id, t.country, t.period, t.rank, t.brand, t.model, t.movement, t.price_min, t.price_max, t.currency, t.note, t.source, t.created_at,
      i.id AS image_id, i.cutout AS image_cutout, i.created_at AS image_at
    FROM market_trends t LEFT JOIN market_model_images i ON i.brand_key = lower(trim(t.brand)) AND i.model_key = lower(trim(t.model))
    WHERE t.country = ? AND t.period = ? ORDER BY t.rank LIMIT ?`).bind(country, period, limit).all<TrendRow>()).results;

/** One country: the chosen (or latest) month's ranking, the months on file, and the year so far built from those months. */
app.get('/api/market/trends', async (c) => {
  const country = countrySchema.parse(c.req.query('country') ?? 'TH');
  const periods = (await c.env.DB.prepare('SELECT DISTINCT period FROM market_trends WHERE country = ? ORDER BY period DESC LIMIT 36').bind(country).all<{ period: string }>()).results.map((r) => r.period);
  const asked = c.req.query('period');
  const period = asked && periodSchema.safeParse(asked).success && periods.includes(asked) ? asked : periods[0] ?? null;
  const rows = period ? await monthRows(c.env, country, period) : [];
  // the year view: models ranked in the most months of that year, then by their best and average rank
  const year = period ? period.slice(0, 4) : null;
  const yearRows = year ? (await c.env.DB.prepare(`SELECT brand, model, COUNT(*) AS months, MIN(rank) AS best_rank, ROUND(AVG(rank), 1) AS avg_rank
    FROM market_trends WHERE country = ? AND substr(period, 1, 4) = ? GROUP BY lower(brand), lower(model)
    ORDER BY months DESC, avg_rank ASC, best_rank ASC LIMIT 20`).bind(country, year).all()).results : [];
  const yearMonths = year ? periods.filter((p) => p.startsWith(year)).length : 0;
  return c.json({ country, period, periods, rows, year: year ? { year, months: yearMonths, rows: yearRows } : null });
});

/** Every country's latest month (top N) and the newest market updates: for the install screen and the home screen. */
app.get('/api/market/overview', async (c) => {
  const top = Math.min(20, Math.max(1, Number(c.req.query('top')) || 10));
  const countries = [];
  for (const country of COUNTRIES) {
    const period = await latestPeriod(c.env, country);
    countries.push({ country, period, rows: period ? await monthRows(c.env, country, period, top) : [] });
  }
  const updates = (await c.env.DB.prepare('SELECT id, country, title, body, source, created_at FROM market_updates ORDER BY created_at DESC LIMIT 6').all()).results;
  return c.json({ countries, updates });
});

app.get('/api/market/updates', async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));
  return c.json({ updates: (await c.env.DB.prepare('SELECT id, country, title, body, source, created_at FROM market_updates ORDER BY created_at DESC LIMIT ?').bind(limit).all()).results });
});

const trendInput = z.object({
  rank: z.number().int().min(1).max(50),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  movement: z.enum(['up', 'down', 'same', 'new']).nullable().optional(),
  price_min: z.number().int().min(0).nullable().optional(),
  price_max: z.number().int().min(0).nullable().optional(),
  currency: z.enum(['THB', 'IDR', 'MYR', 'USD']).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
}).refine((r) => (r.price_min == null && r.price_max == null) || !!r.currency, { message: 'currency_required', path: ['currency'] })
  .refine((r) => r.price_min == null || r.price_max == null || r.price_max >= r.price_min, { message: 'price_range', path: ['price_max'] });

/** Save one country's ranking for one month (replaces what was on file for that month). */
app.post('/api/admin/market/trends', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ country: countrySchema, period: periodSchema, source: z.string().trim().min(3).max(300), rows: z.array(trendInput).min(1).max(50) }));
  const ranks = new Set(b.rows.map((r) => r.rank));
  if (ranks.size !== b.rows.length) return c.json({ error: 'duplicate_rank' }, 400);
  const me = c.get('user');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM market_trends WHERE country = ? AND period = ?').bind(b.country, b.period),
    ...b.rows.map((r) => c.env.DB.prepare(`INSERT INTO market_trends (id, country, period, rank, brand, model, movement, price_min, price_max, currency, note, source, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(uid('mt_'), b.country, b.period, r.rank, r.brand, r.model, r.movement ?? null,
      r.price_min ?? null, r.price_max ?? null, r.currency ?? null, r.note || null, b.source, me.id)),
  ]);
  await audit(c.env, me.id, 'market.trends_saved', 'market_trends', `${b.country}:${b.period}`, { rows: b.rows.length });
  return c.json({ ok: true, rows: b.rows.length });
});

/** AI researches one country's second-hand bag market on the web: a draft (rows + real links) for staff to check and save. */
app.post('/api/admin/market/research', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ country: countrySchema, period: periodSchema }));
  try {
    const r = await asFeature('market_research', () => researchMarket(c.env, { country: b.country, period: b.period, lang: reqLang(c) }));
    await audit(c.env, c.get('user').id, 'market.research', 'market_trends', `${b.country}:${b.period}`, { rows: r.rows.length, sources: r.sources.length, model: r.model });
    return c.json({ ok: true, draft: r });
  } catch (e) {
    const m = String((e as Error).message);
    if (m === 'ai_web_not_configured') return c.json({ error: m }, 501);
    console.error('market research failed:', m);
    return c.json({ error: m === 'ai_refused' ? 'ai_refused' : 'ai_failed' }, 502);
  }
});

app.delete('/api/admin/market/trends', need(ADMINS), async (c) => {
  const country = countrySchema.parse(c.req.query('country')); const period = periodSchema.parse(c.req.query('period'));
  const r = await c.env.DB.prepare('DELETE FROM market_trends WHERE country = ? AND period = ?').bind(country, period).run();
  await audit(c.env, c.get('user').id, 'market.trends_deleted', 'market_trends', `${country}:${period}`);
  return c.json({ ok: true, deleted: r.meta.changes });
});

app.post('/api/admin/market/updates', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ country: countrySchema.nullable().optional(), title: z.string().trim().min(3).max(160), body: z.string().trim().max(2000).nullable().optional(), source: z.string().trim().min(3).max(300) }));
  const id = uid('mu_');
  await c.env.DB.prepare('INSERT INTO market_updates (id, country, title, body, source, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, b.country ?? null, b.title, b.body || null, b.source, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'market.update_posted', 'market_updates', id);
  return c.json({ ok: true, id });
});

app.delete('/api/admin/market/updates/:id', need(ADMINS), async (c) => {
  await c.env.DB.prepare('DELETE FROM market_updates WHERE id = ?').bind(c.req.param('id')).run();
  await audit(c.env, c.get('user').id, 'market.update_deleted', 'market_updates', c.req.param('id'));
  return c.json({ ok: true });
});

// ───────────────────────── Anajak Secondhand: trending-model photos (AI background removal) ─────────────────────────
const MAX_MODEL_PHOTO = 8 * 1024 * 1024;
const modelKey = (s: string) => s.trim().toLowerCase();

/** Public: the display photo (transparent cutout, or the original when AI could not cut it). */
app.get('/api/market/images/:id', async (c) => {
  const r = await c.env.DB.prepare('SELECT display_key, display_mime FROM market_model_images WHERE id = ?').bind(c.req.param('id')).first<{ display_key: string; display_mime: string }>();
  const obj = r ? await c.env.VAULT.get(r.display_key) : null;
  if (!r || !obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': r.display_mime, 'cache-control': 'public, max-age=86400' } });
});

/** Upload (or replace) the photo of one brand + model; AI removes the background, the original is kept too. */
app.post('/api/admin/market/images', need(ADMINS), async (c) => {
  const form = await c.req.formData();
  const brand = String(form.get('brand') ?? '').trim(); const model = String(form.get('model') ?? '').trim();
  const file = form.get('file');
  if (!brand || !model || brand.length > 80 || model.length > 120 || !(file instanceof File)) return c.json({ error: 'invalid_input' }, 400);
  if (file.size > MAX_MODEL_PHOTO) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf));
  if (!mime) return c.json({ error: 'not_an_image' }, 415);
  const id = uid('mi_');
  const originalKey = `market/models/${id}/original.${mime.split('/')[1]}`;
  await c.env.VAULT.put(originalKey, buf, { httpMetadata: { contentType: mime } });
  const cut = await removeBackground(c.env, buf, mime);
  const displayKey = cut ? `market/models/${id}/cutout.png` : originalKey;
  if (cut) await c.env.VAULT.put(displayKey, cut, { httpMetadata: { contentType: 'image/png' } });
  // replace the previous photo of this model (and its files)
  const old = await c.env.DB.prepare('SELECT id, original_key, display_key FROM market_model_images WHERE brand_key = ? AND model_key = ?')
    .bind(modelKey(brand), modelKey(model)).first<{ id: string; original_key: string; display_key: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM market_model_images WHERE brand_key = ? AND model_key = ?').bind(modelKey(brand), modelKey(model)),
    c.env.DB.prepare(`INSERT INTO market_model_images (id, brand_key, model_key, brand, model, original_key, display_key, display_mime, cutout, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, modelKey(brand), modelKey(model), brand, model, originalKey, displayKey, cut ? 'image/png' : mime, cut ? 1 : 0, c.get('user').id),
  ]);
  if (old) await c.env.VAULT.delete([...new Set([old.original_key, old.display_key])]);
  await audit(c.env, c.get('user').id, 'market.model_photo', 'market_model_images', id, { brand, model, cutout: !!cut });
  return c.json({ ok: true, id, cutout: !!cut });
});

/** Ask the AI again to remove the background of a photo whose cutout failed. */
app.post('/api/admin/market/images/:id/cutout', need(ADMINS), async (c) => {
  const r = await c.env.DB.prepare('SELECT id, original_key, display_key FROM market_model_images WHERE id = ?').bind(c.req.param('id')).first<{ id: string; original_key: string; display_key: string }>();
  const obj = r ? await c.env.VAULT.get(r.original_key) : null;
  if (!r || !obj) return c.json({ error: 'not_found' }, 404);
  const buf = await obj.arrayBuffer();
  const cut = await removeBackground(c.env, buf, sniffImage(new Uint8Array(buf)) ?? '');
  if (!cut) return c.json({ error: 'cutout_failed' }, 502);
  const displayKey = `market/models/${r.id}/cutout.png`;
  await c.env.VAULT.put(displayKey, cut, { httpMetadata: { contentType: 'image/png' } });
  await c.env.DB.prepare("UPDATE market_model_images SET display_key = ?, display_mime = 'image/png', cutout = 1, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(displayKey, r.id).run();
  return c.json({ ok: true, cutout: true });
});

app.delete('/api/admin/market/images/:id', need(ADMINS), async (c) => {
  const r = await c.env.DB.prepare('SELECT original_key, display_key FROM market_model_images WHERE id = ?').bind(c.req.param('id')).first<{ original_key: string; display_key: string }>();
  if (!r) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('DELETE FROM market_model_images WHERE id = ?').bind(c.req.param('id')).run();
  await c.env.VAULT.delete([...new Set([r.original_key, r.display_key])]);
  await audit(c.env, c.get('user').id, 'market.model_photo_deleted', 'market_model_images', c.req.param('id'));
  return c.json({ ok: true });
});

// ───────────────────────── Anajak Secondhand: bag painting / repair / care lessons ─────────────────────────
const CARE_TOPICS = ['cleaning', 'edge_paint', 'recolor', 'corners', 'hardware', 'odor', 'lining', 'other'] as const;
const CARE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
const MAX_CARE_PHOTO = 8 * 1024 * 1024;
const careEditor = (c: any) => ADMINS.includes(c.get('user').role);
type CareLesson = Record<string, any> & { id: string; status: string; before_key: string | null; after_key: string | null };

const careLesson = (env: AppEnv['Bindings'], id: string) => env.DB.prepare('SELECT * FROM care_lessons WHERE id = ?').bind(id).first<CareLesson>();
/** What the public sees of a lesson: never the storage keys, only whether a photo exists. */
const careOut = (l: CareLesson) => {
  const { before_key, after_key, created_by, ...rest } = l;
  return { ...rest, has_before: !!before_key, has_after: !!after_key };
};

/** Published lessons for everyone; editors also see drafts. */
app.get('/api/care/lessons', async (c) => {
  const all = careEditor(c) && c.req.query('all') === '1';
  const rows = (await c.env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM care_lesson_steps s WHERE s.lesson_id = l.id) AS steps
    FROM care_lessons l ${all ? '' : "WHERE l.status = 'published'"} ORDER BY l.status = 'published' DESC, COALESCE(l.published_at, l.updated_at) DESC`).all<CareLesson>()).results;
  return c.json({ lessons: rows.map(careOut) });
});

app.get('/api/care/lessons/:id', async (c) => {
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l || (l.status !== 'published' && !careEditor(c))) return c.json({ error: 'not_found' }, 404);
  const steps = (await c.env.DB.prepare('SELECT id, sort, body, tip, photo_key FROM care_lesson_steps WHERE lesson_id = ? ORDER BY sort').bind(l.id).all<Record<string, any>>()).results
    .map(({ photo_key, ...s }) => ({ ...s, has_photo: !!photo_key }));
  return c.json({ lesson: careOut(l), steps });
});

const servePhoto = async (c: any, key: string | null | undefined) => {
  const obj = key ? await c.env.VAULT.get(key) : null;
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'public, max-age=3600' } });
};
app.get('/api/care/lessons/:id/photo/:which', async (c) => {
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l || (l.status !== 'published' && !careEditor(c))) return c.json({ error: 'not_found' }, 404);
  return servePhoto(c, c.req.param('which') === 'before' ? l.before_key : c.req.param('which') === 'after' ? l.after_key : null);
});
app.get('/api/care/steps/:id/photo', async (c) => {
  const s = await c.env.DB.prepare('SELECT s.photo_key, l.status FROM care_lesson_steps s JOIN care_lessons l ON l.id = s.lesson_id WHERE s.id = ?').bind(c.req.param('id')).first<{ photo_key: string | null; status: string }>();
  if (!s || (s.status !== 'published' && !careEditor(c))) return c.json({ error: 'not_found' }, 404);
  return servePhoto(c, s.photo_key);
});

const careFields = z.object({
  topic: z.enum(CARE_TOPICS), level: z.enum(CARE_LEVELS),
  title_km: z.string().trim().min(3).max(160), title_en: z.string().trim().max(160).nullable().optional(),
  summary: z.string().trim().max(800).nullable().optional(), materials: z.string().trim().max(1500).nullable().optional(),
  safety: z.string().trim().max(1000).nullable().optional(), minutes: z.number().int().min(1).max(1440).nullable().optional(),
});

app.post('/api/admin/care/lessons', need(ADMINS), async (c) => {
  const b = await parse(c, careFields);
  const id = uid('cl_');
  await c.env.DB.prepare(`INSERT INTO care_lessons (id, topic, level, title_km, title_en, summary, materials, safety, minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, b.topic, b.level, b.title_km, b.title_en || null, b.summary || null, b.materials || null, b.safety || null, b.minutes ?? null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'care.lesson_created', 'care_lessons', id);
  return c.json({ ok: true, id });
});

app.put('/api/admin/care/lessons/:id', need(ADMINS), async (c) => {
  const b = await parse(c, careFields);
  const r = await c.env.DB.prepare(`UPDATE care_lessons SET topic = ?, level = ?, title_km = ?, title_en = ?, summary = ?, materials = ?, safety = ?, minutes = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(b.topic, b.level, b.title_km, b.title_en || null, b.summary || null, b.materials || null, b.safety || null, b.minutes ?? null, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

app.post('/api/admin/care/lessons/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['draft', 'published']) }));
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l) return c.json({ error: 'not_found' }, 404);
  if (status === 'published') {
    const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM care_lesson_steps WHERE lesson_id = ?').bind(l.id).first<{ n: number }>())?.n ?? 0;
    if (n === 0) return c.json({ error: 'no_steps' }, 400);
  }
  await c.env.DB.prepare(`UPDATE care_lessons SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE published_at END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(status, status, l.id).run();
  await audit(c.env, c.get('user').id, `care.lesson_${status}`, 'care_lessons', l.id);
  return c.json({ ok: true });
});

app.delete('/api/admin/care/lessons/:id', need(ADMINS), async (c) => {
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l) return c.json({ error: 'not_found' }, 404);
  const keys = (await c.env.DB.prepare('SELECT photo_key FROM care_lesson_steps WHERE lesson_id = ? AND photo_key IS NOT NULL').bind(l.id).all<{ photo_key: string }>()).results.map((r) => r.photo_key);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM care_lesson_steps WHERE lesson_id = ?').bind(l.id),
    c.env.DB.prepare('DELETE FROM care_lessons WHERE id = ?').bind(l.id),
  ]);
  const all = [...keys, l.before_key, l.after_key].filter((k): k is string => !!k);
  if (all.length) await c.env.VAULT.delete(all);
  await audit(c.env, c.get('user').id, 'care.lesson_deleted', 'care_lessons', l.id);
  return c.json({ ok: true });
});

/** Read an uploaded photo from a multipart form (field "file"): checked to be a real image and not too large. */
async function carePhotoFrom(c: any): Promise<{ buf: ArrayBuffer; mime: string } | Response> {
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) return c.json({ error: 'invalid_input' }, 400);
  if (file.size > MAX_CARE_PHOTO) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf));
  return mime ? { buf, mime } : c.json({ error: 'not_an_image' }, 415);
}

app.post('/api/admin/care/lessons/:id/photo/:which', need(ADMINS), async (c) => {
  const which = c.req.param('which');
  if (which !== 'before' && which !== 'after') return c.json({ error: 'invalid_input' }, 400);
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l) return c.json({ error: 'not_found' }, 404);
  const p = await carePhotoFrom(c);
  if (p instanceof Response) return p;
  const key = `care/${l.id}/${which}-${uid()}.${p.mime.split('/')[1]}`;
  await c.env.VAULT.put(key, p.buf, { httpMetadata: { contentType: p.mime } });
  await c.env.DB.prepare(`UPDATE care_lessons SET ${which === 'before' ? 'before_key' : 'after_key'} = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(key, l.id).run();
  const old = which === 'before' ? l.before_key : l.after_key;
  if (old) await c.env.VAULT.delete(old);
  return c.json({ ok: true });
});

const stepFields = z.object({ body: z.string().trim().min(3).max(2000), tip: z.string().trim().max(600).nullable().optional() });

app.post('/api/admin/care/lessons/:id/steps', need(ADMINS), async (c) => {
  const b = await parse(c, stepFields);
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l) return c.json({ error: 'not_found' }, 404);
  const next = ((await c.env.DB.prepare('SELECT MAX(sort) AS m FROM care_lesson_steps WHERE lesson_id = ?').bind(l.id).first<{ m: number | null }>())?.m ?? 0) + 1;
  const id = uid('cs_');
  await c.env.DB.prepare('INSERT INTO care_lesson_steps (id, lesson_id, sort, body, tip) VALUES (?, ?, ?, ?, ?)').bind(id, l.id, next, b.body, b.tip || null).run();
  await c.env.DB.prepare("UPDATE care_lessons SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(l.id).run();
  return c.json({ ok: true, id });
});

app.put('/api/admin/care/steps/:id', need(ADMINS), async (c) => {
  const b = await parse(c, stepFields);
  const r = await c.env.DB.prepare('UPDATE care_lesson_steps SET body = ?, tip = ? WHERE id = ?').bind(b.body, b.tip || null, c.req.param('id')).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

/** Move a step one place up or down (swaps its position with the neighbour). */
app.post('/api/admin/care/steps/:id/move', need(ADMINS), async (c) => {
  const { dir } = await parse(c, z.object({ dir: z.enum(['up', 'down']) }));
  const s = await c.env.DB.prepare('SELECT id, lesson_id, sort FROM care_lesson_steps WHERE id = ?').bind(c.req.param('id')).first<{ id: string; lesson_id: string; sort: number }>();
  if (!s) return c.json({ error: 'not_found' }, 404);
  const n = await c.env.DB.prepare(`SELECT id, sort FROM care_lesson_steps WHERE lesson_id = ? AND sort ${dir === 'up' ? '<' : '>'} ? ORDER BY sort ${dir === 'up' ? 'DESC' : 'ASC'} LIMIT 1`)
    .bind(s.lesson_id, s.sort).first<{ id: string; sort: number }>();
  if (!n) return c.json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE care_lesson_steps SET sort = ? WHERE id = ?').bind(n.sort, s.id),
    c.env.DB.prepare('UPDATE care_lesson_steps SET sort = ? WHERE id = ?').bind(s.sort, n.id),
  ]);
  return c.json({ ok: true });
});

app.delete('/api/admin/care/steps/:id', need(ADMINS), async (c) => {
  const s = await c.env.DB.prepare('SELECT photo_key FROM care_lesson_steps WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null }>();
  if (!s) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('DELETE FROM care_lesson_steps WHERE id = ?').bind(c.req.param('id')).run();
  if (s.photo_key) await c.env.VAULT.delete(s.photo_key);
  return c.json({ ok: true });
});

app.post('/api/admin/care/steps/:id/photo', need(ADMINS), async (c) => {
  const s = await c.env.DB.prepare('SELECT id, lesson_id, photo_key FROM care_lesson_steps WHERE id = ?').bind(c.req.param('id')).first<{ id: string; lesson_id: string; photo_key: string | null }>();
  if (!s) return c.json({ error: 'not_found' }, 404);
  const p = await carePhotoFrom(c);
  if (p instanceof Response) return p;
  const key = `care/${s.lesson_id}/step-${uid()}.${p.mime.split('/')[1]}`;
  await c.env.VAULT.put(key, p.buf, { httpMetadata: { contentType: p.mime } });
  await c.env.DB.prepare('UPDATE care_lesson_steps SET photo_key = ? WHERE id = ?').bind(key, s.id).run();
  await c.env.DB.prepare("UPDATE care_lessons SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(s.lesson_id).run();
  if (s.photo_key) await c.env.VAULT.delete(s.photo_key);
  return c.json({ ok: true });
});

/** AI drafts the steps (and empty fields) of a lesson that has none yet; it stays a draft for staff to check. */
app.post('/api/admin/care/lessons/:id/ai-draft', need(ADMINS), async (c) => {
  const l = await careLesson(c.env, c.req.param('id'));
  if (!l) return c.json({ error: 'not_found' }, 404);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM care_lesson_steps WHERE lesson_id = ?').bind(l.id).first<{ n: number }>())?.n ?? 0;
  if (n > 0) return c.json({ error: 'has_steps' }, 409);
  let d;
  try { d = await asFeature('lesson_draft', () => draftCareLesson(c.env, { topic: l.topic, level: l.level, title: l.title_km, lang: reqLang(c) })); }
  catch (e) { console.error('care draft failed:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE care_lessons SET summary = COALESCE(summary, ?), materials = COALESCE(materials, ?), safety = COALESCE(safety, ?), minutes = COALESCE(minutes, ?),
      ai_drafted = 1, status = 'draft', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(d.summary || null, d.materials || null, d.safety || null, d.minutes, l.id),
    ...d.steps.map((s, i) => c.env.DB.prepare('INSERT INTO care_lesson_steps (id, lesson_id, sort, body, tip) VALUES (?, ?, ?, ?, ?)').bind(uid('cs_'), l.id, i + 1, s.body, s.tip)),
  ]);
  await audit(c.env, c.get('user').id, 'care.lesson_ai_draft', 'care_lessons', l.id, { steps: d.steps.length, model: aiModel(c.env) });
  return c.json({ ok: true, steps: d.steps.length });
});

/** Real counts of what the app teaches and tracks, shown to everyone on the home screen. */
app.get('/api/stats/public', async (c) => {
  const one = async (sql: string) => (await c.env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0;
  return c.json({
    paintRecipes: await one("SELECT COUNT(*) AS n FROM paint_recipes WHERE status = 'published'"),
    careLessons: await one("SELECT COUNT(*) AS n FROM care_lessons WHERE status = 'published'"),
    authLessons: await one("SELECT COUNT(DISTINCT model_id) AS n FROM lesson_steps WHERE status <> 'retired'"),
    referencePhotos: await one("SELECT COUNT(*) AS n FROM reference_assets WHERE status = 'approved'"),
    brands: await one("SELECT COUNT(DISTINCT brand_id) AS n FROM reference_assets WHERE status = 'approved'"),
    marketMonths: await one('SELECT COUNT(DISTINCT country || period) AS n FROM market_trends'),
  });
});

// ───────────────────────── Anajak Secondhand: paint mixer (colour recipes measured with a white reference) ─────────────────────────
const PAINT_KINDS = ['leather_paint', 'edge_paint', 'dye', 'finisher', 'preparer', 'cleaner', 'other'] as const;
const SURFACES = ['smooth_leather', 'grained_leather', 'vachetta', 'coated_canvas', 'suede', 'edge', 'other'] as const;
const FINISHES = ['matte', 'satin', 'gloss'] as const;
const patchSchema = z.object({ mean: z.tuple([z.number(), z.number(), z.number()]), sd: z.number(), clipped: z.number(), n: z.number().int() });
const measurementSchema = z.object({ sample: patchSchema, white: patchSchema, blur: z.number(), minSide: z.number(), distance: z.number(), r: z.number() });

type PaintProduct = { id: string; brand: string; name: string; kind: string; color_hex: string | null; info: string | null; sources_json: string; photo_key: string | null; active: number; updated_at: string };
const productOut = ({ photo_key, sources_json, ...p }: PaintProduct & Record<string, unknown>) => ({ ...p, has_photo: !!photo_key, sources: JSON.parse(sources_json || '[]') });

/** Recipes with their parts (paint, brand, ratio). Public: published only. */
async function paintRecipes(env: AppEnv['Bindings'], all: boolean) {
  const recipes = (await env.DB.prepare(`SELECT id, name_km, name_en, surface, finish, lab_l, lab_a, lab_b, hex, method, status, photo_key, updated_at, mix_text, mix_tts_key FROM paint_recipes
    ${all ? '' : "WHERE status = 'published'"} ORDER BY lab_l DESC`).all<Record<string, any>>()).results;
  const parts = (await env.DB.prepare(`SELECT pp.recipe_id, pp.parts, pp.sort, p.id, p.brand, p.name, p.kind, p.color_hex, p.photo_key, p.updated_at
    FROM paint_recipe_parts pp JOIN paint_products p ON p.id = pp.product_id ORDER BY pp.sort`).all<Record<string, any>>()).results;
  const steps = (await env.DB.prepare('SELECT id, recipe_id, sort, text, icon, minutes, photo_key, tts_key, voice_key, updated_at FROM paint_recipe_steps ORDER BY sort').all<Record<string, any>>()).results;
  return recipes.map(({ photo_key, mix_tts_key, ...r }): Record<string, any> => ({
    ...r, has_photo: !!photo_key, mix_audio: !!mix_tts_key,
    steps: steps.filter((s) => s.recipe_id === r.id).map(({ recipe_id, photo_key: pk, tts_key, voice_key, ...s }) => ({ ...s, has_photo: !!pk, audio: voice_key ? 'voice' : tts_key ? 'tts' : null })),
    parts: parts.filter((p) => p.recipe_id === r.id).map(({ recipe_id, photo_key: pk, ...p }) => ({ ...p, has_photo: !!pk })),
  }));
}

app.get('/api/paint/recipes', async (c) => c.json({ recipes: await paintRecipes(c.env, careEditor(c) && c.req.query('all') === '1') }));
app.get('/api/paint/products', async (c) => {
  const all = careEditor(c) && c.req.query('all') === '1';
  const rows = (await c.env.DB.prepare(`SELECT * FROM paint_products ${all ? '' : 'WHERE active = 1'} ORDER BY brand, name`).all<PaintProduct>()).results;
  return c.json({ products: rows.map(productOut) });
});
app.get('/api/paint/products/:id/photo', async (c) =>
  servePhoto(c, (await c.env.DB.prepare('SELECT photo_key FROM paint_products WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null }>())?.photo_key));
app.get('/api/paint/recipes/:id/photo', async (c) => {
  const r = await c.env.DB.prepare('SELECT photo_key, status FROM paint_recipes WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null; status: string }>();
  if (!r || (r.status !== 'published' && !careEditor(c))) return c.json({ error: 'not_found' }, 404);
  return servePhoto(c, r.photo_key);
});

/**
 * Match a measured bag colour against the published recipes. The measurement is checked again here with the
 * same rules as the phone; a bad photo gets the reasons and no colour at all. Beyond ΔE2000 6: no recipe.
 */
app.post('/api/paint/match', async (c) => {
  const { measurement } = await parse(c, z.object({ measurement: measurementSchema }));
  const issues = checkMeasurement(measurement);
  if (issues.length) return c.json({ ok: false, issues }, 422);
  const lab = measuredLab(measurement);
  const ranked = (await paintRecipes(c.env, false))
    .map((r) => ({ recipe: r, dE: Math.round(deltaE2000(lab, [r.lab_l, r.lab_a, r.lab_b]) * 10) / 10 }))
    .sort((a, b) => a.dE - b.dE);
  const usable = ranked.filter((x) => matchLevel(x.dE) !== 'none').slice(0, 3);
  return c.json({ ok: true, lab, hex: labToHex(lab), matches: usable.map((x) => ({ ...x, level: matchLevel(x.dE) })), nearest: ranked[0]?.dE ?? null });
});

/** Ask for a recipe for a colour that has none (signed-in users; the colour only, no photo). */
app.post('/api/paint/requests', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const b = await parse(c, z.object({ measurement: measurementSchema, note: z.string().trim().max(300).nullable().optional() }));
  const issues = checkMeasurement(b.measurement);
  if (issues.length) return c.json({ ok: false, issues }, 422);
  const recent = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM paint_color_requests WHERE user_id = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')").bind(me.id).first<{ n: number }>())?.n ?? 0;
  if (recent >= 10) return c.json({ error: 'too_many' }, 429);
  const lab = measuredLab(b.measurement);
  await c.env.DB.prepare('INSERT INTO paint_color_requests (id, user_id, lab_l, lab_a, lab_b, hex, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(uid('pq_'), me.id, lab[0], lab[1], lab[2], labToHex(lab), b.note || null).run();
  return c.json({ ok: true });
});

app.get('/api/admin/paint/requests', need(ADMINS), async (c) =>
  c.json({ requests: (await c.env.DB.prepare(`SELECT r.id, r.lab_l, r.lab_a, r.lab_b, r.hex, r.note, r.created_at, u.name AS by_name
    FROM paint_color_requests r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 100`).all()).results }));
app.delete('/api/admin/paint/requests/:id', need(ADMINS), async (c) => {
  await c.env.DB.prepare('DELETE FROM paint_color_requests WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/** Read a multipart form: its text fields and an optional checked image ("file"). */
async function formWithPhoto(c: any): Promise<{ fields: Record<string, string>; photo: { buf: ArrayBuffer; mime: string } | null } | Response> {
  const fd = await c.req.formData();
  const fields: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') fields[k] = v;
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { fields, photo: null };
  if (file.size > MAX_CARE_PHOTO) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf));
  return mime ? { fields, photo: { buf, mime } } : c.json({ error: 'not_an_image' }, 415);
}
const putPhoto = async (env: AppEnv['Bindings'], prefix: string, p: { buf: ArrayBuffer; mime: string }) => {
  const key = `${prefix}-${uid()}.${p.mime.split('/')[1]}`;
  await env.VAULT.put(key, p.buf, { httpMetadata: { contentType: p.mime } });
  return key;
};

const productFields = z.object({
  brand: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(120), kind: z.enum(PAINT_KINDS),
  color_hex: z.string().regex(/^#[0-9a-f]{6}$/).nullable().optional(), info: z.string().trim().max(3000).nullable().optional(),
  sources: z.array(z.object({ title: z.string().max(200), url: z.string().url().max(500) })).max(10).optional(), active: z.boolean().optional(),
});
const productFromForm = (f: Record<string, string>) => productFields.parse({
  brand: f.brand, name: f.name, kind: f.kind, color_hex: f.color_hex || null, info: f.info || null,
  sources: f.sources ? JSON.parse(f.sources) : [], active: f.active === undefined ? undefined : f.active === '1',
});

app.post('/api/admin/paint/products', need(ADMINS), async (c) => {
  const r = await formWithPhoto(c); if (r instanceof Response) return r;
  const b = productFromForm(r.fields);
  const id = uid('pp_');
  const key = r.photo ? await putPhoto(c.env, `paint/products/${id}`, r.photo) : null;
  await c.env.DB.prepare(`INSERT INTO paint_products (id, brand, name, kind, color_hex, info, sources_json, photo_key, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, b.brand, b.name, b.kind, b.color_hex ?? null, b.info ?? null, JSON.stringify(b.sources ?? []), key, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'paint.product_created', 'paint_products', id);
  return c.json({ ok: true, id });
});

app.put('/api/admin/paint/products/:id', need(ADMINS), async (c) => {
  const old = await c.env.DB.prepare('SELECT photo_key FROM paint_products WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null }>();
  if (!old) return c.json({ error: 'not_found' }, 404);
  const r = await formWithPhoto(c); if (r instanceof Response) return r;
  const b = productFromForm(r.fields);
  const key = r.photo ? await putPhoto(c.env, `paint/products/${c.req.param('id')}`, r.photo) : old.photo_key;
  await c.env.DB.prepare(`UPDATE paint_products SET brand = ?, name = ?, kind = ?, color_hex = ?, info = ?, sources_json = ?, photo_key = ?, active = ?,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(b.brand, b.name, b.kind, b.color_hex ?? null, b.info ?? null, JSON.stringify(b.sources ?? []), key, b.active === false ? 0 : 1, c.req.param('id')).run();
  if (r.photo && old.photo_key) await c.env.VAULT.delete(old.photo_key);
  return c.json({ ok: true });
});

app.delete('/api/admin/paint/products/:id', need(ADMINS), async (c) => {
  const used = await c.env.DB.prepare('SELECT 1 FROM paint_recipe_parts WHERE product_id = ? LIMIT 1').bind(c.req.param('id')).first();
  if (used) return c.json({ error: 'in_use' }, 409);
  const p = await c.env.DB.prepare('SELECT photo_key FROM paint_products WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null }>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('DELETE FROM paint_products WHERE id = ?').bind(c.req.param('id')).run();
  if (p.photo_key) await c.env.VAULT.delete(p.photo_key);
  return c.json({ ok: true });
});

/** AI looks the product up on the web: a draft (text + real links) for staff to read before using any of it. */
app.post('/api/admin/paint/products/:id/research', need(ADMINS), async (c) => {
  const p = await c.env.DB.prepare('SELECT brand, name, kind FROM paint_products WHERE id = ?').bind(c.req.param('id')).first<{ brand: string; name: string; kind: string }>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  try {
    const r = await asFeature('paint_research', () => researchPaintProduct(c.env, { ...p, lang: reqLang(c) }));
    await audit(c.env, c.get('user').id, 'paint.product_research', 'paint_products', c.req.param('id'), { model: r.model, sources: r.sources.length });
    return c.json({ ok: true, draft: r });
  } catch (e) {
    const m = String((e as Error).message);
    if (m === 'ai_web_not_configured') return c.json({ error: m }, 501);
    console.error('paint research failed:', m);
    return c.json({ error: m === 'ai_refused' ? 'ai_refused' : 'ai_failed' }, 502);
  }
});

const recipeFields = z.object({
  name_km: z.string().trim().min(2).max(120), name_en: z.string().trim().max(120).nullable().optional(),
  surface: z.enum(SURFACES), finish: z.enum(FINISHES), method: z.string().trim().max(3000).nullable().optional(),
});

/** New recipe: a photo of the bag colour with a white reference, measured with the same rules as for users. */
app.post('/api/admin/paint/recipes', need(ADMINS), async (c) => {
  const r = await formWithPhoto(c); if (r instanceof Response) return r;
  const b = recipeFields.parse({ name_km: r.fields.name_km, name_en: r.fields.name_en || null, surface: r.fields.surface, finish: r.fields.finish, method: r.fields.method || null });
  const m = measurementSchema.parse(JSON.parse(r.fields.measurement ?? 'null'));
  const issues = checkMeasurement(m);
  if (issues.length) return c.json({ ok: false, issues }, 422);
  const lab = measuredLab(m);
  const id = uid('pr_');
  const key = r.photo ? await putPhoto(c.env, `paint/recipes/${id}`, r.photo) : null;
  await c.env.DB.prepare(`INSERT INTO paint_recipes (id, name_km, name_en, surface, finish, lab_l, lab_a, lab_b, hex, measure_json, photo_key, method, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, b.name_km, b.name_en ?? null, b.surface, b.finish, lab[0], lab[1], lab[2], labToHex(lab), JSON.stringify(m), key, b.method ?? null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'paint.recipe_created', 'paint_recipes', id, { lab });
  return c.json({ ok: true, id, lab, hex: labToHex(lab) });
});

app.put('/api/admin/paint/recipes/:id', need(ADMINS), async (c) => {
  const b = await parse(c, recipeFields.extend({ parts: z.array(z.object({ product_id: z.string(), parts: z.number().positive().max(100) })).max(8), mix_text: z.string().trim().max(500).nullable().optional() }));
  const ids = new Set(b.parts.map((p) => p.product_id));
  if (ids.size !== b.parts.length) return c.json({ error: 'duplicate_product' }, 400);
  const r = await c.env.DB.prepare(`UPDATE paint_recipes SET name_km = ?, name_en = ?, surface = ?, finish = ?, method = ?, mix_text = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(b.name_km, b.name_en ?? null, b.surface, b.finish, b.method ?? null, b.mix_text || null, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM paint_recipe_parts WHERE recipe_id = ?').bind(c.req.param('id')),
    ...b.parts.map((p, i) => c.env.DB.prepare('INSERT INTO paint_recipe_parts (recipe_id, product_id, parts, sort) VALUES (?, ?, ?, ?)').bind(c.req.param('id'), p.product_id, p.parts, i)),
  ]);
  const voiced = await mixTts(c.env, c.req.param('id'));
  return c.json({ ok: true, voiced });
});

app.post('/api/admin/paint/recipes/:id/status', need(ADMINS), async (c) => {
  const { status } = await parse(c, z.object({ status: z.enum(['draft', 'published']) }));
  if (status === 'published') {
    const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM paint_recipe_parts WHERE recipe_id = ?').bind(c.req.param('id')).first<{ n: number }>())?.n ?? 0;
    if (!n) return c.json({ error: 'no_parts' }, 400);
  }
  const r = await c.env.DB.prepare("UPDATE paint_recipes SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(status, c.req.param('id')).run();
  if (!r.meta.changes) return c.json({ error: 'not_found' }, 404);
  await audit(c.env, c.get('user').id, `paint.recipe_${status}`, 'paint_recipes', c.req.param('id'));
  return c.json({ ok: true });
});

app.delete('/api/admin/paint/recipes/:id', need(ADMINS), async (c) => {
  const r = await c.env.DB.prepare('SELECT photo_key FROM paint_recipes WHERE id = ?').bind(c.req.param('id')).first<{ photo_key: string | null }>();
  if (!r) return c.json({ error: 'not_found' }, 404);
  const files = (await c.env.DB.prepare(`SELECT photo_key AS k FROM paint_recipe_steps WHERE recipe_id = ? UNION ALL SELECT tts_key FROM paint_recipe_steps WHERE recipe_id = ?
    UNION ALL SELECT voice_key FROM paint_recipe_steps WHERE recipe_id = ? UNION ALL SELECT mix_tts_key FROM paint_recipes WHERE id = ?`)
    .bind(c.req.param('id'), c.req.param('id'), c.req.param('id'), c.req.param('id')).all<{ k: string | null }>()).results.map((x) => x.k).filter((k): k is string => !!k);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM paint_recipe_steps WHERE recipe_id = ?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM paint_recipe_parts WHERE recipe_id = ?').bind(c.req.param('id')),
    c.env.DB.prepare('DELETE FROM paint_recipes WHERE id = ?').bind(c.req.param('id')),
  ]);
  const all = [...files, r.photo_key].filter((k): k is string => !!k);
  if (all.length) await c.env.VAULT.delete(all);
  await audit(c.env, c.get('user').id, 'paint.recipe_deleted', 'paint_recipes', c.req.param('id'));
  return c.json({ ok: true });
});

// ───────────────────────── Anajak Secondhand: painting step cards with pictures and voice ─────────────────────────
const MAX_VOICE = 4 * 1024 * 1024;
const stepFieldsP = z.object({ text: z.string().trim().min(2).max(500), icon: z.enum(STEP_ICONS).nullable().optional(), minutes: z.number().int().min(1).max(1440).nullable().optional() });
type PStep = { id: string; recipe_id: string; sort: number; text: string; icon: string | null; minutes: number | null; photo_key: string | null; tts_key: string | null; tts_hash: string | null; voice_key: string | null; voice_mime: string | null; updated_at: string };

/** Is this recipe visible to the caller (published, or the caller edits recipes)? */
const recipeVisible = async (c: any, recipeId: string) => {
  const r = await c.env.DB.prepare('SELECT status FROM paint_recipes WHERE id = ?').bind(recipeId).first();
  return !!r && (r.status === 'published' || careEditor(c));
};
const stepOf = (env: AppEnv['Bindings'], id: string) => env.DB.prepare('SELECT * FROM paint_recipe_steps WHERE id = ?').bind(id).first<PStep>();
const touchRecipe = (env: AppEnv['Bindings'], id: string) => env.DB.prepare("UPDATE paint_recipes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(id).run();

/** (Re)generate the AI voice of a step when its words changed. Returns false when TTS is unavailable or failed. */
async function stepTts(env: AppEnv['Bindings'], s: PStep): Promise<boolean> {
  if (!ttsConfigured(env)) return false;
  const hash = await ttsHash(env, s.text);
  if (s.tts_key && s.tts_hash === hash) return true;
  try {
    const mp3 = await synthesize(env, s.text);
    const key = `paint/voice/${s.recipe_id}/${s.id}-${hash.slice(0, 12)}.mp3`;
    await env.VAULT.put(key, mp3, { httpMetadata: { contentType: 'audio/mpeg' } });
    await env.DB.prepare('UPDATE paint_recipe_steps SET tts_key = ?, tts_hash = ? WHERE id = ?').bind(key, hash, s.id).run();
    if (s.tts_key && s.tts_key !== key) await env.VAULT.delete(s.tts_key);
    return true;
  } catch (e) { console.error('step tts failed:', (e as Error).message); return false; }
}
async function mixTts(env: AppEnv['Bindings'], recipeId: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT mix_text, mix_tts_key, mix_tts_hash FROM paint_recipes WHERE id = ?').bind(recipeId).first<{ mix_text: string | null; mix_tts_key: string | null; mix_tts_hash: string | null }>();
  if (!r?.mix_text || !ttsConfigured(env)) return false;
  const hash = await ttsHash(env, r.mix_text);
  if (r.mix_tts_key && r.mix_tts_hash === hash) return true;
  try {
    const key = `paint/voice/${recipeId}/mix-${hash.slice(0, 12)}.mp3`;
    await env.VAULT.put(key, await synthesize(env, r.mix_text), { httpMetadata: { contentType: 'audio/mpeg' } });
    await env.DB.prepare('UPDATE paint_recipes SET mix_tts_key = ?, mix_tts_hash = ? WHERE id = ?').bind(key, hash, recipeId).run();
    if (r.mix_tts_key && r.mix_tts_key !== key) await env.VAULT.delete(r.mix_tts_key);
    return true;
  } catch (e) { console.error('mix tts failed:', (e as Error).message); return false; }
}

const serveAudio = async (c: any, key: string | null | undefined, mime = 'audio/mpeg') => {
  const obj = key ? await c.env.VAULT.get(key) : null;
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? mime, 'cache-control': 'public, max-age=3600' } });
};

app.get('/api/paint/steps/:id/photo', async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s || !(await recipeVisible(c, s.recipe_id))) return c.json({ error: 'not_found' }, 404);
  return servePhoto(c, s.photo_key);
});
/** The step's voice: the staff recording when there is one, otherwise the AI voice. */
app.get('/api/paint/steps/:id/audio', async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s || !(await recipeVisible(c, s.recipe_id))) return c.json({ error: 'not_found' }, 404);
  return s.voice_key ? serveAudio(c, s.voice_key, s.voice_mime ?? 'audio/wav') : serveAudio(c, s.tts_key);
});
app.get('/api/paint/recipes/:id/mix-audio', async (c) => {
  if (!(await recipeVisible(c, c.req.param('id')))) return c.json({ error: 'not_found' }, 404);
  const r = await c.env.DB.prepare('SELECT mix_tts_key FROM paint_recipes WHERE id = ?').bind(c.req.param('id')).first<{ mix_tts_key: string | null }>();
  return serveAudio(c, r?.mix_tts_key);
});

app.post('/api/admin/paint/recipes/:id/steps', need(ADMINS), async (c) => {
  const b = await parse(c, stepFieldsP);
  const rid = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT 1 FROM paint_recipes WHERE id = ?').bind(rid).first())) return c.json({ error: 'not_found' }, 404);
  const next = ((await c.env.DB.prepare('SELECT MAX(sort) AS m FROM paint_recipe_steps WHERE recipe_id = ?').bind(rid).first<{ m: number | null }>())?.m ?? 0) + 1;
  const id = uid('ps_');
  await c.env.DB.prepare('INSERT INTO paint_recipe_steps (id, recipe_id, sort, text, icon, minutes) VALUES (?, ?, ?, ?, ?, ?)').bind(id, rid, next, b.text, b.icon ?? null, b.minutes ?? null).run();
  const voiced = await stepTts(c.env, (await stepOf(c.env, id))!);
  await touchRecipe(c.env, rid);
  return c.json({ ok: true, id, voiced });
});

app.put('/api/admin/paint/steps/:id', need(ADMINS), async (c) => {
  const b = await parse(c, stepFieldsP);
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare("UPDATE paint_recipe_steps SET text = ?, icon = ?, minutes = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(b.text, b.icon ?? null, b.minutes ?? null, s.id).run();
  const voiced = await stepTts(c.env, { ...s, text: b.text });
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true, voiced });
});

app.post('/api/admin/paint/steps/:id/move', need(ADMINS), async (c) => {
  const { dir } = await parse(c, z.object({ dir: z.enum(['up', 'down']) }));
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  const n = await c.env.DB.prepare(`SELECT id, sort FROM paint_recipe_steps WHERE recipe_id = ? AND sort ${dir === 'up' ? '<' : '>'} ? ORDER BY sort ${dir === 'up' ? 'DESC' : 'ASC'} LIMIT 1`).bind(s.recipe_id, s.sort).first<{ id: string; sort: number }>();
  if (n) await c.env.DB.batch([
    c.env.DB.prepare('UPDATE paint_recipe_steps SET sort = ? WHERE id = ?').bind(n.sort, s.id),
    c.env.DB.prepare('UPDATE paint_recipe_steps SET sort = ? WHERE id = ?').bind(s.sort, n.id),
  ]);
  return c.json({ ok: true });
});

app.delete('/api/admin/paint/steps/:id', need(ADMINS), async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('DELETE FROM paint_recipe_steps WHERE id = ?').bind(s.id).run();
  const keys = [s.photo_key, s.tts_key, s.voice_key].filter((k): k is string => !!k);
  if (keys.length) await c.env.VAULT.delete(keys);
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true });
});

app.post('/api/admin/paint/steps/:id/photo', need(ADMINS), async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  const p = await carePhotoFrom(c);
  if (p instanceof Response) return p;
  const key = await putPhoto(c.env, `paint/steps/${s.recipe_id}/${s.id}`, p);
  await c.env.DB.prepare("UPDATE paint_recipe_steps SET photo_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(key, s.id).run();
  if (s.photo_key) await c.env.VAULT.delete(s.photo_key);
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true });
});
app.delete('/api/admin/paint/steps/:id/photo', need(ADMINS), async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('UPDATE paint_recipe_steps SET photo_key = NULL WHERE id = ?').bind(s.id).run();
  if (s.photo_key) await c.env.VAULT.delete(s.photo_key);
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true });
});

/** Staff record their own voice for a step (played instead of the AI voice). */
app.post('/api/admin/paint/steps/:id/voice', need(ADMINS), async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) return c.json({ error: 'invalid_input' }, 400);
  if (file.size > MAX_VOICE) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffAudio(new Uint8Array(buf));
  if (!mime) return c.json({ error: 'not_audio' }, 415);
  const key = `paint/voice/${s.recipe_id}/${s.id}-rec-${uid()}.${mime.split('/')[1]}`;
  await c.env.VAULT.put(key, buf, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare("UPDATE paint_recipe_steps SET voice_key = ?, voice_mime = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").bind(key, mime, s.id).run();
  if (s.voice_key) await c.env.VAULT.delete(s.voice_key);
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true });
});
app.delete('/api/admin/paint/steps/:id/voice', need(ADMINS), async (c) => {
  const s = await stepOf(c.env, c.req.param('id'));
  if (!s) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare('UPDATE paint_recipe_steps SET voice_key = NULL, voice_mime = NULL WHERE id = ?').bind(s.id).run();
  if (s.voice_key) await c.env.VAULT.delete(s.voice_key);
  await touchRecipe(c.env, s.recipe_id);
  return c.json({ ok: true });
});

/** Generate the AI voice for every step (and the mixing sentence) that has none or whose words changed. */
app.post('/api/admin/paint/recipes/:id/voice', need(ADMINS), async (c) => {
  if (!ttsConfigured(c.env)) return c.json({ error: 'tts_not_configured' }, 501);
  const rid = c.req.param('id');
  const steps = (await c.env.DB.prepare('SELECT * FROM paint_recipe_steps WHERE recipe_id = ? ORDER BY sort').bind(rid).all<PStep>()).results;
  let ok = 0, failed = 0;
  for (const s of steps) (await stepTts(c.env, s)) ? ok++ : failed++;
  const mix = await mixTts(c.env, rid);
  await touchRecipe(c.env, rid);
  return c.json({ ok: true, steps: ok, failed, mix });
});

app.get('/api/admin/voice/status', need(ADMINS), (c) => c.json({ tts: ttsConfigured(c.env), region: c.env.AZURE_SPEECH_REGION ?? null }));

/** Public: the spoken version of an app phrase in a language, when staff have generated it. */
app.get('/api/voice/ui/:lang/:key', async (c) => {
  const r = await c.env.DB.prepare('SELECT r2_key FROM ui_voice WHERE key = ? AND lang = ?').bind(c.req.param('key'), c.req.param('lang')).first<{ r2_key: string }>();
  return serveAudio(c, r?.r2_key);
});
app.get('/api/voice/ui', async (c) => c.json({ available: (await c.env.DB.prepare('SELECT key, lang FROM ui_voice').all()).results }));

/** Staff generate the app phrases in their language (texts come from the app's own translations; keys are whitelisted). */
app.post('/api/admin/voice/ui', need(ADMINS), async (c) => {
  if (!ttsConfigured(c.env)) return c.json({ error: 'tts_not_configured' }, 501);
  const b = await parse(c, z.object({ lang: z.enum(['km', 'en', 'vi', 'th', 'id']), items: z.array(z.object({ key: z.enum(UI_VOICE_KEYS), text: z.string().trim().min(1).max(300) })).max(UI_VOICE_KEYS.length) }));
  let made = 0, kept = 0, failed = 0;
  for (const it of b.items) {
    const hash = await ttsHash(c.env, it.text);
    const old = await c.env.DB.prepare('SELECT text_hash, r2_key FROM ui_voice WHERE key = ? AND lang = ?').bind(it.key, b.lang).first<{ text_hash: string; r2_key: string }>();
    if (old?.text_hash === hash) { kept++; continue; }
    try {
      const key = `voice/ui/${b.lang}/${it.key}-${hash.slice(0, 12)}.mp3`;
      await c.env.VAULT.put(key, await synthesize(c.env, it.text), { httpMetadata: { contentType: 'audio/mpeg' } });
      await c.env.DB.prepare('INSERT OR REPLACE INTO ui_voice (key, lang, text_hash, r2_key) VALUES (?, ?, ?, ?)').bind(it.key, b.lang, hash, key).run();
      if (old && old.r2_key !== key) await c.env.VAULT.delete(old.r2_key);
      made++;
    } catch (e) { console.error('ui voice failed:', (e as Error).message); failed++; }
  }
  await audit(c.env, c.get('user').id, 'voice.ui_generated', 'ui_voice', b.lang, { made, kept, failed });
  return c.json({ ok: true, made, kept, failed });
});

// ───────────────────────── Anajak Secondhand: AI recognises the bag (brand + model) before the photo steps ─────────────────────────
/**
 * One photo of the whole bag → the brand and model it is styled as, so the customer does not have to pick them.
 * Identification only (never genuine/fake). The photo is not stored. Signed-in users, 20 a day.
 */
app.post('/api/verify/identify', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const gate = await memberGate(c); if (gate) return gate;
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) return c.json({ error: 'invalid_input' }, 400);
  if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer();
  const mime = sniffImage(new Uint8Array(buf));
  if (!mime) return c.json({ error: 'not_an_image' }, 415);
  const day = `identify:${chatDay()}`;
  const counted = await c.env.DB.prepare(`INSERT INTO ai_chat_usage (user_id, day, n) VALUES (?, ?, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 WHERE n < 20`).bind(me.id, day).run();
  if (!counted.meta.changes) return c.json({ error: 'too_many' }, 429);
  const brands = (await c.env.DB.prepare("SELECT id, name FROM brands WHERE slug <> 'other' ORDER BY name").all<{ id: string; name: string }>()).results;
  const models = (await c.env.DB.prepare('SELECT id, brand_id, name FROM models ORDER BY name').all<{ id: string; brand_id: string; name: string }>()).results;
  try {
    const tips = (await pickSkills(c.env, 'identify', {}, 4000)).map((x) => `${x.title}${x.brand ? ` (${x.brand})` : ''}: ${x.body}`);
    const r = await asFeature('identify', () => identifyBag(c.env, { data: buf, mime }, brands, models, reqLang(c), tips));
    // a brand we do not list goes to the "other brand" choice with its name
    const other = r.brandId || !r.brandName ? null : await c.env.DB.prepare("SELECT id FROM brands WHERE slug = 'other'").first<{ id: string }>();
    return c.json({ ...r, otherBrandId: other?.id ?? null, model: aiModel(c.env) });
  } catch (e) {
    await c.env.DB.prepare('UPDATE ai_chat_usage SET n = MAX(n - 1, 0) WHERE user_id = ? AND day = ?').bind(me.id, day).run();
    console.error('identify failed:', (e as Error).message);
    return c.json({ error: 'ai_failed' }, 502);
  }
});

// ───────────────────────── Anajak Secondhand: membership (7-day free trial, then monthly by QR) ─────────────────────────
// AI features (bag check, brand recognition, AI assistant) need an active trial or a paid month. Lessons, the paint
// mixer, date codes and market data stay free. Staff are always active.
const DAY_MS = 86_400_000;
const PAY_METHODS = ['khqr', 'kbank'] as const;
type Membership = { status: 'staff' | 'trial' | 'active' | 'expired'; trialEnds: string | null; paidUntil: string | null; daysLeft: number };

async function membershipOf(env: AppEnv['Bindings'], user: { id: string; role: string }): Promise<Membership> {
  if (STAFF.includes(user.role as Role)) return { status: 'staff', trialEnds: null, paidUntil: null, daysLeft: 0 };
  // the trial starts the first time we look (sign-in or first use), not at deployment
  await env.DB.prepare('INSERT OR IGNORE INTO memberships (user_id) VALUES (?)').bind(user.id).run();
  const m = await env.DB.prepare('SELECT trial_start, paid_until FROM memberships WHERE user_id = ?').bind(user.id).first<{ trial_start: string; paid_until: string | null }>();
  const days = await getSettingNumber(env, 'membership_trial_days', 7);
  const now = Date.now();
  const trialEnd = new Date(new Date(m!.trial_start).getTime() + days * DAY_MS);
  const paid = m!.paid_until ? new Date(m!.paid_until) : null;
  const left = (d: Date) => Math.max(0, Math.ceil((d.getTime() - now) / DAY_MS));
  if (paid && paid.getTime() > now) return { status: 'active', trialEnds: trialEnd.toISOString(), paidUntil: paid.toISOString(), daysLeft: left(paid) };
  if (trialEnd.getTime() > now) return { status: 'trial', trialEnds: trialEnd.toISOString(), paidUntil: m!.paid_until, daysLeft: left(trialEnd) };
  return { status: 'expired', trialEnds: trialEnd.toISOString(), paidUntil: m!.paid_until, daysLeft: 0 };
}
/** null when the user may use AI features; otherwise the 402 response to return. */
async function memberGate(c: any): Promise<Response | null> {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const m = await membershipOf(c.env, me);
  return m.status === 'expired' ? c.json({ error: 'membership_required', membership: m }, 402) : null;
}

const settingStr = async (env: AppEnv['Bindings'], key: string) => (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null;
const putSetting = (env: AppEnv['Bindings'], key: string, value: string, by: string) =>
  env.DB.prepare(`INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(key, value, by).run();

app.get('/api/membership', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const m = await membershipOf(c.env, me);
  const pending = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'pending'").bind(me.id).first<{ n: number }>();
  return c.json({
    ...m, pending: pending?.n ?? 0,
    prices: { usd: await getSettingNumber(c.env, 'membership_price_usd', 10), thb: await getSettingNumber(c.env, 'membership_price_thb', 400) },
    trialDays: await getSettingNumber(c.env, 'membership_trial_days', 7),
    methods: {
      khqr: { qr: !!(await settingStr(c.env, 'pay.khqr_qr')), name: await settingStr(c.env, 'pay.khqr_name'), v: await settingStr(c.env, 'pay.khqr_qr') },
      kbank: { qr: !!(await settingStr(c.env, 'pay.kbank_qr')), name: await settingStr(c.env, 'pay.kbank_name'), v: await settingStr(c.env, 'pay.kbank_qr') },
    },
  });
});
app.get('/api/membership/qr/:method', async (c) => {
  if (!(PAY_METHODS as readonly string[]).includes(c.req.param('method'))) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(`site/pay-${c.req.param('method')}`);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/png', 'cache-control': 'private, max-age=300' } });
});

/** Customer sends a transfer slip. The amount comes from today's price, not from the customer. */
app.post('/api/payments', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const fd = await c.req.formData();
  const method = String(fd.get('method') ?? '');
  if (!(PAY_METHODS as readonly string[]).includes(method)) return c.json({ error: 'invalid_input' }, 400);
  const months = Math.max(1, Math.min(12, Number(fd.get('months')) || 1));
  const reference = String(fd.get('reference') ?? '').trim().slice(0, 80) || null;
  const file = fd.get('file');
  if (!(file instanceof File)) return c.json({ error: 'slip_required' }, 400);
  if (file.size > 8 * 1024 * 1024) return c.json({ error: 'too_large' }, 413);
  const buf = await file.arrayBuffer(); const mime = sniffImage(new Uint8Array(buf));
  if (!mime) return c.json({ error: 'not_an_image' }, 415);
  const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'pending'").bind(me.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= 3) return c.json({ error: 'too_many_pending' }, 429);
  const usd = method === 'khqr';
  const amount = (usd ? await getSettingNumber(c.env, 'membership_price_usd', 10) : await getSettingNumber(c.env, 'membership_price_thb', 400)) * months;
  const id = uid('pay_'); const key = `payments/${me.id}/${id}.${mime.split('/')[1]}`;
  await c.env.VAULT.put(key, buf, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare('INSERT INTO payments (id, user_id, method, amount, currency, months, reference, slip_key, slip_mime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, me.id, method, amount, usd ? 'USD' : 'THB', months, reference, key, mime).run();
  await audit(c.env, me.id, 'payment.submit', 'payments', id, { method, amount, months });
  c.executionCtx.waitUntil(notifyStaff(c.env, { title: '💳 New payment to check', body: `${me.name} · ${amount} ${usd ? 'USD (KHQR)' : 'THB (K Bank)'}`, url: '/admin?tab=today', tag: id }, new URL(c.req.url).origin).catch(() => 0));
  return c.json({ ok: true, id });
});
app.get('/api/payments/mine', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  return c.json({ payments: (await c.env.DB.prepare('SELECT id, method, amount, currency, months, reference, status, review_note, created_at, reviewed_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(me.id).all()).results });
});
app.get('/api/payments/:id/slip', async (c) => {
  const me = c.get('user');
  const p = await c.env.DB.prepare('SELECT user_id, slip_key, slip_mime FROM payments WHERE id = ?').bind(c.req.param('id')).first<{ user_id: string; slip_key: string; slip_mime: string }>();
  if (!p || (p.user_id !== me.id && !STAFF.includes(me.role))) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.VAULT.get(p.slip_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': p.slip_mime, 'cache-control': 'private, max-age=60' } });
});

app.get('/api/admin/payments', need(ADMINS), async (c) => {
  const status = ['pending', 'approved', 'rejected'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : 'pending';
  return c.json({ payments: (await c.env.DB.prepare(`SELECT p.id, p.method, p.amount, p.currency, p.months, p.reference, p.status, p.review_note, p.created_at, u.name, u.email,
      (SELECT paid_until FROM memberships m WHERE m.user_id = p.user_id) AS paid_until
    FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = ? ORDER BY p.created_at DESC LIMIT 100`).bind(status).all()).results });
});
/** Staff checked the slip against the bank: approve (adds the months) or reject (with a short reason). */
app.post('/api/admin/payments/:id/review', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ approve: z.boolean(), note: z.string().trim().max(300).nullable().optional() }));
  const p = await c.env.DB.prepare('SELECT id, user_id, months, status FROM payments WHERE id = ?').bind(c.req.param('id')).first<{ id: string; user_id: string; months: number; status: string }>();
  if (!p) return c.json({ error: 'not_found' }, 404);
  if (p.status !== 'pending') return c.json({ error: 'already_reviewed' }, 409);
  const me = c.get('user');
  if (!b.approve) {
    await c.env.DB.prepare("UPDATE payments SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(b.note || null, me.id, nowIso(), p.id).run();
    await audit(c.env, me.id, 'payment.reject', 'payments', p.id);
    return c.json({ ok: true });
  }
  await c.env.DB.prepare('INSERT OR IGNORE INTO memberships (user_id) VALUES (?)').bind(p.user_id).run();
  const m = await c.env.DB.prepare('SELECT paid_until FROM memberships WHERE user_id = ?').bind(p.user_id).first<{ paid_until: string | null }>();
  const from = Math.max(Date.now(), m?.paid_until ? new Date(m.paid_until).getTime() : 0);
  const until = new Date(from + p.months * 30 * DAY_MS).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE payments SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(b.note || null, me.id, nowIso(), p.id),
    c.env.DB.prepare("UPDATE memberships SET paid_until = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?").bind(until, p.user_id),
  ]);
  await audit(c.env, me.id, 'payment.approve', 'payments', p.id, { until });
  c.executionCtx.waitUntil(notifyUser(c.env, p.user_id, { title: '✅ Anajak Secondhand', body: `Membership active until ${until.slice(0, 10)}`, url: '/subscribe', tag: p.id }, new URL(c.req.url).origin).catch(() => 0));
  return c.json({ ok: true, paidUntil: until });
});

app.put('/api/admin/membership', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ priceUsd: z.number().min(0.5).max(1000), priceThb: z.number().min(10).max(50000), trialDays: z.number().int().min(0).max(60),
    khqrName: z.string().trim().max(80), kbankName: z.string().trim().max(80) }));
  const me = c.get('user').id;
  await putSetting(c.env, 'membership_price_usd', String(b.priceUsd), me);
  await putSetting(c.env, 'membership_price_thb', String(b.priceThb), me);
  await putSetting(c.env, 'membership_trial_days', String(b.trialDays), me);
  await putSetting(c.env, 'pay.khqr_name', b.khqrName, me);
  await putSetting(c.env, 'pay.kbank_name', b.kbankName, me);
  await audit(c.env, me, 'membership.settings', 'settings', null, b);
  return c.json({ ok: true });
});
app.post('/api/admin/membership/qr/:method', need(ADMINS), async (c) => {
  const method = c.req.param('method');
  if (!(PAY_METHODS as readonly string[]).includes(method)) return c.json({ error: 'not_found' }, 404);
  const f = (await c.req.formData()).get('file');
  if (!(f instanceof File)) return c.json({ error: 'file_required' }, 400);
  if (f.size > 5 * 1024 * 1024) return c.json({ error: 'file_too_large' }, 413);
  const buf = await f.arrayBuffer(); const mime = sniffImage(new Uint8Array(buf, 0, 16));
  if (!mime) return c.json({ error: 'not_a_supported_image' }, 415);
  await c.env.VAULT.put(`site/pay-${method}`, buf, { httpMetadata: { contentType: mime } });
  await putSetting(c.env, `pay.${method}_qr`, String(Date.now()), c.get('user').id);
  await audit(c.env, c.get('user').id, 'membership.qr', 'settings', method);
  return c.json({ ok: true });
});

// ───────────────────────── AI token use against the budget ─────────────────────────
app.get('/api/admin/usage', need(ADMINS), async (c) => {
  const budget = await getSettingNumber(c.env, 'token_budget', 200_000_000);
  const days = await getSettingNumber(c.env, 'token_budget_days', 15);
  const start = (await settingStr(c.env, 'token_budget_start')) ?? new Date().toISOString().slice(0, 10);
  const byDay = (await c.env.DB.prepare(`SELECT day, SUM(input_tokens + output_tokens) AS tokens, SUM(calls) AS calls FROM ai_usage_daily WHERE day >= ? GROUP BY day ORDER BY day`).bind(start).all<{ day: string; tokens: number; calls: number }>()).results;
  const byFeature = (await c.env.DB.prepare(`SELECT feature, SUM(calls) AS calls, SUM(input_tokens) AS input, SUM(output_tokens) AS output FROM ai_usage_daily WHERE day >= ? GROUP BY feature ORDER BY SUM(input_tokens + output_tokens) DESC`).bind(start).all()).results;
  const used = byDay.reduce((s, d) => s + d.tokens, 0);
  const elapsed = Math.max(1, Math.floor((Date.now() - new Date(`${start}T00:00:00Z`).getTime()) / DAY_MS) + 1);
  const perDay = used / elapsed;
  return c.json({ budget, days, start, used, perDay: Math.round(perDay), daysToEmpty: perDay > 0 ? Math.floor((budget - used) / perDay) : null, byDay, byFeature });
});
app.put('/api/admin/usage', need(['owner']), async (c) => {
  const b = await parse(c, z.object({ budget: z.number().int().min(1).max(100_000_000_000), days: z.number().int().min(1).max(366), start: periodSchema.or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)) }));
  const me = c.get('user').id;
  await putSetting(c.env, 'token_budget', String(b.budget), me);
  await putSetting(c.env, 'token_budget_days', String(b.days), me);
  await putSetting(c.env, 'token_budget_start', b.start, me);
  await audit(c.env, me, 'usage.budget', 'settings', null, b);
  return c.json({ ok: true });
});

// ───────────────────────── Anajak Secondhand: AI skills (shop knowledge the in-app AI reads) ─────────────────────────
// Staff write a skill (or let the AI tidy their rough notes into one), test it in a chat, and an admin turns it on.
// Only active skills reach the AI. A skill is knowledge: the hard rules in each prompt always win, and skills never
// change an expert outcome.
const SKILL_AREAS = ['all', 'chat', 'identify', 'check', 'paint', 'repair'] as const;
const skillInput = z.object({
  area: z.enum(SKILL_AREAS), title: z.string().trim().min(3).max(120), body: z.string().trim().min(10).max(4000),
  brand: z.string().trim().max(80).nullish().transform((v) => v || null), keywords: z.string().trim().max(300).nullish().transform((v) => v || null),
});
/** Saved skill answers depend on the knowledge: forget them whenever a skill changes. */
const clearSkillCache = (env: AppEnv['Bindings']) => env.DB.prepare('DELETE FROM skill_cache').run();

/** The active skills that fit this moment (see src/shared/skills.ts), and a use count for the admin list. */
async function pickSkills(env: AppEnv['Bindings'], use: SkillUse, ctx: { text?: string; brand?: string | null; extra?: SkillRow | null }, budget: number): Promise<SkillRow[]> {
  const rows = (await env.DB.prepare(`SELECT id, area, title, body, brand, keywords FROM ai_skills WHERE status = 'active' AND area IN ('all', ?) ORDER BY updated_at DESC LIMIT 300`)
    .bind(use).all<SkillRow>()).results;
  const out = chooseSkills(rows, use, ctx, budget);
  const ids = out.map((r) => r.id).filter((id) => id !== 'test');
  if (ids.length) await env.DB.prepare(`UPDATE ai_skills SET uses = uses + 1, last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run();
  return out;
}
const skillText = (rows: SkillRow[]) => rows.map((r) => `### ${r.title}${r.brand ? ` (${r.brand})` : ''}\n${r.body}`).join('\n\n');

/** Published lessons and the app's tabs, so the assistant can send people to the right place. */
async function appContext(env: AppEnv['Bindings']): Promise<string> {
  const lessons = (await env.DB.prepare(`SELECT topic, title_km, title_en FROM care_lessons WHERE status = 'published' ORDER BY published_at DESC LIMIT 25`)
    .all<{ topic: string; title_km: string; title_en: string | null }>()).results;
  return [
    'Tabs: Home (skills + monthly market ranking per country) · Paint (colour mixer with recipes, painting lessons) · Check (photo of the bag → AI recognises brand/model and compares the details with reference photos) · History · AI assistant.',
    ...lessons.map((l) => `Lesson (${l.topic}): ${l.title_km}${l.title_en ? ` / ${l.title_en}` : ''}`),
  ].join('\n');
}

app.get('/api/admin/skills', need(STAFF), async (c) => {
  const rows = (await c.env.DB.prepare(`SELECT s.*, u.name AS author FROM ai_skills s LEFT JOIN users u ON u.id = s.created_by ORDER BY s.status = 'active' DESC, s.updated_at DESC`).all()).results;
  return c.json({ skills: rows });
});
app.post('/api/admin/skills', need(STAFF), async (c) => {
  const b = await parse(c, skillInput.extend({ aiDrafted: z.boolean().optional() }));
  const id = uid('sk_'); const me = c.get('user');
  await c.env.DB.prepare(`INSERT INTO ai_skills (id, area, title, body, brand, keywords, ai_drafted, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, b.area, b.title, b.body, b.brand, b.keywords, b.aiDrafted ? 1 : 0, me.id, me.id).run();
  await audit(c.env, me.id, 'skill.create', 'ai_skills', id);
  return c.json({ id });
});
app.put('/api/admin/skills/:id', need(STAFF), async (c) => {
  const b = await parse(c, skillInput.extend({ status: z.enum(['draft', 'active']) }));
  const me = c.get('user');
  // staff may write and edit; turning a skill on (or editing one that is on) is for admins
  const cur = await c.env.DB.prepare('SELECT status FROM ai_skills WHERE id = ?').bind(c.req.param('id')).first<{ status: string }>();
  if (!cur) return c.json({ error: 'not_found' }, 404);
  if ((b.status === 'active' || cur.status === 'active') && !ADMINS.includes(me.role)) return c.json({ error: 'forbidden' }, 403);
  await c.env.DB.prepare(`UPDATE ai_skills SET area = ?, title = ?, body = ?, brand = ?, keywords = ?, status = ?, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(b.area, b.title, b.body, b.brand, b.keywords, b.status, me.id, c.req.param('id')).run();
  await clearSkillCache(c.env);
  await audit(c.env, me.id, b.status === 'active' ? 'skill.activate' : 'skill.update', 'ai_skills', c.req.param('id'));
  return c.json({ ok: true });
});
app.delete('/api/admin/skills/:id', need(ADMINS), async (c) => {
  await c.env.DB.prepare('DELETE FROM ai_skills WHERE id = ?').bind(c.req.param('id')).run();
  await clearSkillCache(c.env);
  await audit(c.env, c.get('user').id, 'skill.delete', 'ai_skills', c.req.param('id'));
  return c.json({ ok: true });
});
app.post('/api/admin/skills/draft', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ notes: z.string().trim().min(10).max(6000), area: z.enum(SKILL_AREAS) }));
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  try { return c.json(await asFeature('skill_draft', () => draftSkill(c.env, { notes: b.notes, area: b.area, lang: reqLang(c) }))); }
  catch (e) { console.error('skill draft failed:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
});
/** Ask the assistant one question with the active skills plus the one being written, to see the effect before turning it on. */
app.post('/api/admin/skills/test', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ question: z.string().trim().min(2).max(2000), skill: skillInput.nullish() }));
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const extra = b.skill ? { id: 'test', ...b.skill } : null;
  try {
    const skills = await pickSkills(c.env, 'chat', { text: b.question, extra }, 12000);
    const reply = await asFeature('skill_test', async () => chatAssistant(c.env, [{ role: 'user', content: b.question }], reqLang(c),
      { market: await marketContext(c.env), skills: skillText(skills), app: await appContext(c.env) }));
    return c.json({ reply: reply.trim(), used: skills.map((s) => s.title) });
  } catch (e) { console.error('skill test failed:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
});

// ───────────────────────── Anajak Secondhand: find customers (ស្វែងរកម៉ូយ) on TikTok ─────────────────────────
// Public TikTok accounts in TH / MY / ID that sell second-hand designer bags (often on LIVE): resellers who could buy
// stock wholesale. An AI web search limited to tiktok.com finds them (weekly per country, or when an admin asks); an
// account is kept only when a link the search returned belongs to it. Staff only.
const LEAD_COUNTRIES = ['TH', 'MY', 'ID'] as const;
const LEAD_STATUSES = ['new', 'saved', 'contacted', 'customer', 'not_fit'] as const;
const LEAD_EVERY_DAYS = 7;

async function runLeadSearch(env: AppEnv['Bindings'], country: typeof LEAD_COUNTRIES[number], trigger: 'auto' | 'manual', lang: OutLang = 'km', topic: string | null = null, origin?: string): Promise<{ found: number; added: number; error?: string }> {
  const runId = uid('lr_');
  await env.DB.prepare('INSERT INTO lead_runs (id, country, trigger, topic) VALUES (?, ?, ?, ?)').bind(runId, country, trigger, topic).run();
  try {
    const known = (await env.DB.prepare('SELECT handle FROM leads WHERE country = ? ORDER BY created_at DESC LIMIT 150').bind(country).all<{ handle: string }>()).results.map((r) => r.handle);
    const offer = await settingStr(env, 'lead_offer');
    const r = await asFeature('lead_search', () => findTiktokSellers(env, { country, lang, known, topic, offer }));
    let added = 0, kept = 0;
    for (const x of r.rows) {
      const handle = handleFromInput(x.handle);
      const evidence = handle ? evidenceFor(handle, r.found.keys()) : null;
      if (!handle || !evidence) continue; // never keep an account the search did not show
      kept++;
      const seen = await env.DB.prepare(`UPDATE leads SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), fit = MAX(COALESCE(fit, 0), COALESCE(?, 0)) WHERE platform = 'tiktok' AND lower(handle) = ?`).bind(x.fit, handle).run();
      if (seen.meta.changes) continue;
      const res = await env.DB.prepare(`INSERT OR IGNORE INTO leads (id, country, handle, name, url, kind, sells, why, fit, topic, source_url, source_title, found_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai')`)
        .bind(uid('ld_'), country, handle, x.name, profileUrl(handle), x.kind, x.sells || null, x.why || null, x.fit, topic, evidence, (r.found.get(evidence) ?? '').slice(0, 200) || null).run();
      if (res.meta.changes) added++;
    }
    await env.DB.prepare(`UPDATE lead_runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), found = ?, added = ? WHERE id = ?`).bind(kept, added, runId).run();
    if (added && origin) await notifyStaff(env, { title: `🎯 ${added} new TikTok sellers · ${country}`, body: topic ? `Search: ${topic}` : 'Weekly customer search', url: `/admin?tab=leads&country=${country}`, tag: `leads-${country}` }, origin).catch(() => 0);
    return { found: kept, added };
  } catch (e) {
    const error = String((e as Error).message).slice(0, 200);
    await env.DB.prepare(`UPDATE lead_runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), error = ? WHERE id = ?`).bind(error, runId).run();
    return { found: 0, added: 0, error };
  }
}

/** Every 10 minutes (cron): when automatic search is on, search the one country whose last search is oldest, at most weekly. */
async function leadsBacklog(env: AppEnv['Bindings']) {
  if (aiProvider(env) !== 'anthropic' || (await settingStr(env, 'leads_auto')) === '0') return;
  // one search at a time
  if (await env.DB.prepare(`SELECT 1 FROM lead_runs WHERE finished_at IS NULL AND started_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 minutes')`).first()) return;
  let pick: typeof LEAD_COUNTRIES[number] | null = null, oldest = '9999';
  for (const cc of LEAD_COUNTRIES) {
    const last = (await env.DB.prepare('SELECT MAX(started_at) AS t FROM lead_runs WHERE country = ?').bind(cc).first<{ t: string | null }>())?.t ?? '';
    if (last < oldest) { oldest = last; pick = cc; }
  }
  if (!pick || (oldest && Date.now() - Date.parse(oldest) < LEAD_EVERY_DAYS * 86_400_000)) return;
  const r = await runLeadSearch(env, pick, 'auto', 'km', null, (await settingStr(env, 'site_origin')) ?? undefined);
  console.log(`lead search ${pick}: ${r.error ?? `${r.added} new of ${r.found}`}`);
}

async function leadSummary(env: AppEnv['Bindings']) {
  const counts = (await env.DB.prepare('SELECT country, status, COUNT(*) AS n FROM leads GROUP BY country, status').all<{ country: string; status: string; n: number }>()).results;
  const runs = (await env.DB.prepare(`SELECT country, MAX(started_at) AS at, (SELECT added FROM lead_runs r2 WHERE r2.country = r.country ORDER BY started_at DESC LIMIT 1) AS added,
    (SELECT error FROM lead_runs r2 WHERE r2.country = r.country ORDER BY started_at DESC LIMIT 1) AS error,
    (SELECT finished_at IS NULL FROM lead_runs r2 WHERE r2.country = r.country ORDER BY started_at DESC LIMIT 1) AS running
    FROM lead_runs r GROUP BY country`).all<{ country: string; at: string; added: number; error: string | null; running: number }>()).results;
  return { counts, runs, auto: (await settingStr(env, 'leads_auto')) !== '0', webSearch: aiProvider(env) === 'anthropic', everyDays: LEAD_EVERY_DAYS,
    offer: (await settingStr(env, 'lead_offer')) ?? '', shopName: (await settingStr(env, 'shop_name')) ?? '' };
}

/** Remember the site address (for links in notifications sent by the cron, which has no request). */
async function rememberOrigin(c: any) {
  const origin = new URL(c.req.url).origin;
  if (origin.startsWith('https://') && (await settingStr(c.env, 'site_origin')) !== origin) await putSetting(c.env, 'site_origin', origin, c.get('user').id);
}
app.get('/api/admin/leads/summary', need(STAFF), async (c) => {
  await rememberOrigin(c);
  const latest = (await c.env.DB.prepare(`SELECT id, country, handle, name, url, kind, sells, why, fit, topic, status, created_at FROM leads WHERE status IN ('new','saved') ORDER BY substr(created_at, 1, 10) DESC, COALESCE(fit, 0) DESC LIMIT 6`).all()).results;
  return c.json({ ...(await leadSummary(c.env)), latest });
});
app.get('/api/admin/leads', need(STAFF), async (c) => {
  const country = c.req.query('country'), status = c.req.query('status');
  const where: string[] = [], binds: string[] = [];
  if (country && (LEAD_COUNTRIES as readonly string[]).includes(country)) { where.push('country = ?'); binds.push(country); }
  if (status && (LEAD_STATUSES as readonly string[]).includes(status)) { where.push('status = ?'); binds.push(status); }
  const rows = (await c.env.DB.prepare(`SELECT * FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY substr(created_at, 1, 10) DESC, COALESCE(fit, 0) DESC, created_at DESC LIMIT 300`).bind(...binds).all()).results;
  return c.json({ leads: rows, ...(await leadSummary(c.env)) });
});
app.post('/api/admin/leads', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ link: z.string().trim().min(2).max(500), country: z.enum(LEAD_COUNTRIES), kind: z.enum(['live_seller', 'reseller', 'shop']), sells: z.string().trim().max(300).nullish(), note: z.string().trim().max(500).nullish() }));
  const handle = handleFromInput(b.link);
  if (!handle) return c.json({ error: 'not_a_tiktok_account' }, 400);
  const id = uid('ld_');
  const r = await c.env.DB.prepare(`INSERT OR IGNORE INTO leads (id, country, handle, url, kind, sells, note, found_by, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'staff', ?, 'saved')`)
    .bind(id, b.country, handle, profileUrl(handle), b.kind, b.sells || null, b.note || null, c.get('user').id).run();
  if (!r.meta.changes) return c.json({ error: 'already_added' }, 409);
  return c.json({ id });
});
app.put('/api/admin/leads/:id', need(STAFF), async (c) => {
  const b = await parse(c, z.object({ status: z.enum(LEAD_STATUSES), note: z.string().trim().max(500).nullish() }));
  const r = await c.env.DB.prepare(`UPDATE leads SET status = ?, note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(b.status, b.note || null, c.req.param('id')).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});
app.delete('/api/admin/leads/:id', need(ADMINS), async (c) => {
  await c.env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
app.post('/api/admin/leads/search', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ country: z.enum(LEAD_COUNTRIES), topic: z.string().trim().max(120).nullish().transform((v) => v || null) }));
  if (aiProvider(c.env) !== 'anthropic') return c.json({ error: 'ai_web_not_configured' }, 501);
  if (await c.env.DB.prepare(`SELECT 1 FROM lead_runs WHERE finished_at IS NULL AND started_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 minutes')`).first()) return c.json({ error: 'search_running' }, 409);
  const r = await runLeadSearch(c.env, b.country, 'manual', reqLang(c), b.topic, new URL(c.req.url).origin);
  await audit(c.env, c.get('user').id, 'leads.search', 'leads', b.country);
  return r.error ? c.json({ error: 'ai_failed', detail: r.error }, 502) : c.json(r);
});
app.put('/api/admin/leads-settings', need(ADMINS), async (c) => {
  const b = await parse(c, z.object({ auto: z.boolean().optional(), offer: z.string().trim().max(1000).optional(), shopName: z.string().trim().max(80).optional() }));
  const by = c.get('user').id;
  if (b.auto !== undefined) await putSetting(c.env, 'leads_auto', b.auto ? '1' : '0', by);
  if (b.offer !== undefined) await putSetting(c.env, 'lead_offer', b.offer, by);
  if (b.shopName !== undefined) await putSetting(c.env, 'shop_name', b.shopName, by);
  return c.json({ ok: true });
});
/** A first message to one account, in their language, for staff to copy and send themselves. */
app.post('/api/admin/leads/:id/message', need(STAFF), async (c) => {
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const l = await c.env.DB.prepare('SELECT country, handle, name, sells, kind FROM leads WHERE id = ?').bind(c.req.param('id')).first<{ country: 'TH' | 'MY' | 'ID'; handle: string; name: string | null; sells: string | null; kind: string }>();
  if (!l) return c.json({ error: 'not_found' }, 404);
  try {
    const r = await asFeature('lead_message', async () => draftOutreach(c.env, { ...l, offer: (await settingStr(c.env, 'lead_offer')) ?? '', shopName: (await settingStr(c.env, 'shop_name')) ?? '', lang: reqLang(c) }));
    return c.json(r);
  } catch (e) { console.error('lead message failed:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
});

// ───────────────────────── Anajak Secondhand: vendor skills (🎨 paint · 🧽 clean & repair) ─────────────────────────
// AI features for members (trial or paid), with a daily cap per person. Shop knowledge = active AI skills of that area.
async function takeDaily(env: AppEnv['Bindings'], userId: string, kind: string, limit: number): Promise<{ ok: boolean; undo: () => Promise<unknown> }> {
  const day = `${kind}:${chatDay()}`;
  const r = await env.DB.prepare(`INSERT INTO ai_chat_usage (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 WHERE n < ?`).bind(userId, day, limit).run();
  return { ok: !!r.meta.changes, undo: () => env.DB.prepare('UPDATE ai_chat_usage SET n = MAX(n - 1, 0) WHERE user_id = ? AND day = ?').bind(userId, day).run() };
}
const shopProducts = async (env: AppEnv['Bindings']) => (await env.DB.prepare('SELECT brand, name, kind FROM paint_products WHERE active = 1 ORDER BY brand, name LIMIT 60').all<{ brand: string; name: string; kind: string }>()).results
  .map((p) => `${p.brand} ${p.name} (${p.kind})`);

app.post('/api/skills/paint', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const gate = await memberGate(c); if (gate) return gate;
  const b = await parse(c, z.object({ surface: z.enum(SURFACES), finish: z.enum(['matte', 'satin', 'gloss']), recipeId: z.string().max(64).nullish() }));
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const recipe = b.recipeId ? (await paintRecipes(c.env, false)).find((r) => r.id === b.recipeId) ?? null : null;
  if (b.recipeId && !recipe) return c.json({ error: 'not_found' }, 404);
  const lang = reqLang(c);
  const key = `paint:${b.surface}:${b.finish}:${recipe ? `${recipe.id}@${recipe.updated_at}` : '-'}:${lang}`;
  const hit = await c.env.DB.prepare(`SELECT value FROM skill_cache WHERE key = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')`).bind(key).first<{ value: string }>();
  if (hit) return c.json({ ...JSON.parse(hit.value), cached: true });
  const quota = await takeDaily(c.env, me.id, 'paint', 30);
  if (!quota.ok) return c.json({ error: 'too_many' }, 429);
  try {
    const skills = skillText(await pickSkills(c.env, 'paint', { text: `${b.surface.replace('_', ' ')} ${b.finish} ${recipe?.name_km ?? ''} ${recipe?.name_en ?? ''}` }, 8000));
    const r = await asFeature('paint_skill', async () => paintMethod(c.env, {
      surface: b.surface, finish: b.finish, lang, skills, products: await shopProducts(c.env),
      recipe: recipe ? { name: recipe.name_en || recipe.name_km, parts: recipe.parts.map((p: any) => ({ brand: p.brand, name: p.name, kind: p.kind, parts: p.parts })) } : null,
    }));
    await c.env.DB.prepare('INSERT OR REPLACE INTO skill_cache (key, value) VALUES (?, ?)').bind(key, JSON.stringify(r)).run();
    return c.json(r);
  } catch (e) { await quota.undo(); console.error('paint skill:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
});

app.post('/api/skills/repair', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const gate = await memberGate(c); if (gate) return gate;
  const form = await c.req.formData();
  const surface = String(form.get('surface') ?? '');
  const problem = String(form.get('problem') ?? '').trim().slice(0, 1000);
  if (!(SURFACES as readonly string[]).includes(surface)) return c.json({ error: 'invalid_input' }, 400);
  const file = form.get('file');
  let image: { data: ArrayBuffer; mime: string } | null = null;
  if (file instanceof File) {
    if (file.size > MAX_IMAGE_BYTES) return c.json({ error: 'too_large' }, 413);
    const data = await file.arrayBuffer(); const mime = sniffImage(new Uint8Array(data));
    if (!mime) return c.json({ error: 'not_an_image' }, 415);
    image = { data, mime };
  }
  if (!image && problem.length < 5) return c.json({ error: 'invalid_input' }, 400);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const quota = await takeDaily(c.env, me.id, 'repair', 15);
  if (!quota.ok) return c.json({ error: 'too_many' }, 429);
  try {
    const skills = skillText(await pickSkills(c.env, 'repair', { text: `${surface.replace('_', ' ')} ${problem}` }, 8000));
    const r = await asFeature('repair_skill', async () => repairAdvice(c.env, { surface, problem, image, lang: reqLang(c), skills, products: await shopProducts(c.env) }));
    return c.json(r);
  } catch (e) { await quota.undo(); console.error('repair skill:', (e as Error).message); return c.json({ error: 'ai_failed' }, 502); }
});

// ───────────────────────── Anajak Secondhand: AI assistant chat (signed-in users) ─────────────────────────
const chatDay = () => new Date().toISOString().slice(0, 10);

/** Staff-entered market data as plain text for the assistant (latest month per country + newest updates). */
async function marketContext(env: AppEnv['Bindings']): Promise<string> {
  const out: string[] = [];
  for (const country of COUNTRIES) {
    const period = await latestPeriod(env, country);
    if (!period) continue;
    const rows = await monthRows(env, country, period, 10);
    out.push(`${country} ${period}: ` + rows.map((r) => `#${r.rank} ${r.brand} ${r.model}${r.price_min != null || r.price_max != null ? ` (${r.price_min ?? '?'}–${r.price_max ?? '?'} ${r.currency ?? ''})` : ''}${r.note ? ` — why it sells: ${r.note}` : ''}`).join('; ') + ` [source: ${rows[0]?.source ?? ''}]`);
  }
  const ups = (await env.DB.prepare('SELECT country, title, body, source, created_at FROM market_updates ORDER BY created_at DESC LIMIT 5').all<Record<string, string | null>>()).results;
  for (const u of ups) out.push(`Update ${u.created_at?.slice(0, 10)} ${u.country ?? ''}: ${u.title}${u.body ? ` — ${String(u.body).slice(0, 300)}` : ''} [source: ${u.source}]`);
  return out.join('\n');
}

app.get('/api/chat/status', async (c) => {
  const me = c.get('user');
  const limit = await getSettingNumber(c.env, 'ai_chat_daily_limit', 30);
  const used = (await c.env.DB.prepare('SELECT n FROM ai_chat_usage WHERE user_id = ? AND day = ?').bind(me.id, chatDay()).first<{ n: number }>())?.n ?? 0;
  return c.json({ configured: aiConfigured(c.env), limit, used });
});

app.post('/api/chat', async (c) => {
  const me = c.get('user');
  if (!me.id) return c.json({ error: 'unauthenticated' }, 401);
  const gate = await memberGate(c); if (gate) return gate;
  const b = await parse(c, z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) })).min(1).max(30) }));
  if (b.messages[b.messages.length - 1].role !== 'user') return c.json({ error: 'invalid_input' }, 400);
  if (!aiConfigured(c.env)) return c.json({ error: 'ai_not_configured' }, 501);
  const limit = await getSettingNumber(c.env, 'ai_chat_daily_limit', 30);
  const day = chatDay();
  // count first, so parallel requests cannot go over the daily limit
  const res = await c.env.DB.prepare(`INSERT INTO ai_chat_usage (user_id, day, n) VALUES (?, ?, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 WHERE n < ?`).bind(me.id, day, limit).run();
  if (!res.meta.changes) return c.json({ error: 'chat_limit', limit }, 429);
  // the conversation must start with the user; keep the last turns only
  const turns = b.messages.slice(-12);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  try {
    const recent = turns.filter((t) => t.role === 'user').slice(-3).map((t) => t.content).join('\n');
    const reply = await asFeature('chat', async () => chatAssistant(c.env, turns, reqLang(c),
      { market: await marketContext(c.env), skills: skillText(await pickSkills(c.env, 'chat', { text: recent }, 12000)), app: await appContext(c.env) }));
    return c.json({ reply: reply.trim() });
  } catch (e) {
    await c.env.DB.prepare('UPDATE ai_chat_usage SET n = MAX(n - 1, 0) WHERE user_id = ? AND day = ?').bind(me.id, day).run();
    const m = String((e as Error).message);
    return c.json({ error: m === 'ai_refused' ? 'ai_refused' : 'ai_failed' }, 502);
  }
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

/** Every 10 minutes: AI analysis for new requests that have none yet (a few per run), so experts find it ready. */
async function aiReviewBacklog(env: AppEnv['Bindings']) {
  if (!aiConfigured(env)) return;
  const due = (await env.DB.prepare(`SELECT r.id FROM verify_requests r WHERE r.status IN ('submitted','in_review') AND r.created_at > datetime('now','-3 days')
    AND NOT EXISTS (SELECT 1 FROM verify_ai_reviews a WHERE a.request_id = r.id AND (a.suggested_outcome IS NOT NULL OR a.created_at > datetime('now','-1 hour')))
    ORDER BY r.created_at LIMIT 2`).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }))).results;
  for (const r of due) { const res = await runAiReview(env, r.id); console.log(`ai review ${r.id}: ${res.ok ? 'ok' : res.error}`); }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) {
    ctx.waitUntil(asFeature('translate', () => translateBacklog(env)));
    ctx.waitUntil(asFeature('precheck', () => aiReviewBacklog(env)));
    ctx.waitUntil(leadsBacklog(env).catch((e) => console.error('lead search:', (e as Error).message)));
  },
} satisfies ExportedHandler<AppEnv['Bindings']>;
