import React, { useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { STAFF_ROLES } from './studio.ts';
import { FeedPost, type Post } from './Feed.tsx';
import { AlbumCard, SuggestAlbum, type AlbumData } from './Album.tsx';
import { useDateTables } from './datecodeTables.ts';

type Item = { kind: 'album'; at: string; album: AlbumData } | { kind: 'photo' | 'compare'; at: string; post: Post };

/** Home timeline: albums (one per model), single photos, and genuine-vs-counterfeit comparisons, newest first. */
export default function Timeline({ brandId }: { brandId?: string }) {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const staff = STAFF_ROLES.includes(me.role);
  const tables = useDateTables();
  const [items, setItems] = useState<Item[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback((before?: string | null) => {
    const q = new URLSearchParams({ limit: '6' });
    if (brandId) q.set('brandId', brandId);
    if (before) q.set('before', before);
    return api.get<{ items: Item[]; next: string | null; aiConfigured: boolean }>(`/api/feed/timeline?${q}`);
  }, [brandId]);
  const load = useCallback(() => {
    let on = true;
    setItems(null);
    fetchPage().then((r) => { if (on) { setItems(r.items); setNext(r.next); setAi(r.aiConfigured); } }).catch(() => on && setItems([]));
    return () => { on = false; };
  }, [fetchPage]);
  useEffect(load, [load]);

  const more = async () => {
    setBusy(true);
    try { const r = await fetchPage(next); setItems((p) => [...(p ?? []), ...r.items]); setNext(r.next); } finally { setBusy(false); }
  };
  const replace = (p: Post) => setItems((all) => all?.map((x) => (x.kind !== 'album' && x.post.id === p.id ? { ...x, post: p } : x)) ?? null);

  if (items === null) return <div className="h-60 animate-pulse rounded-2xl bg-surface-low" />;
  if (items.length === 0) return <p className="rounded-2xl border border-dashed border-strong p-5 text-sm text-muted">{t('feed.none')}</p>;
  return (
    <div className="space-y-5">
      {!ai && staff && <p className="text-xs text-muted">{t('feed.aiOffHint')}</p>}
      {items.map((it) => it.kind === 'album' ? <AlbumCard key={`a${it.album.model_id}`} a={it.album} /> : (
        <div key={it.post.id}>
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted">
            {it.kind === 'compare' ? <span className="text-counterfeit">⚖ {t('album.compareKicker')}</span> : `▢ ${t('album.single')}`}
          </div>
          <FeedPost post={it.post} ai={ai} tables={tables} onChange={replace} />
          {it.kind === 'photo' && staff && ai && <SuggestAlbum post={it.post} onFiled={load} />}
        </div>
      ))}
      {next && <button className="btn-ghost w-full" disabled={busy} onClick={more}>{busy ? '…' : t('feed.more')}</button>}
    </div>
  );
}
