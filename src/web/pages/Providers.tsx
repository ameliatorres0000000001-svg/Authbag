import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';

export default function Providers() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState<string | null>(null);
  const load = () => api.get('/api/providers').then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Page title={t('providers')} subtitle="Third-party verification services plug in here through an adapter. A provider shows as connected only after a real, successful call to its API. HENGZ is not affiliated with any provider listed.">
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      <div className="grid gap-4 md:grid-cols-2">{rows.map((p) => <Card key={p.id} p={p} reload={load} setErr={setErr} />)}</div>
    </Page>
  );
}

function Card({ p, reload, setErr }: { p: any; reload: () => void; setErr: (s: string | null) => void }) {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [cfg, setCfg] = useState<any>(p.config ?? {}); const [busy, setBusy] = useState(false);
  const tone = p.status === 'connected' ? 'ok' : p.status === 'error' ? 'bad' : p.status === 'awaiting_authorization' ? 'warn' : 'muted';
  const set = (k: string, v: string) => setCfg({ ...cfg, [k]: v });
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(null); try { await fn(); reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between"><div className="font-serif text-xl">{p.name}</div><Badge tone={tone as any}>{p.status}</Badge></div>
      <div className="text-xs text-muted">{p.secret === 'present' ? t('secretPresent') : t('secretMissing')} <span className="font-mono">(Worker secret {p.id.toUpperCase()}_API_KEY)</span></div>
      {me.role === 'owner' && (
        <div className="grid gap-2">
          <Field label="Base URL (https, from provider developer docs)"><input className="input" value={cfg.base_url ?? ''} onChange={(e) => set('base_url', e.target.value)} placeholder="https://…" /></Field>
          <Field label="Test path"><input className="input" value={cfg.test_path ?? ''} onChange={(e) => set('test_path', e.target.value)} placeholder="/…" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Auth header"><input className="input" value={cfg.auth_header ?? ''} onChange={(e) => set('auth_header', e.target.value)} placeholder="Authorization" /></Field>
            <Field label="Auth prefix"><input className="input" value={cfg.auth_prefix ?? ''} onChange={(e) => set('auth_prefix', e.target.value)} placeholder="Bearer " /></Field>
          </div>
          <button className="btn-ghost" disabled={busy} onClick={() => run(() => api.put(`/api/providers/${p.id}/config`, Object.fromEntries(Object.entries(cfg).filter(([, v]) => v))))}>{t('save')}</button>
        </div>
      )}
      {['owner', 'lead_authenticator'].includes(me.role) && <button className="btn-primary" disabled={busy} onClick={() => run(() => api.post(`/api/providers/${p.id}/test`))}>{busy ? '…' : t('testConnection')}</button>}
      {p.last_test_message && <p className="text-xs text-muted">{p.last_test_at}: {p.last_test_message}</p>}
    </div>
  );
}
