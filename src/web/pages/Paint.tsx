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
import LeatherPicker, { StepList, type Leather } from '../LeatherPicker.tsx';
import { MembershipNeeded, isMembershipError } from './Membership.tsx';

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

interface Method { prep: string[]; mix: string[]; apply: string[]; dry: string[]; avoid: string[]; tools: string[]; safety: string }

/**
 * 🎨 Paint skill: ① which leather ② which finish ③ which colour (scan with white paper, or pick a recipe) →
 * the mixing recipe (only real recipes; a colour without one gives "no recipe") + the AI method for that leather.
 */
export default function Paint() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const [leather, setLeather] = useState<Leather | null>(null);
  const [finish, setFinish] = useState<'matte' | 'satin' | 'gloss'>('satin');
  const [mode, setMode] = useState<'scan' | 'pick'>('scan');
  const [m, setM] = useState<Measurement | null>(null);
  const [res, setRes] = useState<MatchResult | null>(null);
  const [chosen, setChosen] = useState<PaintRecipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [recipes, setRecipes] = useState<PaintRecipe[] | null>(null);
  const [products, setProducts] = useState<PaintProduct[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState('');
  const [member, setMember] = useState(false);
  const voice = useUiVoice();

  useEffect(() => {
    api.get<{ recipes: PaintRecipe[] }>('/api/paint/recipes').then((r) => setRecipes(r.recipes)).catch(() => setRecipes([]));
    api.get<{ products: PaintProduct[] }>('/api/paint/products').then((r) => setProducts(r.products)).catch(() => {});
  }, []);
  useEffect(() => { setMethod(null); setMErr(''); setMember(false); }, [leather, finish, chosen]);

  const onScan = (meas: Measurement | null, issues: Issue[]) => {
    setRes(null); setErr(''); setSent(false); setChosen(null);
    if (!meas || issues.length) { setM(null); return; }
    setM(meas); setBusy(true);
    api.post<MatchResult>('/api/paint/match', { measurement: meas })
      .then((r) => { setRes(r); setChosen(r.matches[0]?.recipe ?? null); voice.sayKey(r.matches[0]?.level === 'exact' ? 'paint.exact' : r.matches[0] ? 'paint.close' : 'paint.none'); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 422 ? t('paint.cannot') : errText(e)))
      .finally(() => setBusy(false));
  };
  const request = async () => {
    try { await api.post('/api/paint/requests', { measurement: m }); setSent(true); } catch (e) { setErr(errText(e)); }
  };
  const askMethod = async () => {
    if (!leather) return;
    setMBusy(true); setMErr(''); setMember(false);
    try { setMethod(await api.post<Method>('/api/skills/paint', { surface: leather, finish, recipeId: chosen?.id ?? null })); }
    catch (e) {
      if (isMembershipError(e)) setMember(true);
      else setMErr(e instanceof ApiError && e.status === 429 ? t('skill.tooMany') : e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
    } finally { setMBusy(false); }
  };
  const match = res?.matches.find((x) => x.recipe.id === chosen?.id);

  return (
    <Page title={`🎨 ${t('skill.paint')}`} subtitle={t('paint.skillSub')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4">
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">① {t('skill.leather')}</h2>
            <LeatherPicker value={leather} onChange={setLeather} />
          </div>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">② {t('paint.finishTitle')}</h2>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-sm">
              {(['matte', 'satin', 'gloss'] as const).map((k) => <button key={k} type="button" onClick={() => setFinish(k)} aria-pressed={finish === k} className={`rounded-full px-3 py-1.5 ${finish === k ? 'bg-gold text-charcoal' : ''}`}>{t(`paint.finish.${k}`)}</button>)}
            </div>
          </div>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">③ {t('paint.colorTitle')}</h2>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface-low p-1 text-sm">
              <button type="button" onClick={() => setMode('scan')} className={`rounded-full px-3 py-1.5 ${mode === 'scan' ? 'bg-gold text-charcoal' : ''}`}>📷 {t('paint.modeScan')}</button>
              <button type="button" onClick={() => setMode('pick')} className={`rounded-full px-3 py-1.5 ${mode === 'pick' ? 'bg-gold text-charcoal' : ''}`}>🎨 {t('paint.modePick')}</button>
            </div>
            {mode === 'scan' ? (
              <div className="space-y-3">
                <button type="button" onClick={voice.toggle} aria-pressed={voice.on}
                  className={`rounded-full border px-4 py-1.5 text-xs ${voice.on ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>{voice.on ? '🔊' : '🔇'} {t('voice.guide')}</button>
                <ColorScanner onChange={onScan} onSay={voice.sayKey} />
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {recipes?.length === 0 && <p className="col-span-full text-sm text-muted">{t('noData')}</p>}
                {recipes?.map((r) => (
                  <button key={r.id} type="button" onClick={() => { setChosen(chosen?.id === r.id ? null : r); setRes(null); }} aria-pressed={chosen?.id === r.id}
                    className={`overflow-hidden rounded-xl border text-left ${chosen?.id === r.id ? 'border-gold ring-2 ring-gold' : 'border-hairline'}`}>
                    <span className="block h-12" style={{ background: r.hex }} />
                    <span className="block truncate bg-surface-card px-1.5 py-1 text-[10px]">{r.name_km}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3" aria-live="polite">
          {busy && <div className="animate-pulse rounded-2xl bg-surface-low p-6 text-sm text-muted">{t('paint.checking')}</div>}
          {err && <Notice tone="bad">{err}</Notice>}
          {res && res.matches.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {res.matches.map((x) => <button key={x.recipe.id} type="button" onClick={() => setChosen(x.recipe)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chosen?.id === x.recipe.id ? 'border-gold' : 'border-hairline'}`}><span className="h-3 w-3 rounded-full" style={{ background: x.recipe.hex }} />{x.recipe.name_km} · ΔE {x.dE}</button>)}
            </div>
          )}
          {chosen && <RecipeCard r={chosen} mine={res?.hex} level={match?.level} dE={match?.dE} />}
          {chosen && leather && chosen.surface !== leather && chosen.surface !== 'other' && <Notice tone="warn">{t('paint.otherSurface').replace('{a}', t(`paint.surface.${chosen.surface}`)).replace('{b}', t(`paint.surface.${leather}`))}</Notice>}
          {res && res.matches.length === 0 && (
            <div className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
              <div className="flex items-center gap-3">
                <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: res.hex }} />
                <p className="text-sm">{t('paint.none')}</p>
              </div>
              {sent ? <Notice tone="ok">{t('paint.requested')}</Notice>
                : me?.id ? <button type="button" className="btn-ghost" onClick={request}>{t('paint.request')}</button>
                  : <Link to="/login" className="btn-ghost inline-block">{t('paint.signInToRequest')}</Link>}
            </div>
          )}

          {/* the AI method for this leather */}
          <div className="space-y-3 rounded-2xl border border-gold/40 bg-surface-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold text-charcoal" aria-hidden>✦</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t('paint.methodTitle')}</div>
                <div className="text-xs text-muted">{leather ? `${t(`paint.surface.${leather}`)} · ${t(`paint.finish.${finish}`)}${chosen ? ` · ${chosen.name_km}` : ''}` : t('skill.pickLeather')}</div>
              </div>
            </div>
            {!method && <button type="button" className="btn-primary w-full !py-3" disabled={!leather || mBusy} onClick={askMethod}>{mBusy ? t('skill.thinking') : t('paint.askMethod')}</button>}
            {member && <MembershipNeeded />}
            {mErr && <Notice tone="bad">{mErr}</Notice>}
            {method && (
              <div className="space-y-4">
                <StepList title={t('paint.m.prep')} items={method.prep} />
                <StepList title={t('paint.m.mix')} items={method.mix} />
                <StepList title={t('paint.m.apply')} items={method.apply} />
                <StepList title={t('paint.m.dry')} items={method.dry} />
                <StepList title={t('skill.avoid')} items={method.avoid} numbered={false} />
                <StepList title={t('paint.m.tools')} items={method.tools} numbered={false} />
                {method.safety && <p className="rounded-xl bg-review-bg px-3 py-2 text-xs text-review">⚠️ {method.safety}</p>}
                <p className="text-[11px] text-muted">{t('skill.aiNote')}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {products.length > 0 && (
        <details className="mt-8 rounded-2xl border border-hairline bg-surface-card p-4">
          <summary className="cursor-pointer text-base font-semibold">{t('paint.products')} · {products.length}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <details key={p.id} className="rounded-xl border border-hairline bg-surface-low p-3">
                <summary className="flex cursor-pointer items-center gap-3">
                  {p.has_photo ? <img src={productPhoto(p)} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    : <span className="h-12 w-12 rounded-lg border border-hairline" style={{ background: p.color_hex ?? 'transparent' }} />}
                  <span className="min-w-0 flex-1 text-sm"><b>{p.brand}</b> {p.name}<span className="block text-[11px] text-muted">{t(`paint.kind.${p.kind}`)}</span></span>
                </summary>
                {p.info && <p className="mt-2 whitespace-pre-line text-sm">{p.info}</p>}
                {p.sources.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs">{p.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer" className="break-all text-gold underline">{x.title || x.url}</a></li>)}</ul>
                )}
              </details>
            ))}
          </div>
        </details>
      )}
    </Page>
  );
}
