import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { OutcomeBadge } from './ui.tsx';

// Sections moved out of the customer tab bar: they live here for staff.
const GROUPS: { title: string; links: [string, string][] }[] = [
  { title: 'adm.gWork', links: [['/inspections', 'inspections'], ['/inspections/new', 'newInspection'], ['/knowledge', 'knowledge'], ['/coverage', 'coverage'], ['/library', 'library']] },
  { title: 'adm.gTools', links: [['/check/nfc', 'check.nfc'], ['/datecode', 'datecode']] },
  { title: 'adm.gEntrupy', links: [['/providers', 'adm.entrupySdk'], ['/verify/entrupy', 'adm.entrupyGuide'], ['/certificates', 'adm.providerCerts']] },
  { title: 'adm.gSystem', links: [['/audit', 'audit'], ['/settings', 'settings']] },
];

export default function AdminTools() {
  const { t } = useI18n();
  return (
    <div className="card space-y-3">
      <div className="font-semibold">🧰 {t('adm.tools')}</div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted">{t(g.title)}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.links.map(([to, k]) => <Link key={to} to={to} className="btn-ghost !px-2.5 !py-1 text-xs">{t(k)}</Link>)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** All verification requests (newest first) and the HENGZ certificates issued. */
export function VerifyQueue() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [certs, setCerts] = useState<any[] | null>(null);
  const loadCerts = () => api.get('/api/hengz-certificates').then((r) => setCerts(r.certificates)).catch(() => setCerts([]));
  useEffect(() => {
    api.get('/api/verify?all=1').then((r) => setRows(r.requests)).catch(() => setRows([]));
    loadCerts();
  }, []);
  const remove = async (id: string) => {
    if (!window.confirm(t('cert.removeConfirm'))) return;
    try { await api.post(`/api/hengz-certificates/${id}/remove`, { reason: 'Removed by admin (test)' }); loadCerts(); } catch { /* shown on next load */ }
  };
  return (
    <div className="card space-y-3">
      <div className="font-semibold">🗂 {t('adm.queue')}</div>
      {rows === null ? <p className="text-xs text-muted">…</p> : !rows.length ? <p className="text-xs text-muted">{t('noData')}</p> : (
        <ul className="max-h-80 divide-y divide-hairline overflow-y-auto text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/verify/r/${r.id}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}<span className="block text-[11px] text-muted">{new Date(r.created_at).toLocaleString()}</span></span>
                {r.status === 'answered' ? <OutcomeBadge outcome={r.expert_outcome} /> : <span className="text-[11px]">{t(`vr.status.${r.status}`)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-hairline pt-2">
        <div className="mb-1 text-xs font-semibold">🏅 {t('cert.list')}</div>
        {certs === null ? <p className="text-xs text-muted">…</p> : !certs.length ? <p className="text-xs text-muted">{t('noData')}</p> : (
          <ul className="divide-y divide-hairline text-xs">
            {certs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <a href={`/certificate/${c.public_code}`} target="_blank" rel="noreferrer" className="font-mono underline">{c.cert_no}</a>
                <span className="min-w-0 flex-1 truncate">{c.brand}{c.model_text ? ` · ${c.model_text}` : ''}</span>
                <span className={c.status === 'valid' ? 'text-verified' : 'text-counterfeit'}>{c.status === 'valid' ? t('cert.validBadge') : t('cert.revokedBadge')}</span>
                <button type="button" onClick={() => remove(c.id)} aria-label={t('cert.remove')} className="px-1 text-counterfeit">🗑</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Admin: test the AI keys and models now, with the provider's own error message when something fails. */
export function AiCheck() {
  const { t } = useI18n();
  const [r, setR] = useState<{ configured: boolean; results: { name: string; model: string; ok: boolean; ms: number; error?: string }[]; untranslated: number } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true); setErr(null);
    try { setR(await api.get('/api/admin/ai/test')); } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">🤖 {t('ai.check')}</div>
        <button type="button" className="btn-primary !py-1 text-xs" disabled={busy} onClick={run}>{busy ? '…' : `🔎 ${t('ai.test')}`}</button>
      </div>
      {r && !r.configured && <p className="text-xs text-counterfeit">{t('ai.noKey')}</p>}
      {r?.results.map((x) => (
        <div key={x.name} className={`rounded-lg p-2 text-xs ${x.ok ? 'bg-verified/10' : 'bg-counterfeit/10'}`}>
          <div className="font-semibold">{x.ok ? '✅' : '❌'} {x.name}</div>
          <div className="font-mono text-[10px] text-muted">{x.model} · {x.ms} ms</div>
          {x.error && <div className="mt-1 break-words font-mono text-[11px] text-counterfeit">{x.error}</div>}
        </div>
      ))}
      {r && <p className="text-xs text-muted">{t('ai.untranslated')}: {r.untranslated}</p>}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}

/** This phone: turn expert notifications on (sound + vibration for each new request, price or answer). */
export function NotifyCard() {
  const { t } = useI18n();
  const [state, setState] = useState<'on' | 'off' | 'denied' | 'unsupported' | 'install' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const m = await import('./push.ts');
      if (m.needsInstallForPush()) return setState('install');
      if (!m.pushSupported()) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      setState((await m.currentSubscription()) ? 'on' : 'off');
    })();
  }, []);
  async function on() {
    setMsg(null);
    const m = await import('./push.ts');
    try { const r = await m.enablePush(); setState(r === 'on' ? 'on' : r === 'denied' ? 'denied' : 'unsupported'); } catch (e) { setMsg(String((e as Error).message)); }
  }
  async function test() {
    setMsg('…');
    try { const r = await api.post<{ sent: number }>('/api/push/test'); setMsg(r.sent ? `✓ ${t('push.testSent')}` : t('push.noPhones')); } catch (e) { setMsg(String((e as Error).message)); }
  }
  async function off() { const m = await import('./push.ts'); await m.disablePush(); setState('off'); }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">🔔 {t('push.title')}</div>
        {state === 'on' && <span className="rounded-full bg-verified px-2 py-0.5 text-[11px] font-semibold text-white">{t('push.on')}</span>}
      </div>
      <p className="text-xs text-muted">{t('push.help')}</p>
      {state === 'install' && <p className="rounded-lg bg-gold-light p-2 text-xs">{t('push.install')}</p>}
      {state === 'unsupported' && <p className="text-xs text-counterfeit">{t('push.unsupported')}</p>}
      {state === 'denied' && <p className="text-xs text-counterfeit">{t('push.denied')}</p>}
      <div className="flex flex-wrap gap-2">
        {state === 'off' && <button type="button" className="btn-primary !py-1.5 text-xs" onClick={on}>🔔 {t('push.enable')}</button>}
        {state === 'on' && <><button type="button" className="btn-ghost !py-1.5 text-xs" onClick={test}>{t('push.test')}</button>
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={off}>{t('push.disable')}</button></>}
      </div>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}

/** Admins: expert accounts — create one, see which have notifications on, switch one off. */
export function ExpertsCard() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.get('/api/admin/experts').then((r) => setRows(r.experts)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await api.post('/api/admin/experts', f); setF({ name: '', email: '', password: '' }); setMsg(`✓ ${t('exp.added')}`); load(); } catch (e2) { setMsg(String((e2 as Error).message)); }
  }
  const toggle = async (id: string, active: boolean) => { try { await api.post(`/api/admin/experts/${id}/active`, { active }); load(); } catch (e) { setMsg(String((e as Error).message)); } };
  return (
    <div className="card space-y-3">
      <div className="font-semibold">👥 {t('exp.title')}</div>
      {rows === null ? <p className="text-xs text-muted">…</p> : (
        <ul className="divide-y divide-hairline text-sm">
          {rows.map((u) => (
            <li key={u.id} className={`flex items-center gap-2 py-1.5 ${u.active ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{u.name} <span className="text-[10px] font-normal text-muted">{u.role}</span></div>
                <div className="truncate text-[11px] text-muted">{u.email}</div>
              </div>
              <span className="shrink-0 text-[11px]" title={t('exp.phones')}>{u.phones > 0 ? `🔔 ${u.phones}` : '🔕'}</span>
              {u.role === 'appraiser' && <button type="button" className="shrink-0 text-[11px] underline" onClick={() => toggle(u.id, !u.active)}>{u.active ? t('exp.disable') : t('exp.enable')}</button>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-1.5 border-t border-hairline pt-2">
        <div className="text-xs font-semibold">{t('exp.new')}</div>
        <input className="input !py-1.5 text-sm" placeholder={t('name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={100} />
        <input className="input !py-1.5 text-sm" type="email" placeholder={t('email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="off" />
        <input className="input !py-1.5 text-sm" type="password" placeholder={t('exp.pw')} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" />
        <button className="btn-primary !py-1.5 text-xs">+ {t('exp.create')}</button>
      </form>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}

/** Admins: the contact customers see (QR code, LINE ID, phone, Telegram, a short note). */
export function ContactAdmin() {
  const { t } = useI18n();
  const [f, setF] = useState({ lineId: '', phone: '', telegram: '', note: '' });
  const [qr, setQr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.get('/api/contact').then((c) => { setF({ lineId: c.lineId ?? '', phone: c.phone ?? '', telegram: c.telegram ?? '', note: c.note ?? '' }); setQr(c.qr ? `/api/contact/qr?v=${c.qrVersion}` : null); }).catch(() => {});
  useEffect(() => { load(); }, []);
  async function save() { setMsg('…'); try { await api.put('/api/admin/contact', f); setMsg('✓'); } catch (e) { setMsg(String((e as Error).message)); } }
  async function upload(file: File) {
    const fd = new FormData(); fd.append('file', file);
    setMsg('…'); try { await api.post('/api/admin/contact/qr', fd); setMsg('✓'); load(); } catch (e) { setMsg(String((e as Error).message)); }
  }
  async function removeQr() { await api.del('/api/admin/contact/qr').catch(() => {}); setQr(null); }
  return (
    <div className="card space-y-2">
      <div className="font-semibold">📇 {t('contact.admin')}</div>
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-strong bg-white">
          {qr ? <img src={qr} alt="QR" className="h-full w-full object-contain" /> : <span className="text-[10px] text-muted">QR</span>}
        </div>
        <div className="space-y-1.5 text-xs">
          <label className="btn-ghost inline-block cursor-pointer !py-1">⤒ {t('contact.uploadQr')}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) upload(x); }} /></label>
          {qr && <button type="button" className="block text-counterfeit underline" onClick={removeQr}>{t('contact.removeQr')}</button>}
        </div>
      </div>
      <input className="input !py-1.5 text-sm" placeholder="LINE ID (e.g. @hengz)" value={f.lineId} onChange={(e) => setF({ ...f, lineId: e.target.value })} maxLength={80} />
      <input className="input !py-1.5 text-sm" placeholder={t('contact.phone')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} />
      <input className="input !py-1.5 text-sm" placeholder="Telegram (@…)" value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} maxLength={80} />
      <input className="input !py-1.5 text-sm" placeholder={t('contact.notePh')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} />
      <button type="button" className="btn-primary !py-1.5 text-xs" onClick={save}>{t('vra.save')}</button>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
