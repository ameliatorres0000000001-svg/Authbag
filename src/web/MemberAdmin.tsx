import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Field, Notice, errText } from './ui.tsx';
import type { MembershipInfo } from './pages/Membership.tsx';
import { fmtDate } from './pages/Membership.tsx';

interface AdminPayment { id: string; method: 'khqr' | 'kbank'; amount: number; currency: string; months: number; reference: string | null; status: string; created_at: string; name: string; email: string; paid_until: string | null }

/** Payments waiting for a check: open the slip, compare with the bank app, approve or reject. */
export function PaymentsCard() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<AdminPayment[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get<{ payments: AdminPayment[] }>('/api/admin/payments?status=pending').then((r) => setRows(r.payments)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  const review = async (id: string, approve: boolean) => {
    setBusy(true); setErr('');
    try { await api.post(`/api/admin/payments/${id}/review`, { approve, note: note || null }); setOpen(null); setNote(''); await load(); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card space-y-2">
      <div className="font-semibold">💳 {t('pa.title')} {rows && rows.length > 0 && <span className="ml-1 rounded-full bg-counterfeit px-2 py-0.5 text-xs text-white">{rows.length}</span>}</div>
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      <ul className="divide-y divide-hairline">
        {rows?.map((p) => (
          <li key={p.id} className="py-2 text-sm">
            <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === p.id ? null : p.id)}>
              <span className="min-w-0 flex-1"><b>{p.name}</b> <span className="text-xs text-muted">{p.email}</span>
                <span className="block text-xs">{p.method === 'khqr' ? 'KHQR' : 'K Bank'} · <b>{p.amount.toLocaleString()} {p.currency}</b> · {p.months} {t('mb.month')} · {fmtDate(p.created_at, locale)}{p.reference ? ` · ${p.reference}` : ''}</span></span>
              <span className="text-xs text-gold">{open === p.id ? '▲' : '▼'}</span>
            </button>
            {open === p.id && (
              <div className="mt-2 space-y-2">
                <a href={`/api/payments/${p.id}/slip`} target="_blank" rel="noreferrer"><img src={`/api/payments/${p.id}/slip`} alt="" className="max-h-80 rounded-lg border border-hairline" /></a>
                <p className="text-xs text-muted">{t('pa.check')}</p>
                <input className="input" maxLength={300} placeholder={t('pa.note')} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => review(p.id, true)}>✓ {t('pa.approve')}</button>
                  <button type="button" className="btn-ghost text-counterfeit" disabled={busy} onClick={() => review(p.id, false)}>✕ {t('pa.reject')}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  );
}

/** Prices, trial length, the two payment QR codes and the account names shown under them. */
export function MembershipSettingsCard() {
  const { t } = useI18n();
  const [m, setM] = useState<MembershipInfo | null>(null);
  const [f, setF] = useState({ priceUsd: '', priceThb: '', trialDays: '', khqrName: '', kbankName: '' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await api.get<MembershipInfo>('/api/membership');
    setM(r);
    setF({ priceUsd: String(r.prices.usd), priceThb: String(r.prices.thb), trialDays: String(r.trialDays), khqrName: r.methods.khqr.name ?? '', kbankName: r.methods.kbank.name ?? '' });
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const save = async () => {
    setMsg(null);
    try { await api.put('/api/admin/membership', { priceUsd: Number(f.priceUsd), priceThb: Number(f.priceThb), trialDays: Number(f.trialDays), khqrName: f.khqrName, kbankName: f.kbankName }); setMsg({ tone: 'ok', text: t('madm.saved') }); load(); }
    catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const upload = async (method: 'khqr' | 'kbank', file: File) => {
    setMsg(null);
    try { const fd = new FormData(); fd.append('file', file); await api.post(`/api/admin/membership/qr/${method}`, fd); setMsg({ tone: 'ok', text: t('madm.saved') }); load(); }
    catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  if (!m) return null;
  return (
    <div className="card space-y-3">
      <div className="font-semibold">⭐ {t('pa.settings')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="USD / KHQR"><input className="input" type="number" min={0.5} step={0.5} value={f.priceUsd} onChange={(e) => setF({ ...f, priceUsd: e.target.value })} /></Field>
        <Field label="THB / K Bank"><input className="input" type="number" min={10} step={10} value={f.priceThb} onChange={(e) => setF({ ...f, priceThb: e.target.value })} /></Field>
        <Field label={t('pa.trialDays')}><input className="input" type="number" min={0} max={60} value={f.trialDays} onChange={(e) => setF({ ...f, trialDays: e.target.value })} /></Field>
      </div>
      {(['khqr', 'kbank'] as const).map((k) => (
        <div key={k} className="flex items-center gap-3">
          <label className="flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-strong bg-white">
            {m.methods[k].qr ? <img src={`/api/membership/qr/${k}?v=${m.methods[k].v}`} alt="" className="h-full w-full object-contain" /> : <span className="text-xs text-muted">QR ＋</span>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) upload(k, x); }} />
          </label>
          <Field label={`${k === 'khqr' ? 'KHQR' : 'K Bank'} — ${t('pa.accountName')}`}>
            <input className="input" maxLength={80} value={k === 'khqr' ? f.khqrName : f.kbankName} onChange={(e) => setF(k === 'khqr' ? { ...f, khqrName: e.target.value } : { ...f, kbankName: e.target.value })} />
          </Field>
        </div>
      ))}
      <button type="button" className="btn-primary" onClick={save}>{t('save')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

interface Usage { budget: number; days: number; start: string; used: number; perDay: number; daysToEmpty: number | null; byDay: { day: string; tokens: number; calls: number }[]; byFeature: { feature: string; calls: number; input: number; output: number }[] }
const M = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** AI tokens used since the budget started, per day and per feature, and when the budget would run out. */
export function UsageCard({ owner }: { owner: boolean }) {
  const { t } = useI18n();
  const [u, setU] = useState<Usage | null>(null);
  const [edit, setEdit] = useState<{ budget: string; days: string; start: string } | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get<Usage>('/api/admin/usage').then(setU).catch((e) => setErr(errText(e))), []);
  useEffect(() => { load(); }, [load]);
  if (!u) return err ? <Notice tone="bad">{err}</Notice> : null;
  const pct = Math.min(100, (u.used / u.budget) * 100);
  const end = new Date(new Date(`${u.start}T00:00:00Z`).getTime() + u.days * 86_400_000);
  const daysLeftInPeriod = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
  const runsOut = u.daysToEmpty !== null && u.daysToEmpty < daysLeftInPeriod;
  const max = Math.max(1, ...u.byDay.map((d) => d.tokens));
  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">📊 {t('us.title')}</div>
        <span className="text-xs text-muted">{u.start} · {u.days} {t('us.days')}</span>
      </div>
      <div>
        <div className="flex items-baseline justify-between text-sm"><b>{M(u.used)}</b><span className="text-muted">/ {M(u.budget)}</span></div>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-surface-high">
          <div className={`h-full rounded-full ${pct >= 80 ? 'bg-counterfeit' : pct >= 50 ? 'bg-review' : 'bg-verified'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-muted">{t('us.perDay')}: {M(u.perDay)}{u.daysToEmpty !== null ? ` · ${t('us.lasts')} ~${u.daysToEmpty} ${t('us.days')}` : ''}</p>
      </div>
      {pct >= 80 && <Notice tone="bad">{t('us.warn80')}</Notice>}
      {pct < 80 && runsOut && <Notice tone="warn">{t('us.warnPace')}</Notice>}
      {u.byDay.length > 0 && (
        <div className="flex h-16 items-end gap-0.5" aria-label={t('us.title')}>
          {u.byDay.map((d) => <div key={d.day} title={`${d.day}: ${M(d.tokens)}`} className="flex-1 rounded-t bg-gold" style={{ height: `${Math.max(4, (d.tokens / max) * 100)}%` }} />)}
        </div>
      )}
      {u.byFeature.length > 0 ? (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1 font-normal">{t('us.feature')}</th><th className="text-right font-normal">{t('us.calls')}</th><th className="text-right font-normal">Tokens</th></tr></thead>
          <tbody>{u.byFeature.map((f) => <tr key={f.feature} className="border-t border-hairline"><td className="py-1">{t(`us.f.${f.feature}`)}</td><td className="text-right">{f.calls}</td><td className="text-right font-mono">{M(f.input + f.output)}</td></tr>)}</tbody>
        </table>
      ) : <p className="text-sm text-muted">{t('noData')}</p>}
      {owner && (edit ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('us.budget')}><input className="input" type="number" value={edit.budget} onChange={(e) => setEdit({ ...edit, budget: e.target.value })} /></Field>
          <Field label={t('us.days')}><input className="input" type="number" value={edit.days} onChange={(e) => setEdit({ ...edit, days: e.target.value })} /></Field>
          <Field label={t('us.start')}><input className="input" type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
          <button type="button" className="btn-primary col-span-3" onClick={async () => {
            try { await api.put('/api/admin/usage', { budget: Number(edit.budget), days: Number(edit.days), start: edit.start }); setEdit(null); load(); } catch (e) { setErr(errText(e)); }
          }}>{t('save')}</button>
        </div>
      ) : <button type="button" className="btn-ghost text-xs" onClick={() => setEdit({ budget: String(u.budget), days: String(u.days), start: u.start })}>{t('us.change')}</button>)}
    </div>
  );
}
