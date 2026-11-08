import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { ADMIN_ROLES, STAFF_ROLES } from './studio.ts';

type Country = 'TH' | 'MY' | 'ID';
type Status = 'new' | 'saved' | 'contacted' | 'customer' | 'not_fit';
export interface Lead { id: string; country: Country; handle: string; name: string | null; url: string; kind: 'live_seller' | 'reseller' | 'shop'; sells: string | null; why: string | null; source_url?: string | null; status: Status; note?: string | null; found_by?: string; created_at: string }
interface Summary { counts: { country: Country; status: Status; n: number }[]; runs: { country: Country; at: string; added: number | null; error: string | null; running: number }[]; auto: boolean; webSearch: boolean; everyDays: number }
const CC: Country[] = ['TH', 'MY', 'ID'];
const FLAG: Record<Country, string> = { TH: '🇹🇭', MY: '🇲🇾', ID: '🇮🇩' };
const STATUSES: Status[] = ['new', 'saved', 'contacted', 'customer', 'not_fit'];
const TONE: Record<Status, string> = { new: 'bg-review-bg text-review', saved: 'bg-gold-light text-charcoal', contacted: 'bg-surface-high text-charcoal', customer: 'bg-verified-bg text-verified', not_fit: 'bg-surface-high text-muted' };
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const count = (s: Summary | null, cc: Country, st?: Status) => (s?.counts ?? []).filter((x) => x.country === cc && (!st || x.status === st)).reduce((a, x) => a + x.n, 0);

