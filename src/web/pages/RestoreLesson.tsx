import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, errText } from '../ui.tsx';
import { carePhoto, careTitle, type CareLesson } from './Restore.tsx';

export interface CareStep { id: string; sort: number; body: string; tip: string | null; has_photo: boolean }

/** One painting / repair lesson: before & after, what you need, safety, then numbered steps with photos. */
export default function RestoreLesson() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const [d, setD] = useState<{ lesson: CareLesson; steps: CareStep[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get<{ lesson: CareLesson; steps: CareStep[] }>(`/api/care/lessons/${id}`).then(setD).catch((e) => setErr(errText(e))); }, [id]);

  if (err) return <div className="mx-auto max-w-3xl px-4 py-6"><Notice tone="bad">{err}</Notice><Link to="/restore" className="mt-4 inline-block text-sm text-gold">{t('care.back')}</Link></div>;
  if (!d) return <div className="mx-auto max-w-3xl px-4 py-6"><div className="h-72 animate-pulse rounded-2xl bg-surface-low" /></div>;
  const l = d.lesson;

  return (
    <article className="mx-auto max-w-3xl px-4 pb-10 pt-4 md:px-8">
      <Link to="/restore" className="text-sm text-gold">{t('care.back')}</Link>
      {l.status !== 'published' && <div className="mt-3"><Notice tone="warn">{t('care.draft')}{l.ai_drafted ? ` · ${t('care.aiDrafted')}` : ''}</Notice></div>}

      <header className="mt-3">
        <div className="text-xs font-semibold text-gold">{t(`care.topic.${l.topic}`)}</div>
        <h1 className="mt-1 text-3xl leading-tight">{careTitle(l, locale)}</h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-full bg-surface-low px-2.5 py-1">{t(`care.level.${l.level}`)}</span>
          {l.minutes && <span className="rounded-full bg-surface-low px-2.5 py-1">⏱ {l.minutes} {t('care.minutes')}</span>}
          <span className="rounded-full bg-surface-low px-2.5 py-1">{d.steps.length} {t('care.steps')}</span>
        </div>
        {l.summary && <p className="mt-3 text-[15px] leading-relaxed">{l.summary}</p>}
      </header>

      {(l.has_before || l.has_after) && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {(['before', 'after'] as const).map((w) => (
            <figure key={w} className="relative overflow-hidden rounded-2xl border border-hairline bg-surface-low">
              {(w === 'before' ? l.has_before : l.has_after)
                ? <img src={carePhoto(l, w)} alt={t(`care.${w}`)} className="aspect-square w-full object-cover" />
                : <div className="flex aspect-square items-center justify-center text-3xl text-strong" aria-hidden>—</div>}
              <figcaption className={`absolute left-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${w === 'after' ? 'bg-gold text-charcoal' : 'bg-charcoal/80 text-white'}`}>{t(`care.${w}`)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {l.materials && (
          <section className="rounded-2xl border border-hairline bg-surface-card p-4">
            <h2 className="text-base">🧰 {t('care.materials')}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{l.materials.split('\n').map((m) => m.replace(/^[-•*]\s*/, '').trim()).filter(Boolean).map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        )}
        {l.safety && (
          <section className="rounded-2xl border border-review bg-review-bg p-4">
            <h2 className="text-base">⚠️ {t('care.safety')}</h2>
            <p className="mt-2 whitespace-pre-line text-sm">{l.safety}</p>
          </section>
        )}
      </div>

      <ol className="mt-6 space-y-4">
        {d.steps.map((s, i) => (
          <li key={s.id} className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
            {s.has_photo && <img src={`/api/care/steps/${s.id}/photo?v=${encodeURIComponent(l.updated_at)}`} alt="" loading="lazy" className="max-h-[420px] w-full object-cover" />}
            <div className="flex gap-3 p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-charcoal font-serif text-sm text-gold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line text-[15px] leading-relaxed">{s.body}</p>
                {s.tip && <p className="mt-2 rounded-lg bg-gold-light px-3 py-2 text-sm">💡 <b>{t('care.tip')}:</b> {s.tip}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <Link to="/chat" className="btn-ghost mt-6 inline-block">{t('restore.ask')} →</Link>
    </article>
  );
}
