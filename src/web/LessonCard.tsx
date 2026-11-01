import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { assetImg } from './studio.ts';

export interface LessonSummary { id: string; name: string; brand: string; brand_id: string; steps: number; steps_with_photos: number; photos: number; cover_id: string | null }

/** Lesson cover card: photo (or a quiet placeholder), brand, model, progress of steps that have photos. */
export default function LessonCard({ l, wide = false }: { l: LessonSummary; wide?: boolean }) {
  const { t } = useI18n();
  const pct = l.steps ? Math.round((l.steps_with_photos / l.steps) * 100) : 0;
  return (
    <Link to={`/learn/${l.id}`} className={`group block shrink-0 overflow-hidden rounded-2xl border border-hairline bg-surface-card ${wide ? 'w-full' : 'w-64 snap-start'}`}>
      <div className="relative aspect-[4/3] bg-charcoal">
        {l.cover_id
          ? <img src={assetImg(l.cover_id)} alt="" loading="lazy" className="h-full w-full object-cover opacity-90 transition group-hover:opacity-100" />
          : <div className="flex h-full items-end bg-[radial-gradient(circle_at_30%_20%,#3a3528,#1a1a1a_70%)] p-4"><span className="font-serif text-4xl leading-none text-white/15">{l.name}</span></div>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10">
          <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{l.brand}</div>
          <div className="font-serif text-xl leading-tight text-white">{l.name}</div>
        </div>
      </div>
      <div className="space-y-2 px-4 py-3">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted">
          <span>{l.steps} {t('lesson.steps')} · {l.photos} {t('lesson.photos')}</span><span>{l.steps_with_photos}/{l.steps}</span>
        </div>
        <div className="h-1 overflow-hidden rounded bg-surface-high"><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
        <div className="text-sm font-semibold group-hover:text-gold">{t('lesson.open')} →</div>
      </div>
    </Link>
  );
}
