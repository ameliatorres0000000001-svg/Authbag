import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Notice, errText } from '../ui.tsx';
import AnnotatedPhoto, { PointCards } from '../AnnotatedPhoto.tsx';
import { STAFF_ROLES, assetImg } from '../studio.ts';
import type { Post } from '../Feed.tsx';
import { Dots, GuideBlock, useSlides, type Guide, type GuideText } from '../Album.tsx';

interface Data { model: { id: string; name: string; brand_id: string; brand: string; cover_asset_id: string | null }; photos: Post[]; guide: Guide; similar: { id: string; name: string; photos: number; cover: string | null }[]; aiConfigured: boolean }

/**
 * One album, like an expert's study board: the model's guide, then the photos — swipe left/right,
 * each with numbered boxes and matching point cards (tap a card to light up its box).
 */
export default function AlbumView() {
  const { modelId = '' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const staff = STAFF_ROLES.includes(me.role);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const { ref, i, onScroll, go } = useSlides(d?.photos.length ?? 0);

  useEffect(() => { setD(null); api.get<Data>(`/api/albums/${modelId}`).then(setD).catch((e) => setErr(errText(e))); }, [modelId]);
  // open at the photo that was tapped
  useEffect(() => {
    const k = Number(sp.get('i')) || 0;
    if (!d || !k) return;
    const h = requestAnimationFrame(() => requestAnimationFrame(() => go(k, false)));
    return () => cancelAnimationFrame(h);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(null), [i]);

  if (err) return <div className="mx-auto max-w-xl p-5"><Notice tone="bad">{err}</Notice></div>;
  if (!d) return <div className="mx-auto max-w-xl p-5"><div className="h-80 animate-pulse rounded-2xl bg-surface-low" /></div>;
  const cur = d.photos[i];
  const part = cur ? (locale === 'km' ? (cur.part_km ?? cur.part_en) : cur.part_en) : null;
  const fake = cur?.label === 'counterfeit';

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-10 pt-3">
      <div className="flex items-center gap-2 px-4">
        <button type="button" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} className="text-sm text-muted">←</button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{d.model.brand} · {t('album.kicker')}</div>
          <h1 className="truncate font-serif text-2xl leading-tight">{d.model.name}</h1>
        </div>
        <span className="font-mono text-xs text-muted">{d.photos.length} {t('folder.photos')}</span>
      </div>

      <div className="px-4"><GuideEditor modelId={modelId} guide={d.guide} staff={staff} ai={d.aiConfigured} onSaved={(g) => setD({ ...d, guide: g })} /></div>

      {d.photos.length === 0 ? <p className="px-4 text-sm text-muted">{t('noData')}</p> : (
        <>
          {/* photos: swipe left / right */}
          <div className="relative bg-charcoal">
            <div ref={ref} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {d.photos.map((p, k) => (
                <div key={p.id} className="flex w-full shrink-0 snap-center items-center justify-center" style={{ minHeight: '50vh' }}>
                  <AnnotatedPhoto src={assetImg(p.id)} points={p.points} active={k === i ? active : null} onPick={(n) => setActive(n === active ? null : n)}
                    tone={p.label === 'counterfeit' ? 'counterfeit' : 'genuine'} className="!rounded-none !border-0" fit />
                </div>
              ))}
            </div>
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">{i + 1}/{d.photos.length}</span>
            {i > 0 && <button type="button" aria-label="previous" onClick={() => go(i - 1)} className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white md:flex">‹</button>}
            {i < d.photos.length - 1 && <button type="button" aria-label="next" onClick={() => go(i + 1)} className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white md:flex">›</button>}
          </div>
          <Dots n={d.photos.length} i={i} onGo={go} />

          {/* thumbnails */}
          <div className="flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
            {d.photos.map((p, k) => (
              <button key={p.id} type="button" onClick={() => go(k)} aria-label={String(k + 1)}
                className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${k === i ? 'ring-gold' : 'ring-transparent opacity-70'}`}>
                <img src={assetImg(p.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                {p.label === 'counterfeit' && <span className="absolute inset-x-0 bottom-0 bg-counterfeit text-center text-[8px] text-white">✕</span>}
              </button>
            ))}
          </div>

          {/* this photo: what it shows and the numbered points */}
          {cur && (
            <section className="space-y-3 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-serif text-xl leading-tight">{part ?? t('admin.noPart')}</span>
                {staff && (d.model.cover_asset_id === cur.id
                  ? <span className="text-xs text-gold">⭐ {t('album.isCover')}</span>
                  : <button type="button" className="btn-ghost !px-2 !py-0.5 text-[11px]" onClick={async () => {
                      try { await api.put(`/api/albums/${modelId}/cover`, { assetId: cur.id }); setD({ ...d, model: { ...d.model, cover_asset_id: cur.id } }); } catch (e) { setErr(errText(e)); }
                    }}>⭐ {t('album.setCover')}</button>)}
                <Badge tone={fake ? 'bad' : cur.label === 'authentic' ? 'ok' : 'muted'}>
                  {fake ? t('study.knownCounterfeit') : cur.label === 'authentic' ? t('study.knownGenuine') : t('study.unlabelled')}
                </Badge>
              </div>
              {(cur.teaching_title || cur.teaching_note) && (
                <div className="text-[15px] leading-relaxed">
                  {cur.teaching_title && <div className="font-semibold">{cur.teaching_title}</div>}
                  {cur.teaching_note && <p className="whitespace-pre-wrap">{cur.teaching_note}</p>}
                </div>
              )}
              <PointCards points={cur.points} active={active} onPick={(n) => setActive(n === active ? null : n)} empty={t('feed.noPoints')} />
            </section>
          )}
        </>
      )}

      {d.similar.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="px-4 text-lg leading-tight">{t('album.similar')}</h2>
          <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {d.similar.map((m) => (
              <Link key={m.id} to={`/album/${m.id}`} className="w-[104px] shrink-0 snap-start">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-charcoal">
                  {m.cover ? <img src={assetImg(m.cover)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl text-gold">▤</div>}
                  <span className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 font-mono text-[10px] text-white">{m.photos}</span>
                </div>
                <div className="mt-1 truncate text-[12px] font-semibold">{m.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const toLines = (g: GuideText | undefined) => ({ title: g?.title ?? '', intro: g?.intro ?? '', steps: (g?.steps ?? []).join('\n') });
const fromLines = (f: { title: string; intro: string; steps: string }): GuideText => ({ title: f.title.trim(), intro: f.intro.trim(), steps: f.steps.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 6) });

/** The guide, and for staff: AI draft, edit (Khmer + English) and approve. */
function GuideEditor({ modelId, guide, staff, ai, onSaved }: { modelId: string; guide: Guide; staff: boolean; ai: boolean; onSaved: (g: Guide) => void }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ km: toLines(guide?.km), en: toLines(guide?.en) });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => setF({ km: toLines(guide?.km), en: toLines(guide?.en) }), [guide]);

  async function draft() {
    setBusy(true); setErr(null);
    try { const r = await api.post<{ guide: Guide }>(`/api/albums/${modelId}/guide`); onSaved(r.guide); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  async function save(approve: boolean) {
    setBusy(true); setErr(null);
    const body = { km: fromLines(f.km), en: fromLines(f.en), approve };
    try { await api.put(`/api/albums/${modelId}/guide`, body); onSaved({ ...body, status: approve ? 'approved' : 'ai_draft' }); setEdit(false); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  const tools = staff && (
    <div className="mt-2.5 flex flex-wrap gap-2 border-t border-gold/30 pt-2.5">
      {ai && <button type="button" className="btn-ghost !py-1 text-xs" disabled={busy} onClick={draft}>{busy ? '…' : `✨ ${guide ? t('album.aiRewrite') : t('album.aiGuide')}`}</button>}
      {guide && <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setEdit(!edit)}>✎ {t('album.edit')}</button>}
      {guide?.status === 'ai_draft' && !edit && <button type="button" className="btn-primary !py-1 text-xs" disabled={busy} onClick={() => save(true)}>✓ {t('album.approve')}</button>}
    </div>
  );

  return (
    <div className="space-y-2">
      {guide ? <GuideBlock guide={guide} more={tools} /> : staff ? (
        <div className="rounded-xl border border-dashed border-strong p-3 text-sm text-muted">{t('album.noGuide')}{tools}</div>
      ) : null}
      {edit && (
        <div className="space-y-3 rounded-xl border border-hairline p-3 text-xs">
          {(['km', 'en'] as const).map((l) => (
            <div key={l} className="space-y-1.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{l === 'km' ? 'ខ្មែរ' : 'English'}</div>
              <input className="input text-sm" value={f[l].title} onChange={(e) => setF({ ...f, [l]: { ...f[l], title: e.target.value } })} maxLength={120} placeholder={t('album.fTitle')} />
              <input className="input text-sm" value={f[l].intro} onChange={(e) => setF({ ...f, [l]: { ...f[l], intro: e.target.value } })} maxLength={400} placeholder={t('album.fIntro')} />
              <textarea className="input min-h-[7rem] text-sm" value={f[l].steps} onChange={(e) => setF({ ...f, [l]: { ...f[l], steps: e.target.value } })} placeholder={t('album.fSteps')} />
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => save(false)}>{t('album.saveDraft')}</button>
            <button type="button" className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => save(true)}>✓ {t('album.saveApprove')}</button>
          </div>
        </div>
      )}
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  );
}
