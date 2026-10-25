import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Notice, OutcomeBadge, Page } from '../ui.tsx';

export default function Dashboard() {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  useEffect(() => { api.get('/api/dashboard').then(setD); api.get('/api/inspections').then((r) => setRecent(r.slice(0, 8))); }, []);

  const tiles: [string, number | undefined][] = d ? [
    ['Total inspections', d.total], ['Awaiting evidence', d.awaiting], ['Needs expert review', d.review],
    ['Signed off', d.signed], ['Rules pending review', d.pendingRules], ['Reference photos in quarantine', d.quarantined],
  ] : [];

  return (
    <Page title={t('dashboard')} subtitle="Every number below is read live from the database. Nothing is simulated."
      actions={<Link to="/inspections/new" className="btn-primary">{t('newInspection')}</Link>}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="card"><div className="label">{k}</div><div className="font-serif text-4xl">{v ?? '—'}</div></div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Official providers</div>
          {d?.providersConnected === 0
            ? <Notice tone="warn">No provider is connected. Provider results will appear here only after a real, successful connection test. <Link className="underline" to="/providers">{t('providers')}</Link></Notice>
            : <Badge tone="ok">{d?.providersConnected} connected</Badge>}
        </div>
        <div className="card">
          <div className="label mb-2">AI vs official</div>
          <p className="text-sm text-muted">Outcomes here are rule-based assessments by HENGZ, never an official provider certificate. Only a provider-verified record is shown as verified.</p>
        </div>
      </div>
      <h2 className="mb-2 mt-8 text-2xl">{t('inspections')}</h2>
      <div className="card divide-y divide-hairline p-0">
        {recent.length === 0 && <div className="p-6 text-sm text-muted">{t('noData')}</div>}
        {recent.map((i) => (
          <Link key={i.id} to={`/inspections/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-low">
            <div><div className="font-mono text-xs text-muted">{i.ref_code}</div><div className="font-semibold">{i.brand} · {i.model}</div></div>
            <div className="flex items-center gap-2"><Badge tone="info">{i.status}</Badge><OutcomeBadge outcome={i.outcome} /></div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
