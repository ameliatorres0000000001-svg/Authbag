import React, { useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { ADMIN_ROLES } from './studio.ts';

interface LineState {
  configured: boolean; error: string | null;
  bot: { name: string | null; basicId: string | null; picture: string | null } | null;
  links: { url: string; qr: string } | null;
  webhook: { url: string; current: string | null; active: boolean };
  quota: { limit: number | null; used: number | null } | null;
  settings: { aiReply: boolean; notify: boolean; shopName: string; welcome: string; dailyLimit: number };
  staff: { line_user_id: string; display_name: string | null; user_name: string | null }[];
  counts: { total: number; waiting: number; following: number };
}
interface Contact { line_user_id: string; display_name: string | null; followed: number; needs_staff: number; ai_paused_until: string | null; messages: number; last_message_at: string; last_text: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; created_at: string }
const when = (iso: string) => iso.replace('T', ' ').slice(0, 16);

/** One customer's conversation, with "I'll answer myself" (pause AI) and "done". */
function ContactRow({ ct, onChange }: { ct: Contact; onChange: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const paused = !!ct.ai_paused_until && Date.parse(ct.ai_paused_until) > Date.now();
  const toggle = async () => {
    setOpen(!open);
    if (!open && !msgs) setMsgs((await api.get<{ messages: Msg[] }>(`/api/admin/line/contacts/${ct.line_user_id}/messages`)).messages);
  };
  const act = async (body: object) => { await api.put(`/api/admin/line/contacts/${ct.line_user_id}`, body); onChange(); };
  return (
    <li className="py-2">
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={toggle}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">{ct.display_name ?? 'LINE'}
            {ct.needs_staff ? <span className="rounded-full bg-counterfeit px-2 py-0.5 text-[10px] text-white">{t('ln.waiting')}</span> : null}
            {paused && <span className="rounded-full bg-surface-high px-2 py-0.5 text-[10px] text-muted">{t('ln.paused')}</span>}
            {!ct.followed && <span className="text-[10px] text-muted">· {t('ln.left')}</span>}
          </span>
          <span className="block truncate text-xs text-muted">{ct.last_text ?? ''}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted">{when(ct.last_message_at)}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl bg-surface-low p-2">
            {msgs?.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-xs ${m.role === 'user' ? 'bg-surface-card' : 'bg-charcoal text-white'}`}>{m.content}</div>
              </div>
            )) ?? <div className="text-xs text-muted">…</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://chat.line.biz/" target="_blank" rel="noreferrer" className="btn-primary !px-3 !py-1.5 text-xs">{t('ln.answer')} ↗</a>
            {paused ? <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act({ pauseHours: 0 })}>🤖 {t('ln.resume')}</button>
              : <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act({ pauseHours: 24 })}>✋ {t('ln.pause')}</button>}
            {!!ct.needs_staff && <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act({ done: true })}>✓ {t('ln.done')}</button>}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * The shop's LINE Official Account: connection status, AI auto-reply settings, linking staff LINE for notifications,
 * and the conversations (who is waiting for a person).
 */
export default function LineAdmin() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const admin = ADMIN_ROLES.includes(me.role);
  const [st, setSt] = useState<LineState | null>(null);
  const [f, setF] = useState<LineState['settings'] | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const s = await api.get<LineState>('/api/admin/line'); setSt(s); setF(s.settings);
      setContacts((await api.get<{ contacts: Contact[] }>('/api/admin/line/contacts')).contacts);
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!f) return; setMsg(null);
    try { await api.put('/api/admin/line/settings', f); setMsg({ tone: 'ok', text: t('madm.saved') }); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const hook = async () => {
    setMsg(null);
    try { const r = await api.post<{ ok: boolean }>('/api/admin/line/webhook', {}); setMsg(r.ok ? { tone: 'ok', text: t('ln.hookOk') } : { tone: 'bad', text: t('ln.hookBad') }); load(); }
    catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const getCode = async () => { try { setCode((await api.post<{ code: string }>('/api/admin/line/link-code', {})).code); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const unlink = async (id: string) => { try { await api.del(`/api/admin/line/staff/${id}`); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };

  if (!st) return msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : <div className="h-40 animate-pulse rounded-2xl bg-surface-low" />;
  const hookOk = st.webhook.current === st.webhook.url && st.webhook.active;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="font-semibold">💬 {t('ln.title')}</div>
        <p className="text-sm text-muted">{t('ln.help')}</p>
        {!st.configured ? (
          <div className="space-y-2">
            <Notice tone="warn">{t('ln.notConfigured')}</Notice>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {['ln.s1', 'ln.s2', 'ln.s3', 'ln.s4'].map((k) => <li key={k}>{t(k)}</li>)}
            </ol>
            <pre className="overflow-x-auto rounded-lg bg-charcoal p-3 text-[11px] text-white">npx wrangler secret put LINE_MESSAGING_SECRET{'\n'}npx wrangler secret put LINE_MESSAGING_TOKEN</pre>
          </div>
        ) : (
          <>
            {st.error && <Notice tone="bad">{st.error}</Notice>}
            {st.bot && (
              <div className="flex items-center gap-3">
                {st.links && <img src={st.links.qr} alt="" className="h-20 w-20 rounded-lg border border-hairline bg-white" />}
                <div className="min-w-0 text-sm">
                  <div className="font-semibold">{st.bot.name}</div>
                  <div className="text-xs text-muted">{st.bot.basicId}</div>
                  {st.links && <a href={st.links.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gold">{t('ln.friendLink')} ↗</a>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-low p-2"><div className="font-serif text-xl">{st.counts.total}</div><div className="text-[11px] text-muted">{t('ln.customers')}</div></div>
              <div className="rounded-xl bg-surface-low p-2"><div className={`font-serif text-xl ${st.counts.waiting ? 'text-counterfeit' : ''}`}>{st.counts.waiting}</div><div className="text-[11px] text-muted">{t('ln.waiting')}</div></div>
              <div className="rounded-xl bg-surface-low p-2"><div className="font-serif text-xl">{st.quota?.used ?? '–'}{st.quota?.limit ? `/${st.quota.limit}` : ''}</div><div className="text-[11px] text-muted">{t('ln.quota')}</div></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={hookOk ? 'text-verified' : 'text-counterfeit'}>{hookOk ? `✓ ${t('ln.hookOk')}` : `⚠️ ${t('ln.hookMissing')}`}</span>
              {admin && <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={hook}>{t('ln.setHook')}</button>}
            </div>
            <p className="text-[11px] text-muted">{t('ln.oaTip')}</p>
          </>
        )}
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {f && (
        <div className="card space-y-3">
          <div className="font-semibold">⚙️ {t('ln.settings')}</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.aiReply} disabled={!admin} onChange={(e) => setF({ ...f, aiReply: e.target.checked })} />{t('ln.aiReply')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.notify} disabled={!admin} onChange={(e) => setF({ ...f, notify: e.target.checked })} />{t('ln.notify')}</label>
          <Field label={t('ln.shopName')}><input className="input" maxLength={80} disabled={!admin} value={f.shopName} onChange={(e) => setF({ ...f, shopName: e.target.value })} /></Field>
          <Field label={t('ln.welcome')}><textarea className="input min-h-[72px]" maxLength={1000} disabled={!admin} placeholder={t('ln.welcomePh')} value={f.welcome} onChange={(e) => setF({ ...f, welcome: e.target.value })} /></Field>
          <Field label={t('ln.limit')}><input className="input" type="number" min={1} max={200} disabled={!admin} value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) })} /></Field>
          <p className="text-xs text-muted">{t('ln.knowledge')}</p>
          {admin && <button type="button" className="btn-primary" onClick={save}>{t('save')}</button>}
        </div>
      )}

      <div className="card space-y-2">
        <div className="font-semibold">🔔 {t('ln.linkTitle')}</div>
        <p className="text-sm text-muted">{t('ln.linkHelp')}</p>
        {code ? <div className="rounded-xl bg-gold-light p-3 text-center"><div className="font-mono text-2xl tracking-widest">{code}</div><div className="text-xs text-muted">{t('ln.linkSend')}</div></div>
          : <button type="button" className="btn-ghost text-sm" disabled={!st.configured} onClick={getCode}>{t('ln.getCode')}</button>}
        {st.staff.length > 0 && (
          <ul className="divide-y divide-hairline text-sm">
            {st.staff.map((s) => (
              <li key={s.line_user_id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1">✓ {s.display_name ?? 'LINE'} <span className="text-xs text-muted">· {s.user_name}</span></span>
                <button type="button" className="text-xs text-muted underline" onClick={() => unlink(s.line_user_id)}>{t('ln.unlink')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card space-y-1">
        <div className="font-semibold">📥 {t('ln.inbox')}</div>
        {contacts && contacts.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        <ul className="divide-y divide-hairline">{contacts?.map((ct) => <ContactRow key={ct.line_user_id} ct={ct} onChange={load} />)}</ul>
      </div>
    </div>
  );
}
