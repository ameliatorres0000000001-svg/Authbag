import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, Page } from '../ui.tsx';

export const CARE_TOPICS = ['cleaning', 'edge_paint', 'recolor', 'corners', 'hardware', 'odor', 'lining', 'other'] as const;
export interface CareLesson {
  id: string; topic: string; level: string; title_km: string; title_en: string | null; summary: string | null;
  materials: string | null; safety: string | null; minutes: number | null; status: 'draft' | 'published';
  ai_drafted: number; has_before: boolean; has_after: boolean; steps?: number; updated_at: string; published_at: string | null;
}
export const careTitle = (l: CareLesson, locale: string) => (locale !== 'km' && l.title_en) || l.title_km;
export const carePhoto = (l: CareLesson, which: 'before' | 'after') => `/api/care/lessons/${l.id}/photo/${which}?v=${encodeURIComponent(l.updated_at)}`;

/** Bag painting, repair and care lessons written by our team (public). Nothing made up: "no lessons yet" until published. */
export default function Restore() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<CareLesson[] | null>(null);
  const [topic, setTopic] = useState('');
  useEffect(() => { api.get<{ lessons: CareLesson[] }>('/api/care/lessons').then((r) => setRows(r.lessons)).catch(() => setRows([])); }, []);
  const topics = CARE_TOPICS.filter((x) => rows?.some((l) => l.topic === x));
  const shown = rows?.filter((l) => !topic || l.topic === topic) ?? [];

  return (
    <Page title={t('restore.title')} subtitle={t('restore.sub')}>
      {topics.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['', ...topics].map((x) => (
            <button key={x || 'all'} type="button" onClick={() => setTopic(x)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${topic === x ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>
              {x ? t(`care.topic.${x}`) : t('care.all')}
            </button>
          ))}
        </div>
      )}

      {!rows && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-surface-low" />)}</div>}
      {rows && rows.length === 0 && (
        <>
          <Notice>{t('care.none')}</Notice>
          <Link to="/chat" className="btn-primary mt-4 inline-block">{t('restore.ask')} →</Link>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l) => (
          <Link key={l.id} to={`/restore/${l.id}`} className="group overflow-hidden rounded-2xl border border-hairline bg-surface-card transition hover:shadow-md">
            <div className="grid aspect-[16/9] grid-cols-2 bg-surface-low">
              {(['before', 'after'] as const).map((w) => (
                <div key={w} className="relative overflow-hidden">
                  {(w === 'before' ? l.has_before : l.has_after)
                    ? <img src={carePhoto(l, w)} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                    : <div className="flex h-full items-center justify-center text-2xl text-strong" aria-hidden>{w === 'before' ? '◐' : '●'}</div>}
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${w === 'after' ? 'bg-gold text-charcoal' : 'bg-charcoal/80 text-white'}`}>{t(`care.${w}`)}</span>
                </div>
              ))}
            </div>
            <div className="p-4">
              <div className="text-[11px] font-semibold text-gold">{t(`care.topic.${l.topic}`)}</div>
              <h2 className="mt-0.5 text-lg leading-snug">{careTitle(l, locale)}</h2>
              {l.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{l.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                <span className="rounded-full bg-surface-low px-2 py-0.5">{t(`care.level.${l.level}`)}</span>
                {l.minutes && <span className="rounded-full bg-surface-low px-2 py-0.5">⏱ {l.minutes} {t('care.minutes')}</span>}
                {l.steps ? <span className="rounded-full bg-surface-low px-2 py-0.5">{l.steps} {t('care.steps')}</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
