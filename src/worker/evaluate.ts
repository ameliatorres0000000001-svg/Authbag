import { evaluate, rulesSnapshotHash } from '../shared/engine.ts';
import { decodeDateCode } from '../shared/datecode.ts';
import type { CaptureTemplate, DateCodeFormat, DateCodeResult, FactoryCode, Observation, Rule } from '../shared/types.ts';
import type { Env } from './env.ts';
import { getSettingNumber, nowIso, uid } from './lib.ts';

interface RuleRow {
  id: string; code: string; version: number; brand_id: string; model_id: string | null; era_id: string | null; component_code: string;
  observation_key: string; check_json: string; polarity: Rule['polarity']; severity: Rule['severity']; required: number;
  status: Rule['status']; title_en: string; title_km: string;
}
export const toRule = (r: RuleRow): Rule => ({
  id: r.id, code: r.code, version: r.version, brandId: r.brand_id, modelId: r.model_id, eraId: r.era_id, componentCode: r.component_code,
  observationKey: r.observation_key, check: JSON.parse(r.check_json), polarity: r.polarity, severity: r.severity,
  required: r.required === 1, status: r.status, titleEn: r.title_en, titleKm: r.title_km,
});

/** Capture templates resolved model > brand > global by code. */
export async function resolveTemplates(env: Env, brandId: string, modelId: string) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM capture_templates
     WHERE model_id = ?1 OR (brand_id = ?2 AND model_id IS NULL) OR (brand_id IS NULL AND model_id IS NULL)
     ORDER BY sort`,
  ).bind(modelId, brandId).all<Record<string, any>>();
  const rank = (t: Record<string, any>) => (t.model_id ? 3 : t.brand_id ? 2 : 1);
  const byCode = new Map<string, Record<string, any>>();
  for (const t of results) {
    const cur = byCode.get(t.code);
    if (!cur || rank(t) > rank(cur)) byCode.set(t.code, t);
  }
  return [...byCode.values()].sort((a, b) => a.sort - b.sort);
}

export async function runEvaluation(env: Env, inspectionId: string, userId: string) {
  const insp = await env.DB.prepare('SELECT * FROM inspections WHERE id = ?').bind(inspectionId).first<Record<string, any>>();
  if (!insp) throw new Error('inspection_not_found');

  // era: explicit, else the single APPROVED era containing the claimed year
  let era: Record<string, any> | null = null;
  if (insp.era_id) era = await env.DB.prepare('SELECT * FROM eras WHERE id = ?').bind(insp.era_id).first();
  else if (insp.claimed_year) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM eras WHERE model_id = ? AND status = 'APPROVED' AND (start_year IS NULL OR start_year <= ?1) AND (end_year IS NULL OR end_year >= ?1)`,
    ).bind(insp.model_id, insp.claimed_year).all<Record<string, any>>();
    if (results.length === 1) era = results[0];
  }

  const rules = (await env.DB.prepare(
    `SELECT * FROM rules WHERE brand_id = ? AND status IN ('draft','pending_review','approved')`,
  ).bind(insp.brand_id).all<RuleRow>()).results.map(toRule);

  const observations = (await env.DB.prepare('SELECT key, value_json, source, created_at FROM observations WHERE inspection_id = ?')
    .bind(inspectionId).all<{ key: string; value_json: string; source: Observation['source']; created_at: string }>())
    .results.map((o): Observation => ({ key: o.key, value: JSON.parse(o.value_json), source: o.source, createdAt: o.created_at }));

  const captures = (await env.DB.prepare('SELECT template_code FROM captures WHERE inspection_id = ?').bind(inspectionId)
    .all<{ template_code: string }>()).results.map((c) => ({ templateCode: c.template_code }));
  const templates: CaptureTemplate[] = (await resolveTemplates(env, insp.brand_id, insp.model_id)).map((t) => ({ code: t.code, required: t.required === 1 }));

  // date code (approved tables only influence the verdict)
  let datecode: DateCodeResult | null = null;
  const dcObs = observations.filter((o) => o.key === 'datecode.value' && o.source !== 'ai_suggested').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  if (dcObs && typeof dcObs.value === 'string' && dcObs.value.trim()) {
    const fm = (await env.DB.prepare('SELECT * FROM datecode_formats WHERE brand_id = ?').bind(insp.brand_id).all<Record<string, any>>()).results
      .map((f): DateCodeFormat => ({ id: f.id, name: f.name, startYear: f.start_year, endYear: f.end_year, pattern: f.pattern, extraction: JSON.parse(f.extraction_json), status: f.status }));
    const fc = (await env.DB.prepare('SELECT * FROM factory_codes WHERE brand_id = ?').bind(insp.brand_id).all<Record<string, any>>()).results
      .map((f): FactoryCode => ({ code: f.code, country: f.country, location: f.location, status: f.status }));
    datecode = decodeDateCode(dcObs.value, fm, fc, {
      claimedYear: insp.claimed_year ?? null,
      eraStart: era && era.status === 'APPROVED' ? era.start_year : null,
      eraEnd: era && era.status === 'APPROVED' ? era.end_year : null,
    });
  }

  const result = evaluate({
    brandId: insp.brand_id, modelId: insp.model_id, eraId: era?.id ?? null,
    rules, observations, captures, templates,
    minAuthenticSupports: await getSettingNumber(env, 'min_authentic_supports', 3),
    datecode,
  });
  const snapshot = await rulesSnapshotHash(rules);
  const evalId = uid('ev_');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO evaluations (id, inspection_id, engine_version, outcome, detail_json, rules_snapshot_hash, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(evalId, inspectionId, result.engineVersion, result.outcome, JSON.stringify(result), snapshot, userId),
    env.DB.prepare(`UPDATE inspections SET outcome = ?, evaluated_at = ?, status = CASE WHEN status IN ('signed_off','closed') THEN status ELSE 'evaluated' END WHERE id = ?`)
      .bind(result.outcome, nowIso(), inspectionId),
  ]);
  return { evaluationId: evalId, rulesSnapshotHash: snapshot, ...result };
}
