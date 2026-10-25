import React, { useContext, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';

export default function Settings() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [s, setS] = useState<any[]>([]); const [users, setUsers] = useState<any[]>([]); const [err, setErr] = useState<string | null>(null);
  const [nu, setNu] = useState({ email: '', name: '', password: '', role: 'appraiser' });
  const load = () => { api.get('/api/settings').then(setS); api.get('/api/users').then(setUsers).catch(() => {}); };
  useEffect(load, []);
  const owner = me.role === 'owner';
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); load(); } catch (e) { setErr(errText(e)); } };
  return (
    <Page title={t('settings')} subtitle={owner ? undefined : 'Only the owner can change settings.'}>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      <div className="card divide-y divide-hairline p-0">
        {s.filter((x) => x.key !== 'locale').map((x) => <Row key={x.key} k={x.key} v={x.value} disabled={!owner} onSave={(v) => act(() => api.put(`/api/settings/${x.key}`, { value: v }))} />)}
      </div>
      {owner && (
        <>
          <h2 className="mb-2 mt-8 text-2xl">Users</h2>
          <div className="card mb-4 divide-y divide-hairline p-0">
            {users.map((u) => <div key={u.id} className="flex justify-between px-4 py-2 text-sm"><span>{u.name} · {u.email}</span><Badge>{u.role}</Badge></div>)}
          </div>
          <form className="card grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); act(async () => { await api.post('/api/users', nu); setNu({ email: '', name: '', password: '', role: 'appraiser' }); }); }}>
            <Field label={t('name')}><input className="input" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} required /></Field>
            <Field label={t('email')}><input className="input" type="email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} required /></Field>
            <Field label={t('password')}><input className="input" type="password" minLength={12} value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} required autoComplete="new-password" /></Field>
            <Field label="Role"><select className="input" value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>{['lead_authenticator', 'appraiser', 'reviewer', 'subscriber', 'readonly'].map((r) => <option key={r}>{r}</option>)}</select></Field>
            <button className="btn-primary">{t('create')}</button>
          </form>
        </>
      )}
    </Page>
  );
}

function Row({ k, v, disabled, onSave }: { k: string; v: string; disabled: boolean; onSave: (n: number) => void }) {
  const { t } = useI18n();
  const [val, setVal] = useState(v);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="font-mono text-xs">{k}</span>
      <span className="flex gap-2"><input className="input !w-24" type="number" min={1} value={val} disabled={disabled} onChange={(e) => setVal(e.target.value)} />
        {!disabled && <button className="btn-ghost" onClick={() => onSave(Number(val))}>{t('save')}</button>}</span>
    </div>
  );
}
