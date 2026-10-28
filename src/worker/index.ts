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
import { aiConfigured, explainDifferences, suggestFocusRegions, suggestObservations } from './vision.ts';
import { isValidRect } from '../shared/marks.ts';
import { coverageForModel, type CoverageEra } from '../shared/coverage.ts';

const app = new Hono<AppEnv>();
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
  return c.json({ needsBootstrap: (n?.n ?? 0) === 0 });
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

// everything below requires a session
app.use('/api/*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p === '/api/health' || p.startsWith('/api/auth/')) return next();
  const user = await userFromToken(c.env, getCookie(c, COOKIE));
  if (!user) return c.json({ error: 'unauthenticated' }, 401);
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
  const [formats, factories] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM datecode_formats ORDER BY brand_id, start_year').all(),
    c.env.DB.prepare('SELECT * FROM factory_codes ORDER BY brand_id, code').all(),
  ]);
  return c.json({ formats: formats.results, factories: factories.results });
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
    const out = await explainDifferences(c.env, { data: await insp.arrayBuffer(), mime: r.cap.mime }, refImgs, r.cap.component_code ?? 'unspecified');
    const id = uid('cmp_');
    await c.env.DB.prepare('INSERT INTO comparisons (id, inspection_id, capture_id, asset_ids_json, result_json, model, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, r.cap.inspection_id, r.cap.id, JSON.stringify(chosen), JSON.stringify(out), c.env.AI_MODEL ?? null, c.get('user').id).run();
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
  }).parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));
  const id = uid('a_'); const key = `reference/${id}`; const sha = await sha256Hex(buf);
  await c.env.VAULT.put(key, buf, { httpMetadata: { contentType: mime } });
  await c.env.DB.prepare(`INSERT INTO reference_assets (id, brand_id, model_id, era_id, component_code, r2_key, sha256, label, label_basis, license, consent_ref, source_url, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quarantine', ?)`)
    .bind(id, meta.brandId, meta.modelId ?? null, meta.eraId ?? null, meta.componentCode ?? null, key, sha, meta.label, meta.labelBasis, meta.license, meta.consentRef ?? null, meta.sourceUrl ?? null, c.get('user').id).run();
  await audit(c.env, c.get('user').id, 'asset.upload_quarantine', 'asset', id, { label: meta.label, basis: meta.labelBasis, license: meta.license });
  return c.json({ id });
});

app.post('/api/assets/:id/review', need(REVIEWERS), async (c) => {
  const { decision } = await parse(c, z.object({ decision: z.enum(['approve', 'reject']) }));
  // the database CHECK constraint refuses 'approved' for unknown license / seller-claim labels
  await c.env.DB.prepare('UPDATE reference_assets SET status = ? WHERE id = ?').bind(decision === 'approve' ? 'approved' : 'rejected', c.req.param('id')).run();
  await audit(c.env, c.get('user').id, `asset.${decision}`, 'asset', c.req.param('id'));
  return c.json({ ok: true });
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

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
export default app;
