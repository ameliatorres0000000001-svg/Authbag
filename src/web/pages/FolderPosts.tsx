import React, { useContext, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import Feed from '../Feed.tsx';
import { STAFF_ROLES } from '../studio.ts';
import type { Folder } from '../FeedFolders.tsx';

/** One folder: every post of a model (or the posts not tied to a model), newest first. */
export default function FolderPosts() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const { modelId = '' } = useParams();
  const [sp] = useSearchParams();
  const other = modelId === 'other';
  const brandId = sp.get('brandId') || undefined;
  const [f, setF] = useState<Folder | null>(null);

  useEffect(() => {
    if (other) return;
    api.get<{ folders: Folder[] }>('/api/feed/folders').then((r) => setF(r.folders.find((x) => x.id === modelId) ?? null)).catch(() => setF(null));
  }, [modelId, other]);

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-4">
      <Link to="/" className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-ink">← {t('feed.title')}</Link>
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{other ? t('folder.mixed') : f?.brand ?? ''}</div>
        <h1 className="font-serif text-3xl leading-tight">{other ? t('folder.other') : f?.model ?? '…'}</h1>
        {f && <p className="text-xs text-muted">{f.photos} {t('folder.photos')}</p>}
        {!other && (f?.has_lesson || STAFF_ROLES.includes(me.role)) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {f?.has_lesson && <Link className="btn-ghost !py-1.5 text-xs" to={`/learn/${modelId}`}>{t('feed.openLesson')} →</Link>}
            {STAFF_ROLES.includes(me.role) && <Link className="btn-ghost !py-1.5 text-xs" to={`/studio/${modelId}`}>{t('home.openStudio')} →</Link>}
          </div>
        )}
      </header>
      {other ? <Feed noModel brandId={brandId} pageSize={10} /> : <Feed modelId={modelId} pageSize={10} />}
    </div>
  );
}
