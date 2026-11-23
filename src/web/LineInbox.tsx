import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MeContext } from './App.tsx';
import { ADMIN_ROLES } from './studio.ts';
import Icon from './Icon.tsx';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Empty, Notice, errText } from './ui.tsx';

type Lang = 'th' | 'ms' | 'id' | 'en' | 'vi' | 'zh' | 'km' | 'other';
const LANGS: Lang[] = ['th', 'ms', 'id', 'en', 'vi', 'zh', 'km', 'other'];
interface Contact { id: string; display_name: string | null; lang: Lang | null; needs_staff: number; followed: number; last_message_at: string | null; last_text: string | null }
interface Msg { id: string; role: 'user' | 'assistant'; content: string; kind: 'text' | 'audio'; lang: Lang | null; translated: string | null; created_at: string }
interface Chan { configured: boolean; webhook: string }
interface Status { ai: boolean; audio: boolean; line: Chan; whatsapp: Chan }
const isWa = (id: string) => id.startsWith('wa:');
const chanLabel = (id: string) => (isWa(id) ? '🟢 WhatsApp' : '💬 LINE');

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function Chat({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [contact, setContact] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [out, setOut] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ contact: Contact; messages: Msg[] }>(`/api/line/contacts/${encodeURIComponent(id)}/messages`);
      setContact(r.contact); setMsgs(r.messages);
    } catch (e) { setErr(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); const i = setInterval(() => { if (!document.hidden) void load(); }, 15000); return () => clearInterval(i); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length]);

  const pickLang = async (lang: Lang) => {
    setErr('');
    try { await api.put(`/api/line/contacts/${encodeURIComponent(id)}/lang`, { lang }); setContact((c) => (c ? { ...c, lang } : c)); onChanged(); } catch (e) { setErr(errText(e)); }
  };
  const translate = async () => {
    setBusy(true); setErr('');
    try { setOut((await api.post<{ text_out: string }>(`/api/line/contacts/${encodeURIComponent(id)}/translate`, { text_km: text })).text_out); }
    catch (e) { setErr((e as { status?: number }).status === 409 ? t('li.pickLang') : errText(e)); } finally { setBusy(false); }
  };
  const send = async () => {
    if (out === null) return;
    setBusy(true); setErr('');
    try { await api.post(`/api/line/contacts/${encodeURIComponent(id)}/send`, { text_km: text, text_out: out }); setText(''); setOut(null); await load(); onChanged(); }
    catch (e) { setErr((e as { body?: { error?: string } }).body?.error === 'wa_window_closed' ? t('li.windowClosed') : errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onBack}>← {t('li.back')}</button>
        <div className="min-w-0 flex-1 truncate font-semibold">{contact?.display_name || '—'} <span className="text-[10px] font-normal text-muted">{chanLabel(id)}</span></div>
        <label className="flex items-center gap-1.5 text-xs text-muted">{t('li.lang')}
          <select className="input !w-auto !py-1 text-xs" value={contact?.lang ?? ''} onChange={(e) => { if (e.target.value) void pickLang(e.target.value as Lang); }}>
            <option value="" disabled>—</option>
            {LANGS.map((l) => <option key={l} value={l}>{t(`li.lang.${l}`)}</option>)}
          </select>
        </label>
      </div>
      {contact && !contact.followed && <Notice tone="warn">{t('li.notFollowed')}</Notice>}
      <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-2xl border border-hairline bg-surface-canvas p-3">
        {msgs.length === 0 && <Empty />}
        {msgs.map((m) => {
          const mine = m.role === 'assistant';
          const main = mine ? m.content : (m.translated ?? m.content);
          const second = mine ? m.translated : (m.translated ? m.content : null);
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-gold text-surface' : 'border border-hairline bg-surface-card'}`}>
                {m.kind === 'audio' && <div className="mb-0.5 text-[11px] opacity-70">🎤 {t('li.voice')}</div>}
                <div className="whitespace-pre-wrap break-words text-sm">{main}</div>
                {second && <div className="mt-1 whitespace-pre-wrap break-words border-t border-current/20 pt-1 text-xs opacity-70" lang={m.lang ?? undefined}>
                  {mine ? `${t('li.sentTo')}: ` : `${t('li.original')}${m.lang ? ` (${t(`li.lang.${m.lang}`)})` : ''}: `}{second}</div>}
                <div className="mt-0.5 text-right text-[10px] opacity-60">{clock(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="space-y-2">
        <textarea className="input min-h-[72px]" value={text} maxLength={2000} placeholder={t('li.placeholder')} disabled={busy || out !== null}
          onChange={(e) => setText(e.target.value)} />
        {out === null ? (
          <button type="button" className="btn-primary w-full" disabled={busy || !text.trim()} onClick={translate}>{busy ? '…' : `🌐 ${t('li.translate')}`}</button>
        ) : (
          <div className="space-y-2 rounded-2xl border border-gold/50 p-3">
            <div className="label">{t('li.preview')}</div>
            <textarea className="input min-h-[72px]" value={out} maxLength={4500} onChange={(e) => setOut(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setOut(null)}>{t('li.cancel')}</button>
              <button type="button" className="btn-primary" disabled={busy || !out.trim()} onClick={send}>{busy ? '…' : `➤ ${t('li.send')}`}</button>
            </div>
          </div>
        )}
        {err && <p className="text-xs text-counterfeit">{err}</p>}
      </div>
    </div>
  );
}

export default function LineInbox() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const loadList = useCallback(async () => {
    try { setContacts((await api.get<{ contacts: Contact[] }>('/api/line/contacts')).contacts); } catch (e) { setErr(errText(e)); }
  }, []);
  useEffect(() => {
    api.get<Status>('/api/line/status').then(setStatus).catch((e) => setErr(errText(e)));
    void loadList();
    const i = setInterval(() => { if (!document.hidden) void loadList(); }, 20000);
    return () => clearInterval(i);
  }, [loadList]);

  return (
    <div className="card space-y-3">
      <div className="font-semibold">💬 {t('li.title')}</div>
      <p className="text-xs text-muted">{t('li.note')}</p>
      {err && <p className="text-xs text-counterfeit">{err}</p>}
      {status && !status.line.configured && (
        <Notice tone="warn"><b>{t('li.setupTitle')}</b><p className="mt-1">{t('li.setupBody')}</p>
          <div className="mt-2 label">{t('li.webhook')}</div><code className="block break-all rounded bg-charcoal p-2 text-[11px] text-white">{status.line.webhook}</code></Notice>
      )}
      {status && !status.whatsapp.configured && (
        <Notice tone="warn"><b>{t('li.waSetupTitle')}</b><p className="mt-1">{t('li.waSetupBody')}</p>
          <div className="mt-2 label">{t('li.webhook')}</div><code className="block break-all rounded bg-charcoal p-2 text-[11px] text-white">{status.whatsapp.webhook}</code></Notice>
      )}
      {status && !status.ai && <Notice tone="warn">{t('li.noAi')}</Notice>}
      {status && status.ai && !status.audio && <p className="text-xs text-muted">{t('li.noAudio')}</p>}
      {open ? <Chat id={open} onBack={() => { setOpen(null); void loadList(); }} onChanged={loadList} /> : (
        contacts === null ? <p className="text-sm text-muted">…</p> : contacts.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-hairline">
            {contacts.map((k) => (
              <li key={k.id}>
                <button type="button" onClick={() => setOpen(k.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20 font-semibold uppercase text-gold" aria-hidden>{(k.display_name || '?').slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate font-semibold">{k.display_name || (isWa(k.id) ? k.id.slice(3) : '—')}</span><span className="text-[10px] text-muted">{chanLabel(k.id)}</span>
                      {k.lang && <span className="rounded-full bg-surface-high px-2 text-[10px]">{t(`li.lang.${k.lang}`)}</span>}
                      {k.needs_staff ? <span className="rounded-full bg-review-bg px-2 text-[10px] text-review">{t('li.waiting')}</span> : null}</span>
                    <span className="block truncate text-xs text-muted">{k.last_text}</span>
                  </span>
                  <span className="shrink-0 text-[10px] text-muted">{clock(k.last_message_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

/** Home shortcut for the owner / lead staff: how many people are waiting for a reply, one tap to the chat. */
export function ChatHome() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const admin = !!me && ADMIN_ROLES.includes(me.role);
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    if (!admin) return;
    api.get<{ contacts: Contact[] }>('/api/line/contacts').then((r) => setWaiting(r.contacts.filter((k) => k.needs_staff).length)).catch(() => setWaiting(0));
  }, [admin]);
  if (!admin) return null;
  return (
    <Link to="/admin?tab=line" className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3.5 hover:border-gold">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold" aria-hidden><Icon name="chat" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('li.homeTitle')}</span>
        <span className="block text-xs text-muted">{waiting ? `${waiting} ${t('li.waiting')}` : t('li.homeSub')}</span>
      </span>
      {waiting ? <span className="rounded-full bg-review-bg px-2 py-0.5 text-xs font-semibold text-review">{waiting}</span> : <span className="text-muted" aria-hidden>›</span>}
    </Link>
  );
}
