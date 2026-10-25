import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Notice, Page, errText } from '../ui.tsx';

export default function Audit() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[]>([]); const [v, setV] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get('/api/audit').then(setRows).catch((e) => setErr(errText(e))); }, []);
  return (
    <Page title={t('audit')} subtitle="Append-only, hash-chained. Edits and deletes are refused by the database itself."
      actions={<button className="btn-primary" onClick={() => api.get('/api/audit/verify').then(setV).catch((e) => setErr(errText(e)))}>{t('verifyChain')}</button>}>
      {err && <Notice tone="bad">{err}</Notice>}
      {v && <div className="mb-4"><Notice tone={v.ok ? 'ok' : 'bad'}>{JSON.stringify(v)}</Notice></div>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-low font-mono uppercase tracking-widest text-muted"><tr><th className="p-3">#</th><th>Time</th><th>Action</th><th>Resource</th><th>Hash</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-hairline"><td className="p-3">{r.id}</td><td>{r.ts}</td><td><Badge tone="info">{r.action}</Badge></td><td className="font-mono">{r.resource_type}/{r.resource_id}</td><td className="font-mono">{String(r.hash).slice(0, 10)}</td></tr>))}</tbody>
        </table>
      </div>
    </Page>
  );
}
