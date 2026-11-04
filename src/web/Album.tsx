import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Badge, Notice, errText } from './ui.tsx';
import AnnotatedPhoto from './AnnotatedPhoto.tsx';
import { STAFF_ROLES, assetImg } from './studio.ts';
import { timeAgo, type Post } from './Feed.tsx';

export interface GuideText { title: string; intro: string; steps: string[] }
export type Guide = { km: GuideText; en: GuideText; status: 'ai_draft' | 'approved'; updated_at?: string } | null;
export interface AlbumData { model_id: string; model: string; brand_id: string; brand: string; total: number; photos: Post[]; guide: Guide }

export const guideText = (g: Guide, locale: string): GuideText | null => (g ? (locale === 'km' ? g.km : g.en) : null);

/** Horizontal swipe strip with snap; reports the visible slide. */
export function useSlides(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const onScroll = () => { const el = ref.current; if (el && el.clientWidth) setI(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)))); };
  const go = (n: number, smooth = true) => { const el = ref.current; if (el) el.scrollTo({ left: n * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); };
  return { ref, i, onScroll, go };
}

export function Dots({ n, i, onGo }: { n: number; i: number; onGo?: (k: number) => void }) {
  if (n < 2) return null;
  const shown = Math.min(n, 9);
  const start = Math.max(0, Math.min(i - 4, n - shown));
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden>
      {Array.from({ length: shown }, (_, k) => start + k).map((k) => (
        <button key={k} type="button" tabIndex={-1} onClick={() => onGo?.(k)}
          className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-gold' : 'w-1.5 bg-strong/40'}`} />
      ))}
    </div>
  );
}

/** "How to look at this model": title, one sentence and the numbered steps. */
export function GuideBlock({ guide, max, more }: { guide: Guide; max?: number; more?: React.ReactNode }) {
  const { t, locale } = useI18n();
  const g = guideText(guide, locale);
  if (!g) return null;
  const steps = max ? g.steps.slice(0, max) : g.steps;
  return (
    <div className="rounded-xl border border-gold/40 bg-gold-light/60 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-serif text-[17px] leading-snug">🔍 {g.title}</div>
        {guide?.status === 'ai_draft' && <Badge tone="warn">{t('album.aiDraft')}</Badge>}
      </div>
      {g.intro && <p className="mt-1 text-[13.5px] leading-snug text-muted">{g.intro}</p>}
      <ol className="mt-2 space-y-1.5">
        {steps.map((s, k) => (
          <li key={k} className="flex gap-2 text-[14px] leading-snug">
            <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-charcoal font-mono text-[10px] font-bold text-gold">{k + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {more}
    </div>
  );
}

/** Timeline card: one album per model. Swipe the photos; tap a photo to open the album viewer. */
export function AlbumCard({ a }: { a: AlbumData }) {
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const { ref, i, onScroll, go } = useSlides(a.photos.length);
  const [guide, setGuide] = useState<Guide>(a.guide);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const staff = STAFF_ROLES.includes(me.role);
  const cur = a.photos[i];
  const part = cur ? (locale === 'km' ? (cur.part_km ?? cur.part_en) : cur.part_en) : null;
  const latest = a.photos.reduce((m, p) => (p.created_at > m ? p.created_at : m), '');

  async function draft() {
    setBusy(true); setErr(null);
    try { const r = await api.post<{ guide: Guide }>(`/api/albums/${a.model_id}/guide`); setGuide(r.guide); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <header className="flex items-start gap-3 px-4 pb-2 pt-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-charcoal font-serif text-lg text-gold">{a.brand.slice(0, 1)}</div>
        <Link to={`/album/${a.model_id}`} className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{a.brand} · {a.model}</div>
          <div className="truncate text-xs text-muted">▤ {t('album.kicker')} · {a.total} {t('folder.photos')}{latest ? ` · ${timeAgo(latest, locale, t('feed.justNow'))}` : ''}</div>
        </Link>
      </header>

      <div className="relative bg-charcoal">
        <div ref={ref} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {a.photos.map((p, k) => (
            <Link key={p.id} to={`/album/${a.model_id}?i=${k}`} className="flex w-full shrink-0 snap-center items-center justify-center" style={{ minHeight: '44vh' }}>
              <AnnotatedPhoto src={assetImg(p.id)} points={p.points} className="!rounded-none !border-0" fit />
            </Link>
          ))}
        </div>
        <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">{i + 1}/{a.total}</span>
        {cur && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-white">
            <span className="truncate text-[13px]">{part ?? t('admin.noPart')}{cur.points.length ? ` · ${cur.points.length} ${t('album.points')}` : ''}</span>
            <span className="shrink-0 text-[11px] text-white/80">{t('album.tap')}</span>
          </div>
        )}
      </div>
      <div className="py-2"><Dots n={a.photos.length} i={i} onGo={go} /></div>

      <div className="space-y-2 px-4 pb-4">
        {guide ? (
          <GuideBlock guide={guide} max={3} more={
            <Link to={`/album/${a.model_id}`} className="mt-2 inline-block text-[13px] font-semibold underline">{t('album.open')} →</Link>
          } />
        ) : staff ? (
          <button type="button" className="btn-ghost w-full !py-2 text-xs" disabled={busy} onClick={draft}>{busy ? '…' : `✨ ${t('album.aiGuide')}`}</button>
        ) : (
          <Link to={`/album/${a.model_id}`} className="text-[13px] font-semibold underline">{t('album.open')} →</Link>
        )}
        {err && <Notice tone="bad">{err}</Notice>}
      </div>
    </article>
  );
}

/** Staff, under a photo not filed in an album yet: AI suggests the model; nothing moves until confirmed. */
export function SuggestAlbum({ post, onFiled }: { post: Post; onFiled: () => void }) {
  const { t } = useI18n();
  const [s, setS] = useState<{ modelId: string | null; model: string | null; confidence: number; reason: string } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string; brand_id: string }[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (s && !models) api.get('/api/taxonomy').then((r) => setModels(r.models.filter((m: any) => m.brand_id === post.brand_id))).catch(() => setModels([])); }, [s, models, post.brand_id]);

  async function ask() {
    setBusy(true); setErr(null);
    try { const r = await api.post(`/api/assets/${post.id}/suggest-model`); setS(r); setPick(r.modelId ?? ''); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  async function file() {
    if (!pick) return;
    setBusy(true); setErr(null);
    try { await api.put(`/api/assets/${post.id}/model`, { modelId: pick }); onFiled(); } catch (e) { setErr(errText(e)); setBusy(false); }
  }
  return (
    <div className="-mt-2 rounded-b-2xl border border-t-0 border-hairline bg-surface-low px-4 py-2.5 text-xs">
      {!s ? (
        <button type="button" className="font-semibold underline" disabled={busy} onClick={ask}>{busy ? '…' : `✨ ${t('album.suggest')}`}</button>
      ) : (
        <div className="space-y-1.5">
          <div>{s.modelId ? <>🤖 {t('album.aiThinks')} <b>{s.model}</b> ({Math.round(s.confidence * 100)}%){s.reason ? ` — ${s.reason}` : ''}</> : t('album.aiUnsure')}</div>
          <div className="flex gap-2">
            <select className="input !w-auto min-w-0 flex-1 !py-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('model')}>
              <option value="">—</option>{models?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button type="button" className="btn-primary !py-1 text-xs" disabled={!pick || busy} onClick={file}>✓ {t('album.file')}</button>
          </div>
        </div>
      )}
      {err && <p className="mt-1 text-counterfeit">{err}</p>}
    </div>
  );
}
