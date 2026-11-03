import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Badge, Notice, errText } from './ui.tsx';
import AnnotatedPhoto, { PointCards, type Point } from './AnnotatedPhoto.tsx';
import { STAFF_ROLES, assetImg } from './studio.ts';
import { readDateCode, useDateTables, type DateTables } from './datecodeTables.ts';

export interface Post {
  id: string; brand_id: string; brand: string; model_id: string | null; model: string | null;
  component_code: string | null; part_en: string | null; part_km: string | null;
  label: 'authentic' | 'counterfeit' | 'unknown'; label_basis: string; status: string; purpose: string;
  teaching_title: string | null; teaching_note: string | null; lesson_step_id: string | null; created_at: string; author: string | null;
  points: Point[]; transcription: string | null; genuineRefId: string | null;
}

/** Newest uploaded photos as posts. Labels are the uploader's; the system never decides authentic vs counterfeit. */
export default function Feed({ brandId, modelId, noModel, pageSize = 6 }: { brandId?: string; modelId?: string; noModel?: boolean; pageSize?: number }) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const tables = useDateTables();

  const fetchPage = useCallback(async (before?: string | null) => {
    const q = new URLSearchParams({ limit: String(pageSize) });
    if (brandId) q.set('brandId', brandId);
    if (modelId) q.set('modelId', modelId);
    if (noModel) q.set('noModel', '1');
    if (before) q.set('before', before);
    return api.get<{ posts: Post[]; next: string | null; aiConfigured: boolean }>(`/api/feed?${q}`);
  }, [brandId, modelId, noModel, pageSize]);

  useEffect(() => {
    let on = true;
    setPosts(null);
    fetchPage().then((r) => { if (on) { setPosts(r.posts); setNext(r.next); setAi(r.aiConfigured); } }).catch(() => on && setPosts([]));
    return () => { on = false; };
  }, [fetchPage]);

  const more = async () => {
    setBusy(true);
    try { const r = await fetchPage(next); setPosts((p) => [...(p ?? []), ...r.posts]); setNext(r.next); } finally { setBusy(false); }
  };
  const replace = (p: Post) => setPosts((all) => all?.map((x) => (x.id === p.id ? p : x)) ?? null);

  if (posts === null) return <div className="h-40 animate-pulse rounded-2xl bg-surface-low" />;
  if (posts.length === 0) return <p className="rounded-2xl border border-dashed border-strong p-5 text-sm text-muted">{t('feed.none')}</p>;
  return (
    <div className="space-y-4">
      {!ai && <p className="text-xs text-muted">{t('feed.aiOffHint')}</p>}
      {posts.map((p) => <FeedPost key={p.id} post={p} ai={ai} tables={tables} onChange={replace} />)}
      {next && <button className="btn-ghost w-full" disabled={busy} onClick={more}>{busy ? '…' : t('feed.more')}</button>}
    </div>
  );
}