function LeadRow({ l, compact, onSaved }: { l: Lead; compact?: boolean; onSaved?: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>(l.status);
  const [note, setNote] = useState(l.note ?? '');
  const save = async (st: Status, n: string) => { setStatus(st); try { await api.put(`/api/admin/leads/${l.id}`, { status: st, note: n || null }); onSaved?.(); } catch { setStatus(l.status); } };
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none" aria-hidden>{FLAG[l.country]}</span>
        <div className="min-w-0 flex-1">
          <a href={l.url} target="_blank" rel="noreferrer" className="block truncate font-semibold text-charcoal underline-offset-2 hover:underline">@{l.handle} <span className="text-xs text-gold">↗</span></a>
          {l.name && <div className="truncate text-xs text-muted">{l.name}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-charcoal px-2 py-0.5 text-[10px] text-white">{l.kind === 'live_seller' ? '🔴 LIVE' : t(`ld.kind.${l.kind}`)}</span>
            {!compact && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[status]}`}>{t(`ld.st.${status}`)}</span>}
          </div>
          {l.sells && <p className="mt-1 text-sm">{l.sells}</p>}
          {l.why && <p className="mt-0.5 text-xs text-muted">{l.why}</p>}
        </div>
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
          <select className="input !w-auto !py-1.5 text-xs" value={status} onChange={(e) => save(e.target.value as Status, note)} aria-label={t('ld.status')}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`ld.st.${s}`)}</option>)}
          </select>
          <input className="input min-w-0 flex-1 !py-1.5 text-xs" maxLength={500} placeholder={t('ld.note')} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (l.note ?? '') && save(status, note)} />
          {l.source_url && <a href={l.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-muted underline">{t('ld.source')}</a>}
          <span className="text-[11px] text-muted">{l.found_by === 'ai' ? '🤖 AI' : '✍️'} · {day(l.created_at)}</span>
        </div>
      )}
    </li>
  );
}

/** Home dashboard (staff): customers found per country and the newest ones, next to the market data. */
export function LeadsHome() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const staff = !!me && STAFF_ROLES.includes(me.role);
  const [d, setD] = useState<(Summary & { latest: Lead[] }) | null>(null);
  useEffect(() => { if (staff) api.get<Summary & { latest: Lead[] }>('/api/admin/leads/summary').then(setD).catch(() => {}); }, [staff]);
  if (!staff || !d) return null;
  return (
    <section aria-labelledby="leads-h">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="leads-h" className="text-lg leading-tight">🎯 {t('ld.homeTitle')}</h2>
        <Link to="/admin?tab=leads" className="text-xs font-semibold text-gold">{t('market.seeAll')} →</Link>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CC.map((cc) => (
          <Link key={cc} to={`/admin?tab=leads&country=${cc}`} className="rounded-2xl border border-hairline bg-surface-card p-3">
            <div className="text-xs text-muted">{FLAG[cc]} {t(`market.country.${cc}`)}</div>
            <div className="font-serif text-2xl">{count(d, cc)}</div>
            <div className="text-[11px] text-muted">{count(d, cc, 'new')} {t('ld.st.new')} · {count(d, cc, 'customer')} {t('ld.st.customer')}</div>
          </Link>
        ))}
      </div>
      <div className="mt-2 rounded-2xl border border-hairline bg-surface-card px-4">
        {d.latest.length ? <ul className="divide-y divide-hairline">{d.latest.map((l) => <LeadRow key={l.id} l={l} compact />)}</ul>
          : <p className="py-3 text-sm text-muted">{t('noData')}{d.auto && d.webSearch ? ` — ${t('ld.autoSoon')}` : ''}</p>}
      </div>
    </section>
  );
}

/** Admin tab: search, filter and work through the customers found on TikTok. */
export default function LeadsAdmin({ initialCountry }: { initialCountry?: string | null }) {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const admin = ADMIN_ROLES.includes(me.role);
  const [country, setCountry] = useState<Country | ''>(CC.includes(initialCountry as Country) ? initialCountry as Country : '');
  const [status, setStatus] = useState<Status | ''>('');
  const [data, setData] = useState<(Summary & { leads: Lead[] }) | null>(null);
  const [busy, setBusy] = useState<Country | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [add, setAdd] = useState({ link: '', country: 'TH' as Country, kind: 'live_seller' as Lead['kind'], sells: '' });
  const load = useCallback(() => {
    const q = new URLSearchParams(); if (country) q.set('country', country); if (status) q.set('status', status);
    return api.get<Summary & { leads: Lead[] }>(`/api/admin/leads?${q}`).then(setData).catch((e) => setMsg({ tone: 'bad', text: errText(e) }));
  }, [country, status]);
  useEffect(() => { load(); }, [load]);

  const search = async (cc: Country) => {
    setBusy(cc); setMsg(null);
    try { const r = await api.post<{ found: number; added: number }>('/api/admin/leads/search', { country: cc }); setMsg({ tone: 'ok', text: t('ld.searched').replace('{found}', String(r.found)).replace('{added}', String(r.added)) }); await load(); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'ai_web_not_configured' ? t('ld.needClaude') : e instanceof ApiError && e.body?.error === 'search_running' ? t('ld.running') : errText(e) }); }
    finally { setBusy(null); }
  };
  const toggleAuto = async () => { if (!data) return; try { await api.put('/api/admin/leads-settings', { auto: !data.auto }); await load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const addOne = async () => {
    setMsg(null);
    try { await api.post('/api/admin/leads', { link: add.link, country: add.country, kind: add.kind, sells: add.sells || null }); setAdd({ ...add, link: '', sells: '' }); setMsg({ tone: 'ok', text: t('madm.saved') }); await load(); }
    catch (e) { const code = e instanceof ApiError ? e.body?.error : ''; setMsg({ tone: 'bad', text: code === 'not_a_tiktok_account' ? t('ld.badLink') : code === 'already_added' ? t('ld.already') : errText(e) }); }
  };

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div>
          <div className="font-semibold">🎯 {t('ld.title')}</div>
          <p className="mt-1 text-sm text-muted">{t('ld.help')}</p>
        </div>
        {data && !data.webSearch && <Notice tone="warn">{t('ld.needClaude')}</Notice>}
        <div className="grid gap-2 sm:grid-cols-3">
          {CC.map((cc) => {
            const run = data?.runs.find((r) => r.country === cc);
            return (
              <div key={cc} className="rounded-xl border border-hairline p-3">
                <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">{FLAG[cc]} {t(`market.country.${cc}`)}</span><span className="font-serif text-xl">{count(data, cc)}</span></div>
                <div className="text-[11px] text-muted">{run ? `${t('ld.lastRun')}: ${day(run.at)}${run.running ? ' · …' : run.error ? ` · ⚠️ ${t('ld.failed')}` : ` · +${run.added ?? 0}`}` : t('ld.never')}</div>
                {admin && <button type="button" className="btn-ghost mt-2 w-full !py-1.5 text-xs" disabled={!!busy || !data?.webSearch} onClick={() => search(cc)}>{busy === cc ? t('ld.searching') : `🔎 ${t('ld.searchNow')}`}</button>}
              </div>
            );
          })}
        </div>
        {busy && <p className="text-xs text-muted">{t('ld.wait')}</p>}
        {data && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={data.auto} disabled={!admin} onChange={toggleAuto} />
            {t('ld.auto').replace('{days}', String(data.everyDays))}
          </label>
        )}
        <p className="text-[11px] text-muted">{t('ld.rules')}</p>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="card space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(['', ...CC] as const).map((cc) => <button key={cc || 'all'} type="button" onClick={() => setCountry(cc)} className={`rounded-full border px-3 py-1 text-xs ${country === cc ? 'border-charcoal bg-charcoal text-white' : 'border-hairline'}`}>{cc ? `${FLAG[cc]} ${t(`market.country.${cc}`)}` : t('sk.a.all')}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['', ...STATUSES] as const).map((s) => <button key={s || 'all'} type="button" onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-xs ${status === s ? 'border-charcoal bg-charcoal text-white' : 'border-hairline'}`}>{s ? t(`ld.st.${s}`) : t('sk.a.all')}</button>)}
        </div>
        {data && data.leads.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        <ul className="divide-y divide-hairline">{data?.leads.map((l) => <LeadRow key={l.id} l={l} />)}</ul>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">＋ {t('ld.addTitle')}</div>
        <input className="input" maxLength={500} placeholder={t('ld.addLink')} value={add.link} onChange={(e) => setAdd({ ...add, link: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('ld.country')}><select className="input" value={add.country} onChange={(e) => setAdd({ ...add, country: e.target.value as Country })}>{CC.map((cc) => <option key={cc} value={cc}>{FLAG[cc]} {t(`market.country.${cc}`)}</option>)}</select></Field>
          <Field label={t('ld.kind')}><select className="input" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as Lead['kind'] })}>{(['live_seller', 'reseller', 'shop'] as const).map((k) => <option key={k} value={k}>{t(`ld.kind.${k}`)}</option>)}</select></Field>
        </div>
        <input className="input" maxLength={300} placeholder={t('ld.sells')} value={add.sells} onChange={(e) => setAdd({ ...add, sells: e.target.value })} />
        <button type="button" className="btn-primary" disabled={add.link.trim().length < 2} onClick={addOne}>{t('save')}</button>
      </div>
    </div>
  );
}
