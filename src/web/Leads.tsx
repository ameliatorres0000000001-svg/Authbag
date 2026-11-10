import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { ADMIN_ROLES, STAFF_ROLES } from './studio.ts';
import Icon from './Icon.tsx';

type Country = 'TH' | 'MY' | 'ID';
type Status = 'new' | 'saved' | 'contacted' | 'customer' | 'not_fit';
export interface Lead { id: string; country: Country; handle: string; name: string | null; url: string; kind: 'live_seller' | 'reseller' | 'shop'; sells: string | null; why: string | null; fit?: number | null; topic?: string | null; source_url?: string | null; status: Status; note?: string | null; found_by?: string; created_at: string }
interface Summary { counts: { country: Country; status: Status; n: number }[]; runs: { country: Country; at: string; added: number | null; error: string | null; running: number }[]; auto: boolean; webSearch: boolean; gateway?: string | null; everyDays: number; offer: string; shopName: string }
const CC: Country[] = ['TH', 'MY', 'ID'];
const FLAG: Record<Country, string> = { TH: '🇹🇭', MY: '🇲🇾', ID: '🇮🇩' };
const STATUSES: Status[] = ['new', 'saved', 'contacted', 'customer', 'not_fit'];
const TONE: Record<Status, string> = { new: 'bg-review-bg text-review', saved: 'bg-gold-light text-ink', contacted: 'bg-surface-high text-ink', customer: 'bg-verified-bg text-verified', not_fit: 'bg-surface-high text-muted' };
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
const count = (s: Summary | null, cc: Country, st?: Status) => (s?.counts ?? []).filter((x) => x.country === cc && (!st || x.status === st)).reduce((a, x) => a + x.n, 0);

const Fit = ({ n }: { n?: number | null }) => (n ? <span className="text-[11px] text-gold" title={`fit ${n}/3`}>{'★'.repeat(n)}<span className="text-hairline">{'★'.repeat(3 - n)}</span></span> : null);

