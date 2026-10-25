import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Empty, OutcomeBadge, Page } from '../ui.tsx';

export default function Inspections() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState('');
  useEffect(() => { api.get('/api/inspections').then(setRows); }, []);
  const f = rows.filter((r) => `${r.ref_code} ${r.brand} ${r.model} ${r.item_ref ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title={t('inspections')} actions={<Link to="/inspections/new" className="btn-primary">{t('newInspection')}</Link>}>
      <input className="input mb-4 max-w-sm" placeholder="Search ref, brand, model…" value={q} onChange={(e) => setQ(e.target.value)} />
      {f.length === 0 ? <Empty /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-low font-mono text-[10px] uppercase tracking-widest text-muted"><tr><th className="p-3">Ref</th><th>{t('brand')} / {t('model')}</th><th>{t('status')}</th><th>{t('outcome')}</th><th>Photos</th></tr></thead>
            <tbody>{f.map((r) => (
              <tr key={r.id} className="border-t border-hairline hover:bg-surface-low">
                <td className="p-3 font-mono text-xs"><Link className="underline" to={`/inspections/${r.id}`}>{r.ref_code}</Link></td>
                <td>{r.brand} · {r.model}</td><td><Badge tone="info">{r.status}</Badge></td><td><OutcomeBadge outcome={r.outcome} /></td><td>{r.captures}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
