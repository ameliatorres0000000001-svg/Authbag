import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Notice, errText } from './ui.tsx';
import { MembershipNeeded, isMembershipError } from './pages/Membership.tsx';
import { speakText, stopAudio } from './voice.ts';
import Icon from './Icon.tsx';

interface Turn { role: 'user' | 'assistant'; content: string; photo?: string }

/** Light formatting for AI replies: **bold** only; everything else stays plain text (no HTML from the model). */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

const SPEECH_LANG: Record<string, string> = { km: 'km-KH', th: 'th-TH', vi: 'vi-VN', id: 'id-ID', en: 'en-US' };
const Recognition = (): any => (typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined);

/** Read one answer aloud: the app's neural voice when available, otherwise the phone's own voice. */
async function readAloud(text: string, locale: string): Promise<void> {
  stopAudio();
  try {
    const res = await fetch('/api/skills/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text: text.slice(0, 1200) }) });
    if (res.ok) {
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url); a.onended = () => URL.revokeObjectURL(url);
      await a.play(); return;
    }
  } catch { /* fall back below */ }
  await speakText(text, locale);
}

/**
 * The AI workspace of a skill: ask by typing, by voice (🎤) or with a photo (📷) about the job in hand;
 * answers can be read aloud (🔊). `context` (leather, colour, recipe, problem…) goes with every question so the
 * AI knows the job. The conversation stays on this screen only.
 */