function LeadRow({ l, compact, onSaved }: { l: Lead; compact?: boolean; onSaved?: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>(l.status);
  const [note, setNote] = useState(l.note ?? '');
  const [dm, setDm] = useState<{ message: string; meaning: string } | null>(null);
  const [dmBusy, setDmBusy] = useState(false);
  const [dmErr, setDmErr] = useState('');
  const [copied, setCopied] = useState(false);
  const save = async (st: Status, n: string) => { setStatus(st); try { await api.put(`/api/admin/leads/${l.id}`, { status: st, note: n || null }); onSaved?.(); } catch { setStatus(l.status); } };
  const write = async () => {
    setDmBusy(true); setDmErr('');
    try { setDm(await api.post(`/api/admin/leads/${l.id}/message`, {})); } catch (e) { setDmErr(errText(e)); } finally { setDmBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(dm!.message); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* user can select the text */ } };
  return (
    <li className={compact ? 'py-2.5' : 'rounded-2xl border border-hairline bg-surface-card p-3.5'}>
      <div className="flex items-start gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/20 font-semibold uppercase text-gold" aria-hidden>
          {l.handle.slice(0, 1)}<span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">{FLAG[l.country]}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a href={l.url} target="_blank" rel="noreferrer" className="truncate font-semibold text-ink hover:underline">@{l.handle}</a>
            <Fit n={l.fit} />
          </div>
          {l.name && <div className="truncate text-xs text-muted">{l.name}</div>}
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-charcoal px-2 py-0.5 text-[10px] text-white">{l.kind === 'live_seller' ? '🔴 LIVE' : t(`ld.kind.${l.kind}`)}</span>
            {!compact && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[status]}`}>{t(`ld.st.${status}`)}</span>}
            {l.topic && <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-muted">🔎 {l.topic}</span>}
          </div>
          {l.sells && <p className="mt-1.5 text-sm">{l.sells}</p>}
          {l.why && <p className="mt-0.5 text-xs text-muted">{l.why}</p>}
        </div>
      </div>
      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-xs">
            <a href={l.url} target="_blank" rel="noreferrer" className="btn-ghost flex items-center justify-center gap-1 !px-2 !py-2"><Icon name="external" size={15} />TikTok</a>
            <button type="button" className="btn-ghost flex items-center justify-center gap-1 !px-2 !py-2" disabled={dmBusy} onClick={write}><Icon name="edit" size={15} />{dmBusy ? '…' : t('ld.writeMsg')}</button>
            <select className="input !py-2 text-xs" value={status} onChange={(e) => save(e.target.value as Status, note)} aria-label={t('ld.status')}>
              {STATUSES.map((st) => <option key={st} value={st}>{t(`ld.st.${st}`)}</option>)}
            </select>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">{t('ld.note')}{note ? ' ✓' : ''} · {l.found_by === 'ai' ? '🤖 AI' : '✍️'} · {day(l.created_at)}</summary>
            <input className="input mt-1.5 !py-1.5 text-xs" maxLength={500} placeholder={t('ld.note')} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (l.note ?? '') && save(status, note)} />
            {l.source_url && <a href={l.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-muted underline">{t('ld.source')}</a>}
          </details>
        </>
      )}
      {dmErr && <div className="mt-2"><Notice tone="bad">{dmErr}</Notice></div>}
      {dm && (
        <div className="mt-2 space-y-2 rounded-xl bg-surface-low p-3 text-sm">
          <div className="whitespace-pre-wrap rounded-lg bg-surface-card p-2">{dm.message}</div>
          {dm.meaning && <div className="whitespace-pre-wrap text-xs text-muted">{t('ld.meaning')}: {dm.meaning}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary flex items-center gap-1 !px-3 !py-1.5 text-xs" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={14} />{copied ? t('ld.copied') : t('ld.copy')}</button>
            {status !== 'contacted' && status !== 'customer' && <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => save('contacted', note)}>✓ {t('ld.markSent')}</button>}
          </div>
          <p className="text-[11px] text-muted">{t('ld.sendYourself')}</p>
        </div>
      )}
    </li>
  );
}

/** Home (staff): customers found on TikTok — or, before the first one, what this is and one tap to start. */
export function LeadsHome() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const staff = !!me && STAFF_ROLES.includes(me.role);
  const [d, setD] = useState<(Summary & { latest: Lead[] }) | null>(null);
  useEffect(() => { if (staff) api.get<Summary & { latest: Lead[] }>('/api/admin/leads/summary').then(setD).catch(() => {}); }, [staff]);
  if (!staff || !d) return null;
  const total = CC.reduce((n, cc) => n + count(d, cc), 0);
  if (!total) {
    return (
      <Link to="/admin?tab=leads" className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3.5 hover:border-gold">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold" aria-hidden><Icon name="users" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t('ld2.homeTitle')}</span>
          <span className="block text-xs text-muted">{t('ld2.homeEmpty')}</span>
        </span>
        <span className="text-muted" aria-hidden>›</span>
      </Link>
    );
  }
  return (
    <section aria-labelledby="leads-h">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 id="leads-h" className="text-base leading-tight">🎯 {t('ld2.homeTitle')}</h2>
        <Link to="/admin?tab=leads" className="text-xs font-semibold text-gold">{t('market.seeAll')} →</Link>
      </div>
      <div className="rounded-2xl border border-hairline bg-surface-card px-3">
        <div className="flex gap-3 border-b border-hairline py-2 text-xs text-muted">
          {CC.map((cc) => <Link key={cc} to={`/admin?tab=leads&country=${cc}`}>{FLAG[cc]} <b className="text-ink">{count(d, cc)}</b></Link>)}
          <span className="ml-auto">{CC.reduce((n, cc) => n + count(d, cc, 'new'), 0)} {t('ld.st.new')}</span>
        </div>
        <ul className="divide-y divide-hairline">{d.latest.slice(0, 3).map((l) => <LeadRow key={l.id} l={l} compact />)}</ul>
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
  const [topic, setTopic] = useState('');
  const [topicCc, setTopicCc] = useState<Country>('TH');
  const [offer, setOffer] = useState<{ offer: string; shopName: string } | null>(null);
  const load = useCallback(() => {
    const q = new URLSearchParams(); if (country) q.set('country', country); if (status) q.set('status', status);
    return api.get<Summary & { leads: Lead[] }>(`/api/admin/leads?${q}`).then((d) => { setData(d); setOffer((o) => o ?? { offer: d.offer, shopName: d.shopName }); }).catch((e) => setMsg({ tone: 'bad', text: errText(e) }));
  }, [country, status]);
  useEffect(() => { load(); }, [load]);

  const search = async (cc: Country, q?: string) => {
    setBusy(cc); setMsg(null);
    try { const r = await api.post<{ found: number; added: number }>('/api/admin/leads/search', { country: cc, topic: q?.trim() || null }); setMsg({ tone: r.found ? 'ok' : 'bad', text: r.found ? t('ld.searched').replace('{found}', String(r.found)).replace('{added}', String(r.added)) : t('ld2.noneFound') }); await load(); }
    catch (e) {
      const code = e instanceof ApiError ? e.body?.error : '';
      setMsg({ tone: 'bad', text: code === 'ai_web_not_configured' ? t('ld.needClaude') : code === 'search_running' ? t('ld.running')
        : code === 'no_web_results' ? t('ld2.noWeb').replace('{host}', data?.gateway ?? 'gateway') : errText(e) });
    }
    finally { setBusy(null); }
  };
  const saveOffer = async () => { if (!offer) return; try { await api.put('/api/admin/leads-settings', offer); setMsg({ tone: 'ok', text: t('madm.saved') }); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const toggleAuto = async () => { if (!data) return; try { await api.put('/api/admin/leads-settings', { auto: !data.auto }); await load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const addOne = async () => {
    setMsg(null);
    try { await api.post('/api/admin/leads', { link: add.link, country: add.country, kind: add.kind, sells: add.sells || null }); setAdd({ ...add, link: '', sells: '' }); setMsg({ tone: 'ok', text: t('madm.saved') }); await load(); }
    catch (e) { const code = e instanceof ApiError ? e.body?.error : ''; setMsg({ tone: 'bad', text: code === 'not_a_tiktok_account' ? t('ld.badLink') : code === 'already_added' ? t('ld.already') : errText(e) }); }
  };

  const lastRun = data?.runs.slice().sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
  const total = CC.reduce((n, cc) => n + count(data, cc), 0);
  const failText = (code: string | null | undefined) => (code === 'no_web_results'
    ? t('ld2.noWeb').replace('{host}', data?.gateway ?? 'gateway') : t('ld.failed'));

  return (
    <div className="space-y-4">
      {/* what this is, in plain words */}
      <section className="space-y-4 rounded-3xl border border-gold/40 bg-surface-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold text-charcoal" aria-hidden><Icon name="users" size={24} /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{t('ld2.title')}</h2>
            <p className="text-xs leading-relaxed text-muted">{t('ld2.what')}</p>
          </div>
        </div>

        {/* one search, like a search app */}
        {admin && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-[13px]">
              {CC.map((cc) => <button key={cc} type="button" onClick={() => setTopicCc(cc)} aria-pressed={topicCc === cc} className={`rounded-full px-2 py-1.5 ${topicCc === cc ? 'bg-gold text-charcoal' : ''}`}>{FLAG[cc]} {t(`market.country.${cc}`)}</button>)}
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-surface-low px-3">
              <Icon name="search" className="text-muted" />
              <input className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted" maxLength={120} placeholder={t('ld2.searchPh')} value={topic}
                onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy && data?.webSearch) search(topicCc, topic); }} />
            </div>
            <button type="button" className="btn-primary flex w-full items-center justify-center gap-2 !py-3" disabled={!!busy || !data?.webSearch} onClick={() => search(topicCc, topic)}>
              <Icon name="search" size={18} />{busy ? t('ld.searching') : t('ld2.searchBtn').replace('{country}', t(`market.country.${topicCc}`))}
            </button>
            {busy && <p className="text-center text-xs text-muted">{t('ld.wait')}</p>}
          </div>
        )}
        {data && !data.webSearch && <Notice tone="warn">{t('ld.needClaude')}</Notice>}
        {lastRun && !busy && (
          <p className="text-[11px] text-muted">{t('ld.lastRun')}: {FLAG[lastRun.country]} {day(lastRun.at)} · {lastRun.running ? '…' : lastRun.error ? `⚠️ ${t('ld.failed')}` : `+${lastRun.added ?? 0}`}</p>
        )}
      </section>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {lastRun?.error === 'no_web_results' && !msg && <Notice tone="warn">{failText(lastRun.error)}</Notice>}

      {/* results */}
      <section className="space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['', ...CC] as const).map((cc) => <button key={cc || 'all'} type="button" onClick={() => setCountry(cc)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${country === cc ? 'border-gold bg-gold text-charcoal' : 'border-hairline'}`}>{cc ? `${FLAG[cc]} ${count(data, cc)}` : `${t('sk.a.all')} ${total}`}</button>)}
          <span className="mx-1 h-4 w-px shrink-0 bg-hairline" />
          {(['', ...STATUSES] as const).map((st) => <button key={st || 'all'} type="button" onClick={() => setStatus(st)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${status === st ? 'border-gold bg-gold text-charcoal' : 'border-hairline'}`}>{st ? t(`ld.st.${st}`) : t('sk.a.all')}</button>)}
        </div>
        {data && data.leads.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-low text-muted"><Icon name="users" size={24} /></span>
            <div className="text-sm font-semibold">{t('ld2.emptyTitle')}</div>
            <p className="text-xs text-muted">{t('ld2.emptyBody')}</p>
          </div>
        )}
        <ul className="space-y-2">{data?.leads.map((l) => <LeadRow key={l.id} l={l} />)}</ul>
      </section>

      {/* settings, out of the way */}
      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">⚙️ {t('ld2.settings')}</summary>
        <div className="mt-3 space-y-4">
          {data && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.auto} disabled={!admin} onChange={toggleAuto} />
              {t('ld.auto').replace('{days}', String(data.everyDays))}
            </label>
          )}
          {offer && (
            <div className="space-y-2">
              <div className="text-sm font-semibold">🏷️ {t('ld.offerTitle')}</div>
              <p className="text-xs text-muted">{t('ld.offerHelp')}</p>
              <Field label={t('ld.shopName')}><input className="input" maxLength={80} disabled={!admin} value={offer.shopName} onChange={(e) => setOffer({ ...offer, shopName: e.target.value })} /></Field>
              <textarea className="input min-h-[96px]" maxLength={1000} disabled={!admin} placeholder={t('ld.offerPh')} value={offer.offer} onChange={(e) => setOffer({ ...offer, offer: e.target.value })} />
              {admin && <button type="button" className="btn-primary" onClick={saveOffer}>{t('save')}</button>}
            </div>
          )}
          <div className="space-y-2">
            <div className="text-sm font-semibold">＋ {t('ld.addTitle')}</div>
            <input className="input" maxLength={500} placeholder={t('ld.addLink')} value={add.link} onChange={(e) => setAdd({ ...add, link: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('ld.country')}><select className="input" value={add.country} onChange={(e) => setAdd({ ...add, country: e.target.value as Country })}>{CC.map((cc) => <option key={cc} value={cc}>{FLAG[cc]} {t(`market.country.${cc}`)}</option>)}</select></Field>
              <Field label={t('ld.kind')}><select className="input" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as Lead['kind'] })}>{(['live_seller', 'reseller', 'shop'] as const).map((k) => <option key={k} value={k}>{t(`ld.kind.${k}`)}</option>)}</select></Field>
            </div>
            <input className="input" maxLength={300} placeholder={t('ld.sells')} value={add.sells} onChange={(e) => setAdd({ ...add, sells: e.target.value })} />
            <button type="button" className="btn-primary" disabled={add.link.trim().length < 2} onClick={addOne}>{t('save')}</button>
          </div>
          <p className="text-[11px] text-muted">{t('ld.rules')}</p>
        </div>
      </details>
    </div>
  );
}
