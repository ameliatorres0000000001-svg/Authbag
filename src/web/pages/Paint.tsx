import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Notice, Page, errText } from '../ui.tsx';
import ColorScanner from '../ColorScanner.tsx';
import type { Issue, Measurement } from '../../shared/color.ts';
import type { StepIcon } from '../../shared/voiceKeys.ts';
import StepPlayer from '../StepPlayer.tsx';
import { useUiVoice } from '../voice.ts';

export interface PaintPart { id: string; brand: string; name: string; kind: string; color_hex: string | null; parts: number; has_photo: boolean; updated_at: string }
export interface PaintRecipe {
  id: string; name_km: string; name_en: string | null; surface: string; finish: string; lab_l: number; lab_a: number; lab_b: number;
  hex: string; method: string | null; status: 'draft' | 'published'; has_photo: boolean; updated_at: string; parts: PaintPart[];
  mix_text: string | null; mix_audio: boolean; steps: PaintStep[];
}
export interface PaintStep { id: string; sort: number; text: string; icon: StepIcon | null; minutes: number | null; has_photo: boolean; audio: 'voice' | 'tts' | null; updated_at: string }
export interface PaintProduct {
  id: string; brand: string; name: string; kind: string; color_hex: string | null; info: string | null; active: number;
  has_photo: boolean; updated_at: string; sources: { title: string; url: string }[];
}
interface Match { recipe: PaintRecipe; dE: number; level: 'exact' | 'close' }
interface MatchResult { ok: true; lab: [number, number, number]; hex: string; matches: Match[]; nearest: number | null }

export const productPhoto = (p: { id: string; updated_at: string }) => `/api/paint/products/${p.id}/photo?v=${encodeURIComponent(p.updated_at)}`;

