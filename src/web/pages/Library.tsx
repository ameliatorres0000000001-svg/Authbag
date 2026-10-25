import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { prepareImage } from '../image.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';

export default function Library() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [rows, setRows] = useState<any[]>([]); const [tax, setTax] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<any>({ brandId: '', modelId: '', eraId: '', label: 'authentic', labelBasis: 'purchase_receipt', license: 'own', consentRef: '', sourceUrl: '' });
  const [file, setFile] = useState<File | null>(null);
  const load = () => api.get('/api/assets').then(setRows);
  useEffect(() => { load(); api.get('/api/taxonomy').then(setTax); }, []);
  const admin = ['owner', 'lead_authenticator', 'reviewer'].includes(me.role);

  async function upload(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      if (!file) return;
      const p = await prepareImage(file);
      const fd = new FormData();
      fd.append('file', new File([p.blob], 'ref.jpg', { type: 'image/jpeg' }));
      for (const [k, v] of Object.entries(f)) if (v) fd.append(k, String(v));
      await api.post('/api/assets', fd); setFile(null); load();
    } catch (e2) { setErr(errText(e2)); }
  }
  const review = async (id: string, decision: string) => { setErr(null); try { await api.post(`/api/assets/${id}/review`, { decision }); load(); } catch (e) { setErr(errText(e)); } };
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <Page title={t('library')} subtitle="Reference photos enter quarantine, then are approved by a reviewer. The database refuses approval when the licence is unknown or the label basis is only a seller claim / unverified. Never upload images you do not have permission to use.">
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      <form onSubmit={upload} className="card mb-6 grid gap-3 md:grid-cols-3">
        <Field label={t('brand')}><select className="input" value={f.brandId} onChange={(e) => set('brandId', e.target.value)} required><option value="">—</option>{tax?.brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label={t('model')}><select className="input" value={f.modelId} onChange={(e) => set('modelId', e.target.value)}><option value="">—</option>{tax?.models.filter((m: any) => m.brand_id === f.brandId).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Era"><select className="input" value={f.eraId} onChange={(e) => set('eraId', e.target.value)}><option value="">—</option>{tax?.eras.filter((x: any) => x.model_id === f.modelId).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Label"><select className="input" value={f.label} onChange={(e) => set('label', e.target.value)}><option>authentic</option><option>counterfeit</option><option>unknown</option></select></Field>
        <Field label="Label basis"><select className="input" value={f.labelBasis} onChange={(e) => set('labelBasis', e.target.value)}>{['purchase_receipt', 'brand_boutique', 'provider_certificate', 'expert_consensus', 'seller_claim', 'unverified'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Licence"><select className="input" value={f.license} onChange={(e) => set('license', e.target.value)}>{['own', 'consented', 'licensed', 'public_domain', 'unknown'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Consent reference"><input className="input" value={f.consentRef} onChange={(e) => set('consentRef', e.target.value)} /></Field>
        <Field label="Source URL"><input className="input" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} /></Field>
        <Field label="Image"><input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></Field>
        <div className="md:col-span-3"><button className="btn-primary" disabled={!file}>Upload to quarantine</button></div>
      </form>
      <div className="card divide-y divide-hairline p-0">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="font-mono text-xs">{r.id} · {r.label} · {r.label_basis} · {r.license}</div>
            <div className="flex items-center gap-2"><Badge tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Badge>
              {admin && r.status === 'quarantine' && (<><button className="btn-primary" onClick={() => review(r.id, 'approve')}>{t('approve')}</button><button className="btn-ghost" onClick={() => review(r.id, 'reject')}>{t('reject')}</button></>)}</div>
          </div>))}
        {rows.length === 0 && <div className="p-6 text-sm text-muted">{t('noData')}</div>}
      </div>
    </Page>
  );
}
