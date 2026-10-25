import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';

export default function Certificates() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ certNo: '', issueDate: '', externalUrl: '', officialResult: '' });
  const load = () => api.get('/api/certificates').then(setRows);
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { await api.post('/api/certificates', Object.fromEntries(Object.entries(f).filter(([, v]) => v))); setF({ certNo: '', issueDate: '', externalUrl: '', officialResult: '' }); load(); } catch (e2) { setErr(errText(e2)); }
  }
  return (
    <Page title={t('certificates')} subtitle="Certificates a customer or staff member registers are always UNVERIFIED. Only a record returned by a connected provider can be marked provider-verified.">
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      <form onSubmit={add} className="card mb-6 grid gap-3 md:grid-cols-2">
        <Field label="Certificate no."><input className="input" value={f.certNo} onChange={(e) => setF({ ...f, certNo: e.target.value })} required /></Field>
        <Field label="Issue date"><input className="input" type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
        <Field label="Link (https)"><input className="input" type="url" value={f.externalUrl} onChange={(e) => setF({ ...f, externalUrl: e.target.value })} /></Field>
        <Field label="Result as printed"><input className="input" value={f.officialResult} onChange={(e) => setF({ ...f, officialResult: e.target.value })} /></Field>
        <div className="md:col-span-2"><button className="btn-primary">{t('create')} (unverified)</button></div>
      </form>
      <div className="card divide-y divide-hairline p-0">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="font-mono text-xs">{r.cert_no} · {r.kind}</div>
            <Badge tone={r.verification_status === 'provider_verified' ? 'ok' : 'warn'}>{r.verification_status}</Badge>
          </div>))}
        {rows.length === 0 && <div className="p-6 text-sm text-muted">{t('noData')}</div>}
      </div>
    </Page>
  );
}
