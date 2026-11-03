import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { FolderCard, LooseFolderCard, type Folder } from '../FeedFolders.tsx';

export interface StudioModel {
  id: string; name: string; brand: string; brand_id: string;
  set: { id: string; slot: number; status: string; teaching_title: string | null; has_note: number; points: number }[];
  study: { genuine: number; counterfeit: number };
}
export interface Studio { setSize: number; models: StudioModel[]; recentStudy: any[]; aiConfigured: boolean }

interface Folders { folders: Folder[]; loose: number; brands: { id: string; name: string }[] }

/**
 * Home = the latest posts, grouped into one folder per model. Lessons, the scan hub, inspections and
 * knowledge stay one tap away in the tab bar, so the home screen is only what was posted.
 */
export default function Dashboard() {
  const { t } = useI18n();
  const [brand, setBrand] = useState('');
  const [d, setD] = useState<Folders | null>(null);

  useEffect(() => {
    let on = true;
    setD(null);
    api.get<Folders>(`/api/feed/folders${brand ? `?brandId=${brand}` : ''}`)
      .then((r) => on && setD(r))
      .catch(() => on && setD({ folders: [], loose: 0, brands: [] }));
    return () => { on = false; };
  }, [brand]);
  const [brands, setBrands] = useState<Folders['brands']>([]);
  useEffect(() => { if (d?.brands.length) setBrands(d.brands); }, [d]);

  const empty = d && d.folders.length === 0 && d.loose === 0;
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 pb-8 pt-4 md:px-8">
      {brands.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {[{ id: '', name: t('home.all') }, ...brands].map((b) => (
            <button key={b.id || 'all'} type="button" onClick={() => setBrand(b.id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${brand === b.id ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
          ))}
        </div>
      )}

      <section>
        <h1 className="text-[26px] leading-tight md:text-3xl">{t('feed.title')}</h1>
        <p className="mb-3 text-xs text-muted">{t('folder.help')}</p>
        {!d ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-surface-low" />)}</div>
        ) : empty ? (
          <p className="rounded-2xl border border-dashed border-strong p-5 text-sm text-muted">{t('feed.none')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {d.folders.map((f) => <FolderCard key={f.id} f={f} />)}
            {d.loose > 0 && <LooseFolderCard n={d.loose} brandId={brand || undefined} />}
          </div>
        )}
      </section>
    </div>
  );
}
