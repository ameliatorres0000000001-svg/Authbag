import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page } from '../ui.tsx';
import LessonCard, { type LessonSummary } from '../LessonCard.tsx';

export default function Learn() {
  const { t } = useI18n();
  const [rows, setRows] = useState<LessonSummary[] | null>(null);
  useEffect(() => { api.get<LessonSummary[]>('/api/lessons').then(setRows).catch(() => setRows([])); }, []);
  return (
    <Page title={t('lesson.title')} subtitle={t('lesson.listHelp')}>
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t('lesson.none')}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{rows?.map((l) => <LessonCard key={l.id} l={l} wide />)}</div>
    </Page>
  );
}
