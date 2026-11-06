import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import { Notice, Page } from '../ui.tsx';

/** Bag painting & repair lessons: placeholder until the lessons are written (no made-up content). */
export default function Restore() {
  const { t } = useI18n();
  return (
    <Page title={t('restore.title')} subtitle={t('restore.sub')}>
      <Notice tone="warn">{t('restore.soon')}</Notice>
      <h2 className="mb-2 mt-6 text-lg">{t('restore.topics')}</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {['restore.t1', 'restore.t2', 'restore.t3', 'restore.t4', 'restore.t5', 'restore.t6'].map((k, i) => (
          <li key={k} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3 text-sm">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-light font-mono text-xs">{i + 1}</span>
            <span className="flex-1">{t(k)}</span>
            <span className="rounded-full bg-review-bg px-2 py-0.5 text-[10px] font-semibold text-review">{t('home.soon')}</span>
          </li>
        ))}
      </ul>
      <Link to="/chat" className="btn-primary mt-6 inline-block">{t('restore.ask')} →</Link>
    </Page>
  );
}
