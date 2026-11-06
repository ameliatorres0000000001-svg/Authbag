import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice } from '../ui.tsx';

interface Turn { role: 'user' | 'assistant'; content: string }
interface Status { configured: boolean; limit: number; used: number }

/** Light formatting for AI replies: **bold** only; everything else stays plain text (no HTML from the model). */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

/**
 * AI assistant chat about second-hand bags (market, care, repair, materials, how experts inspect).
 * The conversation lives in this page only; the server keeps just a daily count. Teaching only: never a verdict.
 */
export default function Chat() {
  const { t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [st, setSt] = useState<Status | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api.get<Status>('/api/chat/status').then(setSt).catch(() => setSt(null)); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, busy]);

  const send = async (q: string) => {
    const content = q.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next); setText(''); setErr(''); setBusy(true);
    try {
      const r = await api.post<{ reply: string }>('/api/chat', { messages: next });
      setTurns([...next, { role: 'assistant', content: r.reply }]);
      setSt((s) => (s ? { ...s, used: s.used + 1 } : s));
    } catch (e) {
      const code = e instanceof ApiError ? e.body?.error : '';
      setErr(code === 'chat_limit' ? t('chat.limit') : code === 'ai_not_configured' ? t('chat.notConfigured') : t('chat.failed'));
      setTurns(turns); setText(content); // give the question back so it can be sent again
    } finally { setBusy(false); }
  };

  const left = st ? Math.max(0, st.limit - st.used) : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 pb-4 pt-4 md:min-h-screen md:px-8">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl leading-tight md:text-3xl">{t('chat.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('chat.sub')}</p>
        </div>
        {turns.length > 0 && <button type="button" className="btn-ghost shrink-0 !px-3 !py-1 text-xs" onClick={() => { setTurns([]); setErr(''); }}>{t('chat.new')}</button>}
      </div>

      {st && !st.configured && <Notice tone="warn">{t('chat.notConfigured')}</Notice>}

      <div className="flex-1 space-y-3 py-2" aria-live="polite">
        {turns.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {['chat.q1', 'chat.q2', 'chat.q3', 'chat.q4'].map((k) => (
              <button key={k} type="button" disabled={busy || st?.configured === false} onClick={() => send(t(k))}
                className="rounded-2xl border border-hairline bg-surface-card px-4 py-3 text-left text-sm hover:border-gold disabled:opacity-50">{t(k)}</button>
            ))}
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-charcoal text-white' : 'rounded-bl-md border border-hairline bg-surface-card'}`}>
              {m.role === 'assistant' ? <Rich text={m.content} /> : m.content}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="animate-pulse rounded-2xl rounded-bl-md border border-hairline bg-surface-card px-4 py-2.5 text-sm text-muted">{t('chat.thinking')}</div></div>}
        <div ref={end} />
      </div>

      {err && <div className="mb-2"><Notice tone="bad">{err}</Notice></div>}
      <form className="sticky bottom-20 flex items-end gap-2 rounded-2xl border border-hairline bg-surface-card p-2 shadow-sm md:bottom-4"
        onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm outline-none" rows={1} maxLength={4000}
          placeholder={t('chat.placeholder')} aria-label={t('chat.placeholder')} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
        <button type="submit" disabled={busy || !text.trim() || st?.configured === false} className="btn-primary !px-4 !py-2.5 text-sm disabled:opacity-50">{t('chat.send')}</button>
      </form>
      <p className="mt-2 text-[11px] text-muted">
        {t('chat.disclaimer')}{left !== null && st?.configured ? ` · ${left} ${t('chat.left')}` : ''}
      </p>
    </div>
  );
}
