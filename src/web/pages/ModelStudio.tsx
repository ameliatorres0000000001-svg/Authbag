import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';
import MarkCanvas, { type Mark } from '../MarkCanvas.tsx';
import DateCodeAppearanceCard from '../DateCodeAppearance.tsx';
import { ADMIN_ROLES, BASES, LICENCES, STAFF_ROLES, annotateAfterUpload, assetImg, uploadReference } from '../studio.ts';
import type { Studio, StudioModel } from './Dashboard.tsx';

/** One model's teaching set: up to 5 known-genuine photos, each with a teaching note, an AI instruction and "look here" points. */
export default function ModelStudio() {
  const { modelId } = useParams();
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [studio, setStudio] = useState<Studio | null>(null);
  const [sel, setSel] = useState<number | null>(null); // selected slot
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.get<Studio>('/api/studio').then(setStudio), []);
  useEffect(() => { load(); }, [load]);

  const m: StudioModel | undefined = studio?.models.find((x) => x.id === modelId);
  const size = studio?.setSize ?? 5;
  const admin = ADMIN_ROLES.includes(me.role);
  const asset = m?.set.find((a) => a.slot === sel) ?? null;

  if (studio && !m) return <Page title={t('studio.title')}><Notice tone="bad">not_found</Notice></Page>;

  return (
    <Page title={m ? `${m.brand} · ${m.name}` : '…'} subtitle={t('studio.help')}
      actions={<Link to="/" className="btn-ghost">{t('studio.back')}</Link>}>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: size }, (_, i) => i + 1).map((slot) => {
          const a = m?.set.find((x) => x.slot === slot);
          const on = sel === slot;
          return (
            <button key={slot} type="button" onClick={() => setSel(slot)}
              className={`overflow-hidden rounded-lg border text-left ${on ? 'border-gold ring-2 ring-gold' : 'border-hairline'} bg-surface-card`}>
              {a ? <img src={assetImg(a.id)} alt="" className="aspect-square w-full bg-surface-high object-cover" />
                : <div className="flex aspect-square items-center justify-center border-b border-dashed border-strong text-2xl text-muted">+</div>}
              <div className="p-1.5">
                <div className="font-mono text-[10px] text-muted">{t('studio.slot')} {slot}</div>
                <div className="truncate text-xs font-semibold">{a?.teaching_title ?? (a ? '—' : t('studio.emptySlot'))}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {sel == null && <p className="text-sm text-muted">{t('studio.pickSlot')}</p>}
        {sel != null && !asset && m && (admin
          ? <SlotUpload model={m} slot={sel} onDone={() => { setErr(null); load(); }} onError={setErr} />
          : <Notice>{t('studio.adminOnly')}</Notice>)}
        {asset && <AssetEditor key={asset.id} assetId={asset.id} canEdit={STAFF_ROLES.includes(me.role)} canRemove={[...ADMIN_ROLES, 'reviewer'].includes(me.role)}
          onChanged={load} onRemoved={() => { load(); }} />}
      </div>
    </Page>
  );
}

function SlotUpload({ model, slot, onDone, onError }: { model: StudioModel; slot: number; onDone: () => void; onError: (e: string) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ teachingTitle: '', teachingNote: '', aiPrompt: '', labelBasis: 'purchase_receipt', license: 'own', sourceUrl: '', componentCode: '' });
  const [file, setFile] = useState<File | null>(null);
  const [comps, setComps] = useState<{ code: string; name_en: string; name_km: string }[]>([]);
  const { locale } = useI18n();
  useEffect(() => { api.get('/api/components').then(setComps); }, []);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadReference(file, { brandId: model.brand_id, modelId: model.id, purpose: 'model_set', slot, label: 'authentic', ...f });
      await annotateAfterUpload(r.id, f.componentCode);
      onDone();
    } catch (err) { onError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 md:grid-cols-2">
      <h2 className="text-xl md:col-span-2">{t('studio.uploadTo')} {slot}</h2>
      <Field label={t('studio.photoTitle')}><input className="input" maxLength={120} value={f.teachingTitle} onChange={(e) => set('teachingTitle', e.target.value)} /></Field>
      <Field label="Image"><input className="input" type="file" accept="image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <Field label={t('studio.teachingNote')}><textarea className="input" rows={4} maxLength={4000} placeholder={t('studio.teachingNoteEx')} value={f.teachingNote} onChange={(e) => set('teachingNote', e.target.value)} /></Field>
      <Field label={t('studio.aiPrompt')}><textarea className="input" rows={4} maxLength={2000} placeholder={t('studio.aiPromptEx')} value={f.aiPrompt} onChange={(e) => set('aiPrompt', e.target.value)} /></Field>
      <Field label={t('studio.basis')}><select className="input" value={f.labelBasis} onChange={(e) => set('labelBasis', e.target.value)}>{BASES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label={t('studio.licence')}><select className="input" value={f.license} onChange={(e) => set('license', e.target.value)}>{LICENCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label={t('studio.source')}><input className="input" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} /></Field>
      <Field label={t('admin.part')}><select className="input" value={f.componentCode} onChange={(e) => set('componentCode', e.target.value)}><option value="">—</option>{comps.map((c) => <option key={c.code} value={c.code}>{locale === 'km' ? c.name_km : c.name_en}</option>)}</select></Field>
      <div className="flex items-end"><button className="btn-primary w-full" disabled={busy || !file}>{busy ? t('studio.uploading') : t('studio.upload')}</button></div>
    </form>
  );
}

