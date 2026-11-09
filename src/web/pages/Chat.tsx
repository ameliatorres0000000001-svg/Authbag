import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice } from '../ui.tsx';
import AiWorkspace from '../AiWorkspace.tsx';

interface Status { configured: boolean; limit: number; used: number }

/**
 * 💬 AI assistant: ask anything about the bag work by typing, by voice or with a photo; answers can be read aloud.
 * The conversation lives in this page only; the server keeps just a daily count. Never a verdict.
 */
export default function Chat() {
  const { t } = useI18n();
  const [st, setSt] = useState<Status | null>(null);
  useEffect(() => { api.get<Status>('/api/chat/status').then(setSt).catch(() => setSt(null)); }, []);
  const left = st ? Math.max(0, st.limit - st.used) : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 pb-4 pt-4 md:min-h-screen md:px-8">
      <div className="mb-2">
        <h1 className="text-2xl leading-tight md:text-3xl">{t('chat.title')}</h1>
        <p className="mt-0.5 text-xs text-muted md:text-sm">{t('chat.sub')}</p>
      </div>
      {st && !st.configured && <Notice tone="warn">{t('chat.notConfigured')}</Notice>}
      <AiWorkspace skill="chat" full disabled={st?.configured === false} chips={['chat.q1', 'chat.q2', 'chat.q3', 'chat.q4'].map((k) => t(k))} />
      <p className="mt-2 text-[11px] text-muted">{t('chat.disclaimer')}{left !== null && st?.configured ? ` · ${left} ${t('chat.left')}` : ''}</p>
    </div>
  );
}
