import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { assetImg } from './studio.ts';
import { timeAgo } from './Feed.tsx';

export interface Folder {
  id: string; model: string; brand_id: string; brand: string; photos: number; latest: string; parts: number;
  genuine: number; counterfeit: number; has_lesson: boolean; covers: string[];
}

/** One folder per model: a 2×2 cover of its first photos, the photo count and when it was last updated. */
export function FolderCard({ f }: { f: Folder }) {
  const { t, locale } = useI18n();
  const cells = [0, 1, 2, 3];
  return (
    <Link to={`/posts/${f.id}`} className="group block overflow-hidden rounded-2xl border border-hairline bg-surface-card transition hover:border-strong">
      <div className="grid aspect-square grid-cols-2 gap-0.5 bg-charcoal">
        {cells.map((i) => f.covers[i]
          ? <img key={i} src={assetImg(f.covers[i])} alt="" loading="lazy" className={`h-full w-full object-cover ${f.covers.length === 1 ? 'col-span-2 row-span-2' : ''}`} />
          : f.covers.length > 1 ? <div key={i} className="bg-surface-low/10" /> : null)}
      </div>
      <div className="space-y-0.5 px-3 py-2.5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{f.brand}</div>
        <div className="truncate font-serif text-lg leading-tight">{f.model}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span aria-hidden>▤</span>
          <span>{f.photos} {t('folder.photos')}</span>
          <span>·</span>
          <span className="truncate">{timeAgo(f.latest, locale, t('feed.justNow'))}</span>
        </div>
      </div>
    </Link>
  );
}

/** The "other photos" folder: posts that are not tied to one model (e.g. comparison pairs). */
export function LooseFolderCard({ n, brandId }: { n: number; brandId?: string }) {
  const { t } = useI18n();
  return (
    <Link to={`/posts/other${brandId ? `?brandId=${brandId}` : ''}`} className="block overflow-hidden rounded-2xl border border-dashed border-strong bg-surface-card transition hover:border-charcoal">
      <div className="flex aspect-square items-center justify-center bg-surface-low text-5xl text-gold" aria-hidden>▤</div>
      <div className="space-y-0.5 px-3 py-2.5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('folder.mixed')}</div>
        <div className="truncate font-serif text-lg leading-tight">{t('folder.other')}</div>
        <div className="text-xs text-muted">{n} {t('folder.photos')}</div>
      </div>
    </Link>
  );
}