export default function AiWorkspace({ skill, context, chips = [], title, sub, full = false, disabled = false, inSheet = false }: {
  skill: 'paint' | 'repair' | 'chat'; context?: unknown; chips?: string[]; title?: string; sub?: string; full?: boolean; disabled?: boolean; inSheet?: boolean;
}) {
  const { t, locale } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [member, setMember] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const rec = useRef<any>(null);
  const end = useRef<HTMLDivElement>(null);
  const canListen = !!Recognition();

  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [turns, busy]);
  useEffect(() => () => { try { rec.current?.abort(); } catch { /* ignore */ } stopAudio(); }, []);

  const send = async (q: string) => {
    const content = q.trim();
    if ((!content && !photo) || busy || disabled) return;
    const asked = content || t('ws.lookPhoto');
    const next: Turn[] = [...turns, { role: 'user', content: asked, photo: photo?.url }];
    setTurns(next); setText(''); setErr(''); setMember(false); setBusy(true);
    const sentPhoto = photo; setPhoto(null);
    try {
      const fd = new FormData();
      fd.append('skill', skill);
      fd.append('messages', JSON.stringify(next.map(({ role, content: c }) => ({ role, content: c }))));
      fd.append('context', JSON.stringify(context ?? null));
      if (sentPhoto) fd.append('file', sentPhoto.file);
      const r = await api.post<{ reply: string }>('/api/skills/ask', fd);
      setTurns([...next, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      const code = e instanceof ApiError ? e.body?.error : '';
      if (isMembershipError(e)) setMember(true);
      else setErr(code === 'chat_limit' || code === 'too_many' ? t('skill.tooMany') : code === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
      setTurns(turns); setText(content); if (sentPhoto) setPhoto(sentPhoto);
    } finally { setBusy(false); }
  };

  const listen = () => {
    const R = Recognition();
    if (!R) return;
    if (listening) { try { rec.current?.stop(); } catch { /* ignore */ } return; }
    stopAudio();
    const r = new R();
    r.lang = SPEECH_LANG[locale] ?? 'km-KH'; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    let finalText = '';
    r.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const s = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += s; else interim += s;
      }
      setText((finalText + interim).trim());
    };
    r.onerror = (ev: any) => { setListening(false); if (ev?.error === 'not-allowed') setErr(t('ws.micBlocked')); };
    r.onend = () => { setListening(false); if (finalText.trim()) send(finalText); };
    rec.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const speak = async (i: number, s: string) => {
    if (speaking === i) { stopAudio(); setSpeaking(null); return; }
    setSpeaking(i);
    try { await readAloud(s, locale); } finally { setSpeaking((x) => (x === i ? null : x)); }
  };
  const copy = async (i: number, s: string) => { try { await navigator.clipboard.writeText(s); setCopied(i); setTimeout(() => setCopied((x) => (x === i ? null : x)), 1500); } catch { /* text can be selected */ } };
  const typed = text.trim().length > 0 || !!photo;

  const avatar = (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-gold text-charcoal ${full ? 'h-8 w-8' : 'h-7 w-7'}`} aria-hidden><Icon name="sparkles" size={full ? 17 : 15} /></span>
  );

  return (
    <div className={full ? 'flex flex-1 flex-col' : 'space-y-3 rounded-2xl border border-hairline bg-surface-card p-3'}>
      {(title || sub) && (
        <div className="flex items-center gap-2.5">
          {avatar}
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold">{title}</div>}
            {sub && <div className="text-[11px] leading-snug text-muted">{sub}</div>}
          </div>
        </div>
      )}

      <div className={full ? 'flex-1 space-y-4 py-3' : 'space-y-3'} aria-live="polite">
        {turns.length === 0 && full && (
          <div className="flex flex-col items-center px-2 pb-2 pt-6 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-charcoal shadow-lg" aria-hidden><Icon name="sparkles" size={28} /></span>
            <div className="text-xl font-semibold">{t('ws.hello')}</div>
            <p className="mt-1 max-w-sm text-sm text-muted">{t('ws.helloSub')}</p>
          </div>
        )}
        {turns.length === 0 && chips.length > 0 && (
          <div className={full ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-1.5'}>
            {chips.map((c) => (
              <button key={c} type="button" disabled={busy || disabled} onClick={() => send(c)}
                className={full ? 'flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface-card px-3.5 py-3 text-left text-sm hover:border-gold disabled:opacity-50'
                  : 'rounded-full border border-hairline bg-surface-low px-3 py-1.5 text-xs hover:border-gold disabled:opacity-50'}>
                {full && <Icon name="chat" size={16} className="text-gold" />}<span className="min-w-0 flex-1">{c}</span>
              </button>
            ))}
          </div>
        )}
        {turns.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-gold px-4 py-2.5 text-sm leading-relaxed text-charcoal">
              {m.photo && <img src={m.photo} alt="" className="mb-1.5 max-h-48 rounded-2xl" />}
              {m.content}
            </div>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-2">
            {avatar}
            <div className="min-w-0 max-w-[88%]">
              <div className="whitespace-pre-wrap break-words rounded-3xl rounded-tl-lg bg-surface-low px-4 py-2.5 text-sm leading-relaxed"><Rich text={m.content} /></div>
              <div className="mt-1 flex gap-1 pl-1 text-muted">
                <button type="button" onClick={() => speak(i, m.content)} className="flex h-8 items-center gap-1 rounded-full px-2 text-[11px] hover:bg-surface-high hover:text-ink" aria-label={speaking === i ? t('ws.stop') : t('ws.read')}>
                  <Icon name={speaking === i ? 'stop' : 'speaker'} size={16} />{speaking === i ? t('ws.stop') : t('ws.read')}
                </button>
                <button type="button" onClick={() => copy(i, m.content)} className="flex h-8 items-center gap-1 rounded-full px-2 text-[11px] hover:bg-surface-high hover:text-ink" aria-label={t('ld.copy')}>
                  <Icon name={copied === i ? 'check' : 'copy'} size={16} />{copied === i ? t('ld.copied') : t('ld.copy')}
                </button>
              </div>
            </div>
          </div>
        )))}
        {busy && (
          <div className="flex items-center gap-2" aria-label={t('chat.thinking')}>
            {avatar}
            <div className="flex gap-1 rounded-3xl rounded-tl-lg bg-surface-low px-4 py-3.5">
              {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {member && <MembershipNeeded />}
      {err && <Notice tone="bad">{err}</Notice>}

      <form className={`${inSheet ? 'sticky bottom-0 bg-surface pb-2 pt-1' : full ? 'sticky bottom-20 md:bottom-4' : ''}`} onSubmit={(e) => { e.preventDefault(); send(text); }}>
        {photo && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-hairline bg-surface-card p-2 text-xs">
            <img src={photo.url} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <span className="flex-1 text-muted">{t('ws.photoAdded')}</span>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-high" onClick={() => setPhoto(null)} aria-label={t('cancel')}>✕</button>
          </div>
        )}
        <div className={`flex items-end gap-1 rounded-[26px] border border-hairline bg-surface-card p-1.5 ${full ? 'shadow-lg' : ''}`}>
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface-high hover:text-ink" aria-label={t('ws.addPhoto')}>
            <Icon name="plus" size={22} />
            <input type="file" accept="image/*" className="hidden" disabled={busy || disabled}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); }} />
          </label>
          <textarea className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2.5 text-sm outline-none placeholder:text-muted" rows={1} maxLength={2000}
            placeholder={listening ? t('ws.listening') : t('ws.placeholder')} aria-label={t('ws.placeholder')} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
          {typed || !canListen ? (
            <button type="submit" disabled={busy || disabled || !typed} aria-label={t('chat.send')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-charcoal disabled:opacity-40"><Icon name="send" size={20} /></button>
          ) : (
            <button type="button" onClick={listen} disabled={busy || disabled} aria-pressed={listening} aria-label={t('ws.voice')}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-counterfeit text-white' : 'text-muted hover:bg-surface-high hover:text-ink'}`}>
              <Icon name={listening ? 'stop' : 'mic'} size={20} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Standard floating "Ask AI" button (bottom right, above the tab bar) that opens the workbench as a bottom sheet.
 * The sheet stays mounted while closed, so the conversation is kept.
 */
export function AskAiButton({ label, title, sub, ...ws }: { label: string; title: string; sub?: string; skill: 'paint' | 'repair' | 'chat'; context?: unknown; chips?: string[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-gold px-4 py-3 text-sm font-semibold text-charcoal shadow-xl shadow-black/40 md:bottom-6">
        <Icon name="chat" size={20} />{label}
      </button>
      <div className={open ? 'fixed inset-0 z-50 flex flex-col justify-end bg-black/60' : 'hidden'} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="flex-1 cursor-default" aria-label={t('cancel')} onClick={() => setOpen(false)} />
        <div className="mx-auto flex h-[85dvh] w-full max-w-2xl flex-col rounded-t-3xl border-t border-hairline bg-surface">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-charcoal" aria-hidden><Icon name="sparkles" size={18} /></span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{title}</div>{sub && <div className="truncate text-[11px] text-muted">{sub}</div>}</div>
            <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-high" aria-label={t('cancel')}>✕</button>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-4">
            <AiWorkspace {...ws} full inSheet />
          </div>
        </div>
      </div>
    </>
  );
}