export function timeAgo(iso: string, locale: string, justNow: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(locale === 'km' ? 'km' : 'en', { numeric: 'auto' });
  for (const [unit, sec] of [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (s >= sec) return rtf.format(-Math.floor(s / sec), unit);
  }
  return justNow;
}

function FeedPost({ post: p, ai, tables, onChange }: { post: Post; ai: boolean; tables: DateTables | null; onChange: (p: Post) => void }) {
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const staff = STAFF_ROLES.includes(me.role);
  const [active, setActive] = useState<number | null>(null);
  const [panel, setPanel] = useState<0 | 1>(0); // 0 = this photo, 1 = genuine reference (counterfeit posts only)
  const [refPoints, setRefPoints] = useState<Point[] | null>(null);
  const [busy, setBusy] = useState<'' | 'mark' | 'read'>('');
  const [err, setErr] = useState<string | null>(null);

  const isFake = p.label === 'counterfeit';
  const part = locale === 'km' ? (p.part_km ?? p.part_en) : p.part_en;
  const reading = useMemo(() => (tables && p.transcription ? readDateCode(tables, p.brand_id, p.transcription) : null), [tables, p.transcription, p.brand_id]);

  useEffect(() => {
    if (panel === 1 && p.genuineRefId && refPoints === null) api.get(`/api/studio/assets/${p.genuineRefId}`).then((a) => setRefPoints(a.points)).catch(() => setRefPoints([]));
  }, [panel, p.genuineRefId, refPoints]);

  const reload = async () => {
    const r = await api.get<{ posts: Post[] }>(`/api/feed?limit=1&before=${encodeURIComponent(new Date(new Date(p.created_at).getTime() + 1).toISOString())}${p.brand_id ? `&brandId=${p.brand_id}` : ''}`);
    const fresh = r.posts.find((x) => x.id === p.id);
    if (fresh) onChange(fresh);
  };
  const run = async (kind: 'mark' | 'read') => {
    setBusy(kind); setErr(null);
    try {
      if (kind === 'mark') await api.post(`/api/assets/${p.id}/points/suggest`);
      else await api.post(`/api/assets/${p.id}/datecode-analysis`, {});
      await reload();
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };

  const shown = panel === 1 && p.genuineRefId ? { src: assetImg(p.genuineRefId), points: refPoints ?? [] } : { src: assetImg(p.id), points: p.points };

  return (
    <article className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      {/* header */}
      <header className="flex items-start gap-3 px-4 pb-2 pt-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal font-serif text-lg text-gold">{p.brand.slice(0, 1)}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{p.brand}{p.model ? ` · ${p.model}` : ''}</div>
          <div className="truncate text-xs text-muted">
            {part ?? t('admin.noPart')} · {timeAgo(p.created_at, locale, t('feed.justNow'))}{p.author ? ` · ${t('feed.by')} ${p.author}` : ''}
          </div>
        </div>
        <Badge tone={isFake ? 'bad' : p.label === 'authentic' ? 'ok' : 'muted'}>
          {isFake ? t('study.knownCounterfeit') : p.label === 'authentic' ? t('study.knownGenuine') : t('study.unlabelled')}
        </Badge>
      </header>

      {(p.teaching_title || p.teaching_note) && (
        <div className="px-4 pb-3 text-[15px] leading-relaxed">
          {p.teaching_title && <div className="font-semibold">{p.teaching_title}</div>}
          {p.teaching_note && <p className="whitespace-pre-wrap">{p.teaching_note}</p>}
        </div>
      )}

      {/* photo(s) */}
      {isFake && p.genuineRefId && (
        <div className="flex gap-1 px-4 pb-2" role="tablist">
          {([0, 1] as const).map((i) => (
            <button key={i} role="tab" aria-selected={panel === i} onClick={() => { setPanel(i); setActive(null); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${panel === i ? (i === 0 ? 'bg-counterfeit text-white' : 'bg-verified text-white') : 'bg-surface-high text-muted'}`}>
              {i === 0 ? t('feed.thisPhoto') : t('feed.genuineRef')}
            </button>
          ))}
        </div>
      )}
      <AnnotatedPhoto src={shown.src} points={shown.points} active={active} onPick={setActive}
        tone={panel === 1 ? 'genuine' : isFake ? 'counterfeit' : 'genuine'} className="!rounded-none !border-x-0" />

      {/* date code reading */}
      {p.component_code === 'date_code' && p.transcription && panel === 0 && (
        <div className="border-b border-hairline bg-surface-low px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('feed.codeRead')}</div>
          <div className="font-mono text-xl font-semibold tracking-widest">{p.transcription}</div>
          {reading?.candidates.map((c) => (
            <div key={c.formatId} className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
              <span>{c.country ? `${t('dc.madeIn')} ${c.country}` : t('dc.unknownFactory')}</span>
              <span className="text-muted">·</span>
              <span>{c.periodUnit === 'week' ? t('dc.week') : c.periodUnit === 'month' ? t('dc.month') : t('dc.period')} {c.period}</span>
              <span className="text-muted">·</span>
              <span>{c.year}</span>
              {!c.periodValid && <Badge tone="bad">{c.periodUnit === 'month' ? t('dc.badMonth') : t('dc.badWeek')}</Badge>}
              {c.formatStatus !== 'approved' && <Badge tone="warn">{t('dc.draftShort')}</Badge>}
            </div>
          ))}
          {reading && reading.candidates.length === 0 && <p className="text-sm text-muted">{t('dc.noMatch')}</p>}
        </div>
      )}

      {/* explanations */}
      <div className="space-y-3 px-4 py-3">
        {panel === 1 && <div className="font-mono text-[10px] uppercase tracking-widest text-verified">{t('feed.compareWith')}</div>}
        <PointCards points={shown.points} active={active} onPick={setActive} empty={t('feed.noPoints')} />
        {err && <Notice tone="bad">{err}</Notice>}
        {(staff && ai) || p.lesson_step_id ? (
          <div className="flex flex-wrap gap-2 border-t border-hairline pt-3">
            {staff && ai && panel === 0 && <button className="btn-ghost !py-1.5 text-xs" disabled={!!busy} onClick={() => run('mark')}>{busy === 'mark' ? '…' : t('feed.aiAnnotate')}</button>}
            {staff && ai && p.component_code === 'date_code' && <button className="btn-ghost !py-1.5 text-xs" disabled={!!busy} onClick={() => run('read')}>{busy === 'read' ? '…' : t('feed.aiRead')}</button>}
            {p.lesson_step_id && p.model_id && <Link className="btn-ghost !py-1.5 text-xs" to={`/learn/${p.model_id}`}>{t('feed.openLesson')} →</Link>}
          </div>
        ) : null}
      </div>
    </article>
  );
}
