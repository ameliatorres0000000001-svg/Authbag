import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';

const tone = (s: string) => (s === 'approved' ? 'ok' : s === 'pending_review' ? 'warn' : s === 'retired' ? 'bad' : 'muted');

export default function Knowledge() {
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const [tax, setTax] = useState<any>(null); const [rules, setRules] = useState<any[]>([]); const [dc, setDc] = useState<any>(null);
  const [defs, setDefs] = useState<any[]>([]); const [comps, setComps] = useState<any[]>([]);
  const [tab, setTab] = useState<'rules' | 'datecode'>('rules');
  const [filter, setFilter] = useState(''); const [err, setErr] = useState<string | null>(null); const [showNew, setShowNew] = useState(false);
  const load = () => {
    api.get('/api/taxonomy').then(setTax); api.get('/api/rules').then(setRules); api.get('/api/datecode').then(setDc);
    api.get('/api/components').then(setComps);
  };
  useEffect(load, []);
  useEffect(() => { // observation defs via any model requirements endpoint
    if (tax?.models?.[0]) api.get(`/api/models/${tax.models[0].id}/requirements`).then((r) => setDefs(r.observationDefs)).catch(() => {});
  }, [tax]);

  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); load(); } catch (e) { setErr(errText(e)); } };
  const admin = ['owner', 'lead_authenticator', 'reviewer'].includes(me.role);
  const shown = rules.filter((r) => !filter || r.status === filter);
  const brandName = (id: string) => tax?.brands.find((b: any) => b.id === id)?.name ?? id;

  return (
    <Page title={t('knowledge')} subtitle="Only approved rules affect outcomes. A rule needs independent approvals (4-eyes) before it counts. Every rule carries a source tier; tier 4 = community / unverified."
      actions={<button className="btn-primary" onClick={() => setShowNew(!showNew)}>+ Rule</button>}>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      {showNew && tax && <NewRule tax={tax} defs={defs} comps={comps} onDone={() => { setShowNew(false); load(); }} />}
      <div className="mb-4 flex gap-2">
        <button className={tab === 'rules' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('rules')}>Rules</button>
        <button className={tab === 'datecode' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('datecode')}>Date codes</button>
      </div>

      {tab === 'rules' && (
        <>
          <select className="input mb-3 max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All statuses</option>{['draft', 'pending_review', 'approved', 'retired'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="card divide-y divide-hairline p-0">
            {shown.map((r) => (
              <div key={r.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-mono text-xs text-muted">{r.code} v{r.version}</span> <b>{locale === 'km' ? r.title_km : r.title_en}</b></div>
                  <div className="flex gap-1"><Badge tone={tone(r.status) as any}>{r.status}</Badge><Badge tone={r.polarity === 'concern_indicator' ? 'bad' : 'ok'}>{r.polarity}</Badge><Badge>{r.severity}</Badge><Badge>tier {r.source_tier}</Badge></div>
                </div>
                <div className="font-mono text-xs text-muted">{brandName(r.brand_id)} · {r.component_code} · {r.observation_key} · {r.check_json} · approvals {r.approvals}</div>
                {r.rationale && <p className="text-xs text-muted">{r.rationale}</p>}
                <div className="flex gap-2 pt-1">
                  {r.status === 'draft' && <button className="btn-ghost" onClick={() => act(() => api.post(`/api/rules/${r.id}/submit`))}>{t('submitReview')}</button>}
                  {r.status === 'pending_review' && admin && (<>
                    <button className="btn-primary" onClick={() => act(() => api.post(`/api/rules/${r.id}/review`, { decision: 'approve' }))}>{t('approve')}</button>
                    <button className="btn-ghost" onClick={() => act(() => api.post(`/api/rules/${r.id}/review`, { decision: 'reject' }))}>{t('reject')}</button>
                  </>)}
                  {r.status === 'approved' && admin && <button className="btn-ghost" onClick={() => act(() => api.post(`/api/rules/${r.id}/retire`))}>Retire</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'datecode' && dc && (
        <div className="space-y-4">
          <Notice tone="warn">Draft tables are displayed for orientation only. A date-code result counts toward an outcome only when BOTH the format and the factory code are approved.</Notice>
          <div className="card divide-y divide-hairline p-0">
            {dc.formats.map((f: any) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div><b>{f.name}</b> <span className="text-muted">{f.start_year}–{f.end_year ?? '…'} · {f.pattern}</span></div>
                <div className="flex items-center gap-2"><Badge tone={tone(f.status) as any}>{f.status}</Badge>
                  {admin && f.status !== 'approved' && <button className="btn-ghost" onClick={() => act(() => api.post(`/api/datecode/formats/${f.id}/status`, { status: 'approved' }))}>{t('approve')}</button>}</div>
              </div>))}
          </div>
          <div className="card divide-y divide-hairline p-0">
            {dc.factories.map((f: any) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div><b className="font-mono">{f.code}</b> {f.country ?? ''} {f.location ?? ''}</div>
                <div className="flex items-center gap-2"><Badge tone={tone(f.status) as any}>{f.status}</Badge>
                  {admin && f.status !== 'approved' && <button className="btn-ghost" onClick={() => act(() => api.post(`/api/datecode/factories/${f.id}/status`, { status: 'approved' }))}>{t('approve')}</button>}</div>
              </div>))}
          </div>
        </div>
      )}
    </Page>
  );
}

function NewRule({ tax, defs, comps, onDone }: { tax: any; defs: any[]; comps: any[]; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<any>({ code: '', brandId: '', modelId: '', componentCode: '', observationKey: '', ctype: 'in', cval: '', polarity: 'authentic_indicator', severity: 'minor', required: false, titleEn: '', titleKm: '', rationale: '', sourceTier: 4, citeNote: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const keys = defs.filter((d) => !f.componentCode || d.component_code === f.componentCode);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const raw = f.cval.trim();
      const parse = (s: string) => (s === 'true' ? true : s === 'false' ? false : s !== '' && !isNaN(Number(s)) ? Number(s) : s);
      const check =
        f.ctype === 'in' ? { type: 'in', values: raw.split(',').map((s: string) => parse(s.trim())) }
        : f.ctype === 'equals' ? { type: 'equals', value: parse(raw) }
        : f.ctype === 'regex' ? { type: 'regex', pattern: raw }
        : f.ctype === 'range' ? { type: 'range', min: raw.split(',')[0] ? Number(raw.split(',')[0]) : undefined, max: raw.split(',')[1] ? Number(raw.split(',')[1]) : undefined }
        : { type: 'present' };
      await api.post('/api/rules', {
        code: f.code, brandId: f.brandId, modelId: f.modelId || null, componentCode: f.componentCode, observationKey: f.observationKey, check,
        polarity: f.polarity, severity: f.severity, required: f.required, titleEn: f.titleEn, titleKm: f.titleKm, rationale: f.rationale || undefined,
        sourceTier: Number(f.sourceTier), citations: f.citeNote ? [{ type: 'note', note: f.citeNote }] : [],
      });
      onDone();
    } catch (e2) { setErr(errText(e2)); }
  }
  return (
    <form onSubmit={save} className="card mb-6 grid gap-3 md:grid-cols-2">
      <Field label="Code"><input className="input" value={f.code} onChange={(e) => set('code', e.target.value)} required /></Field>
      <Field label={t('brand')}><select className="input" value={f.brandId} onChange={(e) => set('brandId', e.target.value)} required><option value="">—</option>{tax.brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
      <Field label={t('model') + ' (optional)'}><select className="input" value={f.modelId} onChange={(e) => set('modelId', e.target.value)}><option value="">all</option>{tax.models.filter((m: any) => m.brand_id === f.brandId).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Component"><select className="input" value={f.componentCode} onChange={(e) => set('componentCode', e.target.value)} required><option value="">—</option>{comps.map((c: any) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></Field>
      <Field label="Observation"><select className="input" value={f.observationKey} onChange={(e) => set('observationKey', e.target.value)} required><option value="">—</option>{keys.map((k) => <option key={k.key} value={k.key}>{k.key}</option>)}</select></Field>
      <Field label="Check"><select className="input" value={f.ctype} onChange={(e) => set('ctype', e.target.value)}>{['in', 'equals', 'range', 'regex', 'present'].map((x) => <option key={x}>{x}</option>)}</select></Field>
      {f.ctype !== 'present' && <Field label={f.ctype === 'in' ? 'Values (comma separated)' : f.ctype === 'range' ? 'min,max' : 'Value'}><input className="input" value={f.cval} onChange={(e) => set('cval', e.target.value)} required /></Field>}
      <Field label="Polarity"><select className="input" value={f.polarity} onChange={(e) => set('polarity', e.target.value)}><option>authentic_indicator</option><option>concern_indicator</option></select></Field>
      <Field label="Severity"><select className="input" value={f.severity} onChange={(e) => set('severity', e.target.value)}><option>major</option><option>minor</option><option>info</option></select></Field>
      <Field label="Source tier (1 brand · 2 provider · 3 expert · 4 community)"><input className="input" type="number" min={1} max={4} value={f.sourceTier} onChange={(e) => set('sourceTier', e.target.value)} /></Field>
      <Field label="Title (EN)"><input className="input" value={f.titleEn} onChange={(e) => set('titleEn', e.target.value)} required minLength={3} /></Field>
      <Field label="Title (KM)"><input className="input" value={f.titleKm} onChange={(e) => set('titleKm', e.target.value)} required minLength={3} /></Field>
      <div className="md:col-span-2"><Field label="Rationale / source note"><textarea className="input" value={f.rationale} onChange={(e) => set('rationale', e.target.value)} /></Field></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.required} onChange={(e) => set('required', e.target.checked)} /> required</label>
      {err && <div className="md:col-span-2"><Notice tone="bad">{err}</Notice></div>}
      <div className="md:col-span-2"><button className="btn-primary">{t('create')} (draft)</button></div>
    </form>
  );
}
