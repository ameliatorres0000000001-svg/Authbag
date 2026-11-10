import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice } from '../ui.tsx';
import AiWorkspace from '../AiWorkspace.tsx';
import Icon from '../Icon.tsx';

interface Status { configured: boolean; limit: number; used: number }

/**
 * 💬 AI assistant: ask anything about the bag work by typing, by voice or with a photo; answers can be read aloud.
 * The conversation lives in this page only; the server keeps just a daily count. Never a verdict.
 */
export default function Chat() {
  const { t } = useI18n();
  const [st, setSt] = useState<Status | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => { api.get<Status>('/api/chat/status').then(setSt).catch(() => setSt(null)); }, []);
  const left = st ? Math.max(0, st.limit - st.used) : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 pb-4 md:min-h-screen md:px-8">
      {/* header like a messaging app: who you talk to, and a new conversation */}
      <div className="-mx-4 flex items-center gap-3 border-b border-hairline px-4 py-2.5 md:-mx-8 md:px-8">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-charcoal" aria-hidden>
          <Icon name="sparkles" size={20} />
          {st?.configured !== false && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-verified" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">{t('chat.title')}</h1>
          <p className="truncate text-[11px] text-muted">{st?.configured ? `${t('ws.online')}${left !== null ? ` · ${left} ${t('chat.left')}` : ''}` : '—'}</p>
        </div>
        <button type="button" onClick={() => setN((x) => x + 1)} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-surface-high hover:text-ink" aria-label={t('ws.newChat')} title={t('ws.newChat')}>
          <Icon name="edit" />
        </button>
      </div>
      {st && !st.configured && <div className="mt-3"><Notice tone="warn">{t('chat.notConfigured')}</Notice></div>}
      <AiWorkspace key={n} skill="chat" full disabled={st?.configured === false} chips={['chat.q1', 'chat.q2', 'chat.q3', 'chat.q4'].map((k) => t(k))} />
      <p className="mt-2 text-center text-[11px] text-muted">{t('chat.disclaimer')}</p>
    </div>
  );
}
