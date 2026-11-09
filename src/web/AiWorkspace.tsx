import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Notice, errText } from './ui.tsx';
import { MembershipNeeded, isMembershipError } from './pages/Membership.tsx';
import { speakText, stopAudio } from './voice.ts';

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
export default function AiWorkspace({ skill, context, chips = [], title, sub, full = false, disabled = false }: {
  skill: 'paint' | 'repair' | 'chat'; context?: unknown; chips?: string[]; title?: string; sub?: string; full?: boolean; disabled?: boolean;
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

  return (
    <div className={full ? 'flex flex-1 flex-col' : 'space-y-3 rounded-2xl border border-gold/40 bg-surface-card p-3'}>
      {(title || sub) && (
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold text-charcoal" aria-hidden>💬</span>
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold">{title}</div>}
            {sub && <div className="text-[11px] leading-snug text-muted">{sub}</div>}
          </div>
        </div>
      )}

      <div className={full ? 'flex-1 space-y-2.5 py-2' : 'space-y-2'} aria-live="polite">
        {turns.length === 0 && chips.length > 0 && (
          <div className={full ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-1.5'}>
            {chips.map((c) => (
              <button key={c} type="button" disabled={busy || disabled} onClick={() => send(c)}
                className={full ? 'rounded-2xl border border-hairline bg-surface-card px-4 py-3 text-left text-sm hover:border-gold disabled:opacity-50'
                  : 'rounded-full border border-hairline bg-surface-low px-3 py-1.5 text-xs hover:border-gold disabled:opacity-50'}>{c}</button>
            ))}
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-gold text-charcoal' : 'rounded-bl-md border border-hairline bg-surface-low'}`}>
              {m.photo && <img src={m.photo} alt="" className="mb-1.5 max-h-40 rounded-lg" />}
              {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
              {m.role === 'assistant' && (
                <button type="button" onClick={() => speak(i, m.content)} className="mt-1 block text-[11px] text-gold" aria-label={t('ws.read')}>{speaking === i ? `■ ${t('ws.stop')}` : `🔊 ${t('ws.read')}`}</button>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="animate-pulse rounded-2xl rounded-bl-md border border-hairline bg-surface-low px-3.5 py-2 text-sm text-muted">{t('chat.thinking')}</div></div>}
        <div ref={end} />
      </div>

      {member && <MembershipNeeded />}
      {err && <Notice tone="bad">{err}</Notice>}

      {photo && (
        <div className="flex items-center gap-2 text-xs">
          <img src={photo.url} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <span className="flex-1 text-muted">{t('ws.photoAdded')}</span>
          <button type="button" className="text-muted" onClick={() => setPhoto(null)} aria-label={t('cancel')}>✕</button>
        </div>
      )}
      <form className={`flex items-end gap-1.5 rounded-2xl border border-hairline bg-surface-low p-1.5 ${full ? 'sticky bottom-20 shadow-lg md:bottom-4' : ''}`}
        onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-lg hover:bg-surface-high" aria-label={t('ws.addPhoto')}>
          📷<input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy || disabled}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); }} />
        </label>
        <textarea className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-muted" rows={1} maxLength={2000}
          placeholder={listening ? t('ws.listening') : t('ws.placeholder')} aria-label={t('ws.placeholder')} value={text} onChange={(e) => setText(e.target.value)} disabled={disabled}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
        {canListen && (
          <button type="button" onClick={listen} disabled={busy || disabled} aria-pressed={listening} aria-label={t('ws.voice')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${listening ? 'animate-pulse bg-counterfeit text-white' : 'hover:bg-surface-high'}`}>🎤</button>
        )}
        <button type="submit" disabled={busy || disabled || (!text.trim() && !photo)} className="btn-primary h-10 shrink-0 !px-3.5 !py-0" aria-label={t('chat.send')}>➤</button>
      </form>
    </div>
  );
}
