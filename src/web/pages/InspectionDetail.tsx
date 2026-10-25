import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { prepareImage } from '../image.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, OutcomeBadge, Page, errText } from '../ui.tsx';

export default function InspectionDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [ev, setEv] = useState<any>(null);
  const [note, setNote] = useState('');
  const L = (o: any, k: string) => (locale === 'km' ? o[`${k}_km`] : o[`${k}_en`]) ?? o[`${k}_en`];

  const load = useCallback(async () => {
    const r = await api.get(`/api/inspections/${id}`);
    setD(r);
    if (r.evaluation) setEv({ ...JSON.parse(r.evaluation.detail_json), evaluationId: r.evaluation.id, rulesSnapshotHash: r.evaluation.rules_snapshot_hash });
  }, [id]);
  useEffect(() => { load().catch((e) => setErr(errText(e))); }, [load]);

  const defsByComp = useMemo(() => {
    const m: Record<string, any[]> = {};
    (d?.observationDefs ?? []).forEach((x: any) => { (m[x.component_code] ??= []).push(x); });
    return m;
  }, [d]);

  if (!d) return <Page title="…">{err && <Notice tone="bad">{err}</Notice>}</Page>;
  const insp = d.inspection;
  const locked = insp.status === 'signed_off';
  const run = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); setErr(null); try { await fn(); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); } };

  async function upload(tpl: any, file: File) {
    const p = await prepareImage(file);
    const fd = new FormData();
    fd.append('file', new File([p.blob], 'capture.jpg', { type: 'image/jpeg' }));
    fd.append('templateCode', tpl.code);
    fd.append('width', String(p.width)); fd.append('height', String(p.height));
    fd.append('quality', JSON.stringify(p.quality));
    await api.post(`/api/inspections/${id}/captures`, fd);
  }

  async function addObs(key: string, value: string | number | boolean, captureId: string | null) {
    await api.post(`/api/inspections/${id}/observations`, { key, value, captureId });
  }

  const capsFor = (code: string) => d.captures.filter((c: any) => c.template_code === code);
  const aiPending = d.observations.filter((o: any) => o.source === 'ai_suggested');

  return (
    <Page title={`${insp.brand} · ${insp.model}`} subtitle={`${insp.ref_code}${insp.claimed_year ? ` · ${insp.claimed_year}` : ''}${insp.item_ref ? ` · ${insp.item_ref}` : ''}`}
      actions={<div className="flex items-center gap-2"><Badge tone="info">{insp.status}</Badge><OutcomeBadge outcome={insp.outcome} /></div>}>
      {err && <div className="mb-4"><Notice tone="bad">{err}</Notice></div>}

      <h2 className="mb-2 text-2xl">{t('capture')}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {d.templates.map((tpl: any) => {
          const caps = capsFor(tpl.code);
          const defs = tpl.component_code ? defsByComp[tpl.component_code] ?? [] : [];
          return (
            <div key={tpl.code} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div><div className="font-semibold">{L(tpl, 'label')}</div>{L(tpl, 'guidance') && <p className="mt-1 text-xs text-muted">{L(tpl, 'guidance')}</p>}</div>
                <Badge tone={tpl.required ? 'warn' : 'muted'}>{tpl.required ? t('required') : t('optional')}</Badge>
              </div>
              {caps.map((c: any) => {
                const q = c.quality_json ? JSON.parse(c.quality_json) : null;
                return (
                  <div key={c.id} className="flex gap-3">
                    <img src={`/api/captures/${c.id}/image`} alt="" className="h-20 w-20 rounded border border-hairline object-cover" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-mono text-muted">{c.width}×{c.height}</div>
                      {q?.warnings?.length > 0 && <div className="text-review">{t('qualityWarn')}: {q.warnings.join(', ')}</div>}
                      <Link className="mr-3 mt-1 inline-block underline" to={`/inspections/${id}/compare/${c.id}`}>{locale === 'km' ? 'ប្រៀបធៀប' : 'Compare'}</Link>
                      <button className="mt-1 underline disabled:opacity-40" disabled={!!busy || locked} onClick={() => run('ai' + c.id, async () => { try { await api.post(`/api/captures/${c.id}/suggest`); } catch (e: any) { if (e?.status === 501) throw new Error('AI is not configured (GEMINI_API_KEY or ANTHROPIC_API_KEY, plus AI_MODEL). Manual observation still works.'); throw e; } })}>{t('aiSuggest')}</button>
                    </div>
                  </div>
                );
              })}
              {!locked && (
                <label className="btn-ghost inline-flex cursor-pointer">
                  {busy === 'up' + tpl.code ? '…' : t('capture')}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('up' + tpl.code, () => upload(tpl, f)); }} />
                </label>
              )}
              {defs.length > 0 && !locked && <ObsForm defs={defs} locale={locale} onAdd={(k, v) => run('obs' + k, () => addObs(k, v, caps[0]?.id ?? null))} />}
            </div>
          );
        })}
      </div>

      {aiPending.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-2xl">{t('aiPending')}</h2>
          <div className="card divide-y divide-hairline p-0">
            {aiPending.map((o: any) => (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div><span className="font-mono text-xs">{o.key}</span> = <b>{String(JSON.parse(o.value_json))}</b> <span className="text-muted">({Math.round((o.confidence ?? 0) * 100)}%)</span></div>
                {!locked && <button className="btn-ghost" onClick={() => run('c' + o.id, () => api.post(`/api/observations/${o.id}/confirm`, {}))}>{t('confirm')}</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-2xl">{t('observations')}</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <tbody>
            {d.observations.length === 0 && <tr><td className="p-4 text-muted">{t('noData')}</td></tr>}
            {d.observations.map((o: any) => (
              <tr key={o.id} className="border-t border-hairline first:border-0">
                <td className="p-3 font-mono text-xs">{o.key}</td><td>{String(JSON.parse(o.value_json))}</td>
                <td><Badge tone={o.source === 'ai_suggested' ? 'warn' : 'info'}>{o.source}</Badge></td>
              </tr>))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link className="btn-ghost" to={`/inspections/${id}/scan`}>{locale === 'km' ? 'ស្កេនតាមជំហាន' : 'Guided scan'}</Link>
        <button className="btn-primary" disabled={!!busy || locked} onClick={() => run('eval', async () => { await api.post(`/api/inspections/${id}/evaluate`); })}>{busy === 'eval' ? '…' : t('evaluate')}</button>
      </div>

      {ev && <EvalPanel ev={ev} locale={locale} t={t} />}

      {ev && !locked && ['owner', 'lead_authenticator', 'appraiser'].includes(me.role) && (
        <div className="card mt-6 max-w-2xl space-y-3">
          <Field label={t('signoffNote')}><textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <button className="btn-primary" disabled={note.trim().length < 10 || !!busy} onClick={() => run('sign', () => api.post(`/api/inspections/${id}/signoff`, { note }))}>{t('signoff')}</button>
        </div>
      )}
      {locked && <div className="mt-6"><Notice tone="ok">{t('signoff')} · {insp.signed_off_at}<div className="mt-1 text-muted">{insp.signoff_note}</div></Notice></div>}
    </Page>
  );
}

export function ObsForm({ defs, locale, onAdd }: { defs: any[]; locale: string; onAdd: (k: string, v: string | number | boolean) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      {defs.map((df) => {
        const label = locale === 'km' ? df.label_km : df.label_en;
        const v = vals[df.key] ?? '';
        const submit = () => {
          if (v === '') return;
          onAdd(df.key, df.value_type === 'number' ? Number(v) : df.value_type === 'boolean' ? v === 'true' : v);
          setVals({ ...vals, [df.key]: '' });
        };
        return (
          <div key={df.key} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <span className="label">{label}{df.unit ? ` (${df.unit})` : ''}</span>
              {df.value_type === 'enum' ? (
                <select className="input" value={v} onChange={(e) => setVals({ ...vals, [df.key]: e.target.value })}>
                  <option value="">—</option>{(JSON.parse(df.enum_json) as string[]).map((x) => <option key={x}>{x}</option>)}
                </select>
              ) : df.value_type === 'boolean' ? (
                <select className="input" value={v} onChange={(e) => setVals({ ...vals, [df.key]: e.target.value })}><option value="">—</option><option value="true">yes</option><option value="false">no</option></select>
              ) : (
                <input className="input" type={df.value_type === 'number' ? 'number' : 'text'} value={v} onChange={(e) => setVals({ ...vals, [df.key]: e.target.value })} />
              )}
            </div>
            <button className="btn-ghost" type="button" onClick={submit}>+</button>
          </div>
        );
      })}
    </div>
  );
}

function RuleRow({ r, locale }: { r: any; locale: string }) {
  const tone = r.state === 'triggered' ? 'bad' : r.state === 'supported' ? 'ok' : 'muted';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
      <div><span className="font-mono text-xs text-muted">{r.code}</span> {locale === 'km' ? r.titleKm : r.titleEn}</div>
      <div className="flex gap-1"><Badge tone={tone as any}>{r.state}</Badge><Badge>{r.severity}</Badge></div>
    </div>
  );
}

function EvalPanel({ ev, locale, t }: { ev: any; locale: string; t: (k: string) => string }) {
  return (
    <div className="mt-6 space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="label">{t('outcome')}</div><OutcomeBadge outcome={ev.outcome} />
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {ev.reasons.map((r: any, i: number) => <li key={i}>{t(`reason.${r.code}`)}{r.detail ? <span className="text-muted"> — {r.detail}</span> : null}</li>)}
        </ul>
        {ev.missingCaptures?.length > 0 && <p className="mt-3 text-sm text-review">{t('missingCaptures')}: {ev.missingCaptures.join(', ')}</p>}
        {ev.missingRequiredObservations?.length > 0 && <p className="mt-1 text-sm text-review">{ev.missingRequiredObservations.join(', ')}</p>}
        {ev.pendingAiObservations?.length > 0 && <p className="mt-1 text-sm text-review">AI-only: {ev.pendingAiObservations.join(', ')}</p>}
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted">engine {ev.engineVersion} · rules {String(ev.rulesSnapshotHash ?? '').slice(0, 12)}</p>
      </div>
      {ev.datecode && (
        <div className="card">
          <div className="label">Date code · {ev.datecode.raw}</div>
          <p className="text-sm">{ev.datecode.reason} <Badge tone={ev.datecode.usable ? 'ok' : 'muted'}>{ev.datecode.usable ? ev.datecode.state : 'not counted (draft tables)'}</Badge></p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {ev.datecode.candidates.map((c: any, i: number) => <li key={i}>{c.formatName} · {c.factory}{c.country ? ` (${c.country})` : ''} · period {c.period} {c.periodUnit} · {c.year}</li>)}
          </ul>
        </div>
      )}
      <div className="card divide-y divide-hairline p-0">
        <div className="label px-4 pt-3">{t('countedRules')}</div>
        {ev.ruleResults.length === 0 && <div className="px-4 pb-3 text-sm text-muted">{t('noData')}</div>}
        {ev.ruleResults.map((r: any) => <RuleRow key={r.ruleId} r={r} locale={locale} />)}
      </div>
      {ev.hints.length > 0 && (
        <div className="card divide-y divide-hairline p-0 opacity-80">
          <div className="label px-4 pt-3">{t('hints')}</div>
          {ev.hints.map((r: any) => <RuleRow key={r.ruleId} r={r} locale={locale} />)}
        </div>
      )}
      <Notice tone="warn">{t('notCertificate')}</Notice>
    </div>
  );
}
