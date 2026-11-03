import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.tsx';
import { assetImg } from './studio.ts';
import { timeAgo } from './Feed.tsx';

export interface Folder {
  id: string; model: string; brand_id: string; brand: string; photos: number; latest: string; parts: number;
  genuine: number; counterfeit: number; has_lesson: boolean; covers: string[];
}

/**
 * An album-style folder: one large cover photo with two "paper" layers behind it,
 * the name over a soft gradient and the photo count as a badge.
 */
function Album({ to, cover, kicker, title, count, when }: { to: string; cover: string | null; kicker: string; title: string; count: number; when: string | null }) {
  const { t, locale } = useI18n();
  return (
    <Link to={to} className="group block pt-2">
      <div className="relative">
        {/* stacked sheets behind the cover */}
        <div className="absolute inset-x-3 -top-2 h-6 rounded-xl bg-charcoal/15" aria-hidden />
        <div className="absolute inset-x-1.5 -top-1 h-6 rounded-xl bg-charcoal/30" aria-hidden />
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-charcoal shadow-sm ring-1 ring-black/5">
          {cover
            ? <img src={assetImg(cover)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
            : <div className="flex h-full items-center justify-center text-4xl text-gold" aria-hidden>▤</div>}
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white backdrop-blur">▤ {count}</span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2.5 pt-10">
            {/* letter-spacing breaks Khmer clusters, so only Latin kickers are tracked */}
            <div className={`text-gold ${/[ក-៿]/.test(kicker) ? 'text-[11px]' : 'font-mono text-[9px] uppercase tracking-[0.18em]'}`}>{kicker}</div>
            <div className="line-clamp-2 font-serif text-[17px] leading-tight text-white">{title}</div>
          </div>
        </div>
      </div>
      {when && <div className="mt-1.5 px-0.5 text-[11px] text-muted">{count} {t('folder.photos')} · {timeAgo(when, locale, t('feed.justNow'))}</div>}
    </Link>
  );
}

export function FolderCard({ f }: { f: Folder }) {
  return <Album to={`/posts/${f.id}`} cover={f.covers[0] ?? null} kicker={f.brand} title={f.model} count={f.photos} when={f.latest} />;
}

/** The "other photos" folder: posts not tied to one model (e.g. comparison pairs). */
export function LooseFolderCard({ n, cover, latest, brandId }: { n: number; cover: string | null; latest: string | null; brandId?: string }) {
  const { t } = useI18n();
  return <Album to={`/posts/other${brandId ? `?brandId=${brandId}` : ''}`} cover={cover} kicker={t('folder.compareKicker')} title={t('folder.other')} count={n} when={latest} />;
}
