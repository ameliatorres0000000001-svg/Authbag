import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Field, Notice, Page, errText } from '../ui.tsx';

export default function NewInspection() {
  const { t } = useI18n(); const nav = useNavigate();
  const [tax, setTax] = useState<any>(null);
  const [brandId, setBrandId] = useState(''); const [modelId, setModelId] = useState('');
  const [year, setYear] = useState(''); const [itemRef, setItemRef] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get('/api/taxonomy').then(setTax); }, []);
  const models = (tax?.models ?? []).filter((m: any) => m.brand_id === brandId);
  const brand = tax?.brands.find((b: any) => b.id === brandId);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      const r = await api.post('/api/inspections', { brandId, modelId, claimedYear: year ? Number(year) : null, itemRef: itemRef || undefined });
      nav(`/inspections/${r.id}/scan`);
    } catch (e2) { setErr(errText(e2)); }
  }
  return (
    <Page title={t('newInspection')} subtitle="Choose what the item is claimed to be. The required photo checklist and the applicable rules are loaded from the database for that model.">
      <form onSubmit={create} className="card max-w-xl space-y-4">
        <Field label={t('brand')}>
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }} required>
            <option value="">—</option>{tax?.brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        {brand && brand.knowledge_status !== 'KNOWLEDGE_AVAILABLE' && <Notice tone="warn">Knowledge status for {brand.name}: <b>{brand.knowledge_status}</b>. Outcomes will mostly be “insufficient evidence” until experts approve rules.</Notice>}
        <Field label={t('model')}>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} required disabled={!brandId}>
            <option value="">—</option>{models.map((m: any) => <option key={m.id} value={m.id}>{m.name}{m.status === 'STUB' ? ' (stub)' : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('claimedYear')}><input className="input" type="number" min={1850} max={2100} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Field label={t('itemRef')}><input className="input" value={itemRef} onChange={(e) => setItemRef(e.target.value)} /></Field>
        </div>
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn-primary" disabled={!modelId}>{t('create')}</button>
      </form>
    </Page>
  );
}