/** One colour recipe: swatch, what to mix in which ratio, how to apply. */
export function RecipeCard({ r, mine, level, dE }: { r: PaintRecipe; mine?: string; level?: 'exact' | 'close'; dE?: number }) {
  const { t, locale } = useI18n();
  const [playing, setPlaying] = useState(false);
  const total = r.parts.reduce((s, p) => s + p.parts, 0) || 1;
  return (
    <article className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className="flex h-20">
        {mine && <div className="flex flex-1 items-end p-2 text-[10px] font-semibold text-white/90" style={{ background: mine }}><span className="rounded bg-black/40 px-1.5">{t('paint.yourColor')}</span></div>}
        <div className="flex flex-1 items-end p-2 text-[10px] font-semibold text-white/90" style={{ background: r.hex }}><span className="rounded bg-black/40 px-1.5">{locale !== 'km' && r.name_en ? r.name_en : r.name_km}</span></div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-lg leading-snug">{locale !== 'km' && r.name_en ? r.name_en : r.name_km}</h3>
          {level && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${level === 'exact' ? 'bg-verified-bg text-verified' : 'bg-review-bg text-review'}`}>{t(`paint.${level}`)}{dE !== undefined ? ` · ΔE ${dE}` : ''}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
          <span className="rounded-full bg-surface-low px-2 py-0.5">{t(`paint.surface.${r.surface}`)}</span>
          <span className="rounded-full bg-surface-low px-2 py-0.5">{t(`paint.finish.${r.finish}`)}</span>
        </div>
        {level === 'close' && <Notice tone="warn">{t('paint.closeWarn')}</Notice>}
        <button type="button" onClick={() => setPlaying(true)} className="btn-primary flex w-full items-center justify-center gap-2 !py-3 text-base">
          {t('steps.open')}
        </button>
        {playing && <StepPlayer recipe={r} onClose={() => setPlaying(false)} />}

        <div>
          <div className="mb-1.5 text-xs font-semibold text-gold">{t('paint.mix')}</div>
          {/* ratio bar */}
          <div className="mb-2 flex h-3 overflow-hidden rounded-full border border-hairline">
            {r.parts.map((p) => <span key={p.id} style={{ width: `${(p.parts / total) * 100}%`, background: p.color_hex ?? '#ccc' }} title={`${p.brand} ${p.name}`} />)}
          </div>
          <ul className="space-y-1.5">
            {r.parts.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 text-sm">
                {p.has_photo ? <img src={productPhoto(p)} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  : <span className="h-9 w-9 rounded-lg border border-hairline" style={{ background: p.color_hex ?? 'transparent' }} />}
                <span className="min-w-0 flex-1"><b>{p.brand}</b> {p.name}<span className="block text-[11px] text-muted">{t(`paint.kind.${p.kind}`)}</span></span>
                <span className="shrink-0 rounded-lg bg-charcoal px-2.5 py-1 font-mono text-sm text-gold">{p.parts} <span className="text-[10px] text-white/70">{t('paint.part')}</span></span>
              </li>
            ))}
          </ul>
        </div>
        {r.method && r.steps.length === 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-gold">{t('paint.method')}</div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{r.method}</p>
          </div>
        )}
        <p className="rounded-lg bg-review-bg px-3 py-2 text-xs">⚠️ {t('paint.safety')}</p>
      </div>
    </article>
  );
}

/**
 * Paint mixer: photograph the bag with white paper, tap the paper and the colour, get the mixing recipe.
 * A photo that fails a check gives the reasons and no colour; a colour with no recipe within ΔE 6 gives "no recipe".
 */
export default function Paint() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const [m, setM] = useState<Measurement | null>(null);
  const [res, setRes] = useState<MatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [recipes, setRecipes] = useState<PaintRecipe[] | null>(null);
  const [products, setProducts] = useState<PaintProduct[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hasLessons, setHasLessons] = useState(false);
  const voice = useUiVoice();

  useEffect(() => {
    api.get<{ recipes: PaintRecipe[] }>('/api/paint/recipes').then((r) => setRecipes(r.recipes)).catch(() => setRecipes([]));
    api.get<{ products: PaintProduct[] }>('/api/paint/products').then((r) => setProducts(r.products)).catch(() => {});
    api.get<{ lessons: unknown[] }>('/api/care/lessons').then((r) => setHasLessons(r.lessons.length > 0)).catch(() => {});
  }, []);

  const onScan = (meas: Measurement | null, issues: Issue[]) => {
    setRes(null); setErr(''); setSent(false);
    if (!meas || issues.length) { setM(null); return; }
    setM(meas); setBusy(true);
    api.post<MatchResult>('/api/paint/match', { measurement: meas })
      .then((r) => { setRes(r); voice.sayKey(r.matches[0]?.level === 'exact' ? 'paint.exact' : r.matches[0] ? 'paint.close' : 'paint.none'); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 422 ? t('paint.cannot') : errText(e)))
      .finally(() => setBusy(false));
  };

  const request = async () => {
    try { await api.post('/api/paint/requests', { measurement: m }); setSent(true); } catch (e) { setErr(errText(e)); }
  };

  return (
    <Page title={t('paint.title')} subtitle={t('paint.sub')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="rounded-2xl border border-hairline bg-surface-card p-4">
            <h2 className="mb-2 text-base">{t('paint.howTitle')}</h2>
            <ol className="grid gap-2 text-sm sm:grid-cols-3">
              {['paint.how1', 'paint.how2', 'paint.how3'].map((k, i) => (
                <li key={k} className="flex gap-2 rounded-xl bg-surface-low p-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-charcoal font-mono text-xs text-gold">{i + 1}</span>{t(k)}
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={voice.toggle} aria-pressed={voice.on}
            className={`rounded-full border px-4 py-2 text-sm ${voice.on ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>
            {voice.on ? '🔊' : '🔇'} {t('voice.guide')}
          </button>
          <ColorScanner onChange={onScan} onSay={voice.sayKey} />
        </section>

        <section className="space-y-3" aria-live="polite">
          {busy && <div className="animate-pulse rounded-2xl bg-surface-low p-6 text-sm text-muted">{t('paint.checking')}</div>}
          {err && <Notice tone="bad">{err}</Notice>}
          {res && res.matches.length > 0 && res.matches.map((x) => <RecipeCard key={x.recipe.id} r={x.recipe} mine={res.hex} level={x.level} dE={x.dE} />)}
          {res && res.matches.length === 0 && (
            <div className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
              <div className="flex items-center gap-3">
                <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: res.hex }} />
                <p className="text-sm">{t('paint.none')}</p>
              </div>
              {sent ? <Notice tone="ok">{t('paint.requested')}</Notice>
                : me?.id ? <button type="button" className="btn-primary" onClick={request}>{t('paint.request')}</button>
                  : <Link to="/login" className="btn-ghost inline-block">{t('paint.signInToRequest')}</Link>}
            </div>
          )}
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-xl">{t('paint.recipes')}</h2>
        {recipes && recipes.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {recipes?.map((r) => (
            <button key={r.id} type="button" onClick={() => setOpen(open === r.id ? null : r.id)}
              className={`overflow-hidden rounded-xl border text-left ${open === r.id ? 'border-charcoal ring-2 ring-gold' : 'border-hairline'}`}>
              <span className="block h-14" style={{ background: r.hex }} />
              <span className="block truncate bg-surface-card px-2 py-1 text-[11px]">{r.name_km}</span>
            </button>
          ))}
        </div>
        {open && recipes?.find((r) => r.id === open) && <div className="mt-3 max-w-xl"><RecipeCard r={recipes.find((r) => r.id === open)!} /></div>}
      </section>

      {products.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl">{t('paint.products')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <details key={p.id} className="rounded-2xl border border-hairline bg-surface-card p-3">
                <summary className="flex cursor-pointer items-center gap-3">
                  {p.has_photo ? <img src={productPhoto(p)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    : <span className="h-12 w-12 rounded-lg border border-hairline" style={{ background: p.color_hex ?? 'transparent' }} />}
                  <span className="min-w-0 flex-1 text-sm"><b>{p.brand}</b> {p.name}<span className="block text-[11px] text-muted">{t(`paint.kind.${p.kind}`)}</span></span>
                </summary>
                {p.info && <p className="mt-2 whitespace-pre-line text-sm">{p.info}</p>}
                {p.sources.length > 0 && (
                  <div className="mt-2 text-xs">
                    <div className="font-semibold text-muted">{t('paint.sources')}</div>
                    <ul className="mt-1 space-y-0.5">{p.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-gold underline">{s.title || s.url}</a></li>)}</ul>
                  </div>
                )}
              </details>
            ))}
          </div>
        </section>
      )}

      {hasLessons && <Link to="/restore" className="btn-ghost mt-8 inline-block">{t('paint.lessons')} →</Link>}
    </Page>
  );
}