function AssetEditor({ assetId, canEdit, canRemove, onChanged, onRemoved }: { assetId: string; canEdit: boolean; canRemove: boolean; onChanged: () => void; onRemoved: () => void }) {
  const { t } = useI18n();
  const [a, setA] = useState<any>(null);
  const [f, setF] = useState({ teachingTitle: '', teachingNote: '', aiPrompt: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(() => api.get(`/api/studio/assets/${assetId}`).then((r) => {
    setA(r); setF({ teachingTitle: r.teaching_title ?? '', teachingNote: r.teaching_note ?? '', aiPrompt: r.ai_prompt ?? '' });
  }), [assetId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(false); }
  };
  if (!a) return <div className="text-muted">…</div>;
  const marks: Mark[] = a.points;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <MarkCanvas src={assetImg(a.id)} marks={marks} locked={!canEdit} aiConfigured={a.aiConfigured} busy={busy} withNote
          onAdd={(r, label, note) => run(async () => { await api.post(`/api/assets/${a.id}/points`, { ...r, label, note }); await load(); onChanged(); })}
          onDelete={(id) => run(async () => { await api.del(`/api/reference-points/${id}`); await load(); onChanged(); })}
          onSuggest={() => run(async () => { await api.post(`/api/assets/${a.id}/points/suggest`); await load(); onChanged(); })} />
      </div>
      <div className="space-y-3">
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.status === 'approved' ? 'ok' : 'warn'}>{a.status}</Badge>
            <span className="font-mono text-[11px] text-muted">{a.label_basis} · {a.license}</span>
          </div>
          {a.status === 'quarantine' && <Notice tone="warn">{t('studio.quarantineWhy')}</Notice>}
          <Field label={t('studio.photoTitle')}><input className="input" disabled={!canEdit} maxLength={120} value={f.teachingTitle} onChange={(e) => setF({ ...f, teachingTitle: e.target.value })} /></Field>
          <Field label={t('studio.teachingNote')}><textarea className="input" disabled={!canEdit} rows={6} maxLength={4000} placeholder={t('studio.teachingNoteEx')} value={f.teachingNote} onChange={(e) => setF({ ...f, teachingNote: e.target.value })} /></Field>
          <Field label={t('studio.aiPrompt')}><textarea className="input" disabled={!canEdit} rows={3} maxLength={2000} placeholder={t('studio.aiPromptEx')} value={f.aiPrompt} onChange={(e) => setF({ ...f, aiPrompt: e.target.value })} /></Field>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-2">
            {canEdit && <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api.put(`/api/assets/${a.id}/teaching`, f); onChanged(); }, t('studio.saved'))}>{t('studio.saveNote')}</button>}
            {canRemove && <button className="btn-danger" disabled={busy} onClick={() => run(async () => { await api.post(`/api/assets/${a.id}/review`, { decision: 'reject' }); onRemoved(); })}>{t('studio.remove')}</button>}
          </div>
        </div>
        {a.component_code === 'date_code' && <DateCodeAppearanceCard base={`/api/assets/${a.id}`} canRun={canEdit} askTyped />}
        <p className="text-xs text-muted">{t('studio.notCounted')}</p>
      </div>
    </div>
  );
}
