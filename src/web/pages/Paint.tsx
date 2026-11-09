import React, { useContext, useEffect, useRef, useState } from 'react';
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
import AiWorkspace from '../AiWorkspace.tsx';
import CameraCapture from '../CameraCapture.tsx';

export interface PaintPart { id: string; brand: string; name: string; kind: string; color_hex: string | null; parts: number; has_photo: boolean; updated_at: string }
export interface PaintRecipe {
  id: string; name_km: string; name_en: string | null; surface: string; finish: string; lab_l: number; lab_a: number; lab_b: number;
  hex: string; method: string | null; status: 'draft' | 'published'; has_photo: boolean; updated_at: string; parts: PaintPart[];
  mix_text: string | null; mix_audio: boolean; steps: PaintStep[];
}
export interface PaintStep { id: string; sort: number; text: string; icon: StepIcon | null; minutes: number | null; has_photo: boolean; audio: 'voice' | 'tts' | null; updated_at: string }
export interface PaintProduct {
  id: string; brand: string; name: string; kind: string; color_hex: string | null; info: string | null; active: number;
  code?: string | null; volume_ml?: number | null; base?: string | null;
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

interface LeatherGuess { surface: Leather | null; finish: 'matte' | 'satin' | 'gloss' | null; confidence: number; colour: string; condition: string; tip: string }
interface Method { prep: string[]; mix: string[]; apply: string[]; dry: string[]; avoid: string[]; tools: string[]; safety: string }
export interface TubeRead {
  brand: string | null; code: string | null; name: string | null; volume_ml: number | null; base: string | null; kind: string | null;
  colour: string; hex: string | null; transparent: boolean | null; confidence: number; label: string;
  uses: string[]; mixes: { with: string; makes: string }[]; leather_tip: string; inShop: { id: string } | null;
}
type Source = 'bag' | 'tube' | 'recipe';
type Finish = 'matte' | 'satin' | 'gloss';

/** 1 · 2 · 3 at the top; earlier steps can be tapped to go back. */
function Stepper({ step, steps, onGo }: { step: number; steps: string[]; onGo: (n: number) => void }) {
  return (
    <ol className="mb-4 flex items-center gap-1.5">
      {steps.map((label, i) => {
        const n = i + 1, done = n < step, on = n === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-1.5">
            <button type="button" disabled={!done} onClick={() => onGo(n)} className="flex min-w-0 items-center gap-1.5">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${on ? 'bg-gold text-charcoal' : done ? 'border border-gold text-gold' : 'border border-hairline text-muted'}`}>{done ? '✓' : n}</span>
              <span className={`truncate text-[11px] ${on ? 'font-semibold' : 'text-muted'}`}>{label}</span>
            </button>
            {n < steps.length && <span className={`h-px flex-1 ${done ? 'bg-gold' : 'bg-hairline'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** What the AI read on a paint tube, what it is good for and what to mix it with. */
function TubeCard({ r, admin }: { r: TubeRead; admin: boolean }) {
  const { t } = useI18n();
  const title = [r.brand, r.code, r.name].filter(Boolean).join(' · ');
  return (
    <article className="space-y-3 rounded-2xl border border-gold/40 bg-surface-card p-4">
      <div className="flex items-start gap-3">
        <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: r.hex ?? 'transparent' }} title={r.hex ?? ''} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-snug">{title || t('tube.unreadable')}</div>
          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted">
            {r.colour && <span>{r.colour}</span>}
            {r.volume_ml && <span>· {r.volume_ml} ml</span>}
            {r.base && <span>· {t(`tube.base.${r.base}`)}</span>}
            {r.transparent !== null && <span>· {r.transparent ? t('tube.transparent') : t('tube.opaque')}</span>}
          </div>
          <div className="mt-1 text-[11px]">{r.inShop ? <span className="text-verified">✓ {t('tube.inShop')}</span> : <span className="text-muted">{t('tube.notInShop')}{admin ? ` — ${t('tube.addHint')}` : ''}</span>}</div>
        </div>
        <span className="shrink-0 rounded-full bg-surface-low px-2 py-0.5 text-[10px] text-muted">{Math.round(r.confidence * 100)}%</span>
      </div>
      {r.confidence < 0.5 && <Notice tone="warn">{t('tube.lowConf')}</Notice>}
      <StepList title={t('tube.uses')} items={r.uses} numbered={false} />
      {r.mixes.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gold">{t('tube.mixes')}</div>
          <ul className="space-y-1 text-sm">{r.mixes.map((m, i) => <li key={i} className="flex gap-2"><span className="text-gold">＋</span><span><b>{m.with}</b> → {m.makes}</span></li>)}</ul>
          <p className="mt-1 text-[11px] text-muted">{t('tube.noRatio')}</p>
        </div>
      )}
      {r.leather_tip && <p className="rounded-xl bg-review-bg px-3 py-2 text-xs text-review">💡 {r.leather_tip}</p>}
    </article>
  );
}

/**
 * 🎨 Paint skill as a wizard (one thing at a time):
 * ① choose: scan the bag (smart camera; paper + colour found automatically; AI names the leather) · scan a paint tube
 *   (AI reads brand / code / name / volume and says what it is for) · pick a recipe;
 * ② what was detected — colour, leather, finish — each one tap to change;
 * ③ the mixing recipe (real recipes only; no recipe → "no recipe"), the AI method for that leather, and the workbench.
 */
export default function Paint() {
  const { t, locale } = useI18n();
  const me = useContext(MeContext);
  const admin = !!me && ['owner', 'lead_authenticator'].includes(me.role);
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source | null>(null);
  const [leather, setLeather] = useState<Leather | null>(null);
  const [finish, setFinish] = useState<Finish>('satin');
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
  const [guess, setGuess] = useState<LeatherGuess | null>(null);
  const [gBusy, setGBusy] = useState(false);
  const [gNote, setGNote] = useState<'member' | 'failed' | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [tube, setTube] = useState<TubeRead | null>(null);
  const [tBusy, setTBusy] = useState(false);
  const [tErr, setTErr] = useState('');
  const picked = useRef({ leather: false, finish: false });
  const voice = useUiVoice();

  useEffect(() => {
    api.get<{ recipes: PaintRecipe[] }>('/api/paint/recipes').then((r) => setRecipes(r.recipes)).catch(() => setRecipes([]));
    api.get<{ products: PaintProduct[] }>('/api/paint/products').then((r) => setProducts(r.products)).catch(() => {});
  }, []);
  useEffect(() => { setMethod(null); setMErr(''); setMember(false); }, [leather, finish, chosen]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step, source]);

  const restart = () => {
    setStep(1); setSource(null); setRes(null); setM(null); setChosen(null); setGuess(null); setGNote(null); setTube(null); setTErr('');
    setErr(''); setSent(false); setShowPicker(true); picked.current = { leather: false, finish: false };
  };

  /** AI looks at the bag photo: which leather and finish (pre-selects them unless the person already chose). */
  const onPhoto = async (f: File) => {
    setGuess(null); setGNote(null); setGBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const g = await api.post<LeatherGuess>('/api/skills/paint/leather', fd);
      setGuess(g);
      if (g.surface && g.confidence >= 0.5 && !picked.current.leather) { setLeather(g.surface); setShowPicker(false); }
      if (g.finish && g.confidence >= 0.5 && !picked.current.finish) setFinish(g.finish);
    } catch (e) { setGNote(isMembershipError(e) ? 'member' : 'failed'); } finally { setGBusy(false); }
  };
  const onScan = (meas: Measurement | null, issues: Issue[]) => {
    setRes(null); setErr(''); setSent(false); setChosen(null);
    if (!meas || issues.length) { setM(null); return; }
    setM(meas); setBusy(true);
    api.post<MatchResult>('/api/paint/match', { measurement: meas })
      .then((r) => { setRes(r); setChosen(r.matches[0]?.recipe ?? null); voice.sayKey(r.matches[0]?.level === 'exact' ? 'paint.exact' : r.matches[0] ? 'paint.close' : 'paint.none'); })
      .catch((e) => setErr(e instanceof ApiError && e.status === 422 ? t('paint.cannot') : errText(e)))
      .finally(() => setBusy(false));
  };
  const readTube = async (f: File) => {
    setTBusy(true); setTErr(''); setTube(null);
    try {
      const fd = new FormData(); fd.append('file', f); if (leather) fd.append('surface', leather);
      setTube(await api.post<TubeRead>('/api/paint/tube', fd)); setStep(2);
    } catch (e) {
      setTErr(isMembershipError(e) ? t('mb.neededBody') : e instanceof ApiError && e.status === 429 ? t('skill.tooMany') : e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
    } finally { setTBusy(false); }
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
  const steps = source === 'tube' ? [t('pw.s1'), t('pw.s2tube')] : [t('pw.s1'), t('pw.s2'), t('pw.s3')];
  const colourReady = source === 'recipe' ? !!chosen : !!res;

  const leatherBlock = (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">{t('skill.leather')}</div>
      {gBusy && <p className="mb-2 animate-pulse text-xs text-muted">🤖 {t('paint.aiLooking')}</p>}
      {guess && (
        <div className="mb-2 rounded-xl border border-gold/40 bg-gold-light px-3 py-2 text-xs">
          <div className="font-semibold">🤖 {guess.surface ? `${t('paint.aiSees')}: ${t(`paint.surface.${guess.surface}`)}${guess.finish ? ` · ${t(`paint.finish.${guess.finish}`)}` : ''} · ${Math.round(guess.confidence * 100)}%` : t('paint.aiUnsure')}</div>
          {guess.colour && <div className="text-muted">🎨 {guess.colour}</div>}
          {guess.condition && <div className="text-muted">⚠️ {guess.condition}</div>}
          {guess.tip && <div className="text-muted">💡 {guess.tip}</div>}
        </div>
      )}
      {gNote === 'member' && <p className="mb-2 text-xs text-muted">🤖 {t('paint.aiMember')}</p>}
      {leather && !showPicker ? (
        <div className="flex items-center gap-2 rounded-xl border border-gold bg-surface-card px-3 py-2 text-sm">
          <span className="flex-1"><b>{t(`paint.surface.${leather}`)}</b> <span className="text-xs text-muted">· {t(`skill.leatherSub.${leather}`)}</span></span>
          <button type="button" className="text-xs font-semibold text-gold" onClick={() => setShowPicker(true)}>{t('paint.change')}</button>
        </div>
      ) : <LeatherPicker value={leather} onChange={(v) => { picked.current.leather = true; setLeather(v); setShowPicker(false); }} />}
    </div>
  );
  const finishBlock = (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-muted">{t('paint.finishTitle')}</div>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-[13px]">
        {(['matte', 'satin', 'gloss'] as const).map((k) => <button key={k} type="button" onClick={() => { picked.current.finish = true; setFinish(k); }} aria-pressed={finish === k} className={`rounded-full px-3 py-1.5 ${finish === k ? 'bg-gold text-charcoal' : ''}`}>{t(`paint.finish.${k}`)}</button>)}
      </div>
    </div>
  );

  return (
    <Page title={`🎨 ${t('skill.paint')}`} subtitle={t('pw.sub')}>
      <div className="mx-auto max-w-xl">
        <Stepper step={step} steps={steps} onGo={(n) => { setStep(n); if (n === 1) restart(); }} />

        {/* ① choose how to start */}
        {step === 1 && !source && (
          <div className="space-y-2">
            {([['bag', '👜', 'pw.bag', 'pw.bagSub'], ['tube', '🧴', 'pw.tube', 'pw.tubeSub'], ['recipe', '🎨', 'pw.recipe', 'pw.recipeSub']] as const).map(([k, icon, title, sub], i) => (
              <button key={k} type="button" onClick={() => setSource(k)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition hover:border-gold ${i === 0 ? 'border-gold/50 bg-gold-light' : 'border-hairline bg-surface-card'}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${i === 0 ? 'bg-gold' : 'bg-surface-low'}`} aria-hidden>{icon}</span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{t(title)}</span><span className="block text-xs text-muted">{t(sub)}</span></span>
                <span className="text-gold" aria-hidden>→</span>
              </button>
            ))}
            {products.length > 0 && (
              <details className="mt-4 rounded-2xl border border-hairline bg-surface-card p-3">
                <summary className="cursor-pointer text-sm font-semibold">🧴 {t('paint.products')} · {products.length}</summary>
                <ul className="mt-2 divide-y divide-hairline">
                  {products.map((p) => (
                    <li key={p.id} className="flex items-center gap-2.5 py-2 text-sm">
                      {p.has_photo ? <img src={productPhoto(p)} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <span className="h-9 w-9 rounded-lg border border-hairline" style={{ background: p.color_hex ?? 'transparent' }} />}
                      <span className="min-w-0 flex-1"><b>{p.brand}</b> {p.code && <span className="font-mono text-xs text-gold">{p.code}</span>} {p.name}
                        <span className="block text-[11px] text-muted">{t(`paint.kind.${p.kind}`)}{p.base ? ` · ${t(`tube.base.${p.base}`)}` : ''}{p.volume_ml ? ` · ${p.volume_ml} ml` : ''}</span></span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {step === 1 && source === 'bag' && (
          <div className="space-y-3">
            <button type="button" onClick={voice.toggle} aria-pressed={voice.on}
              className={`rounded-full border px-3 py-1 text-xs ${voice.on ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>{voice.on ? '🔊' : '🔇'} {t('voice.guide')}</button>
            <ColorScanner onChange={onScan} onSay={voice.sayKey} onPhoto={onPhoto} />
            {busy && <div className="animate-pulse text-sm text-muted">{t('paint.checking')}</div>}
            {err && <Notice tone="bad">{err}</Notice>}
            <button type="button" className="btn-primary w-full !py-3" disabled={!colourReady} onClick={() => setStep(2)}>{t('pw.next')} →</button>
          </div>
        )}

        {step === 1 && source === 'tube' && (
          <div className="space-y-3">
            <p className="rounded-xl border border-hairline bg-surface-low px-3 py-2 text-xs text-muted">🧴 {t('tube.tip')}</p>
            <CameraCapture onCapture={readTube} locale={locale === 'km' ? 'km' : 'en'} disabled={tBusy} />
            {tBusy && <div className="animate-pulse text-sm text-muted">🤖 {t('tube.reading')}</div>}
            {tErr && <Notice tone="bad">{tErr}</Notice>}
          </div>
        )}

        {step === 1 && source === 'recipe' && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {recipes?.length === 0 && <p className="col-span-full text-sm text-muted">{t('noData')}</p>}
              {recipes?.map((r) => (
                <button key={r.id} type="button" onClick={() => { setChosen(r); setRes(null); setLeather(picked.current.leather ? leather : (r.surface as Leather)); setShowPicker(false); setFinish(r.finish as Finish); setStep(2); }}
                  className="overflow-hidden rounded-xl border border-hairline text-left hover:border-gold">
                  <span className="block h-12" style={{ background: r.hex }} />
                  <span className="block truncate bg-surface-card px-1.5 py-1 text-[10px]">{r.name_km}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ② what was detected */}
        {step === 2 && source === 'tube' && tube && (
          <div className="space-y-3">
            <TubeCard r={tube} admin={admin} />
            <AiWorkspace skill="paint" title={t('ws.paintTitle')} sub={t('tube.wsSub')}
              context={{ surface: leather, finish, tube: { brand: tube.brand, code: tube.code, name: tube.name, base: tube.base } }}
              chips={['tube.q1', 'tube.q2', 'tube.q3'].map((k) => t(k))} />
            <button type="button" className="btn-ghost w-full" onClick={() => { setTube(null); setStep(1); }}>🧴 {t('tube.another')}</button>
          </div>
        )}

        {step === 2 && source !== 'tube' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3">
              {res && <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: res.hex }} title={res.hex} />}
              {chosen && <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: chosen.hex }} title={chosen.hex} />}
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">{source === 'bag' ? t('paint.yourColor') : chosen?.name_km}</div>
                <div className="text-xs text-muted">{res ? res.hex : ''}{chosen && res ? ` → ${chosen.name_km}${match ? ` · ΔE ${match.dE}` : ''}` : ''}{source === 'bag' && res && !chosen ? ` · ${t('pw.noRecipeYet')}` : ''}</div>
              </div>
            </div>
            {leatherBlock}
            {finishBlock}
            <button type="button" className="btn-primary w-full !py-3" disabled={!leather} onClick={() => setStep(3)}>{t('pw.toRecipe')} →</button>
            {!leather && <p className="text-xs text-muted">{t('skill.pickLeather')}</p>}
          </div>
        )}

        {/* ③ recipe, method, workbench */}
        {step === 3 && (
          <div className="space-y-3" aria-live="polite">
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

            <AiWorkspace skill="paint" title={t('ws.paintTitle')} sub={t('ws.paintSub')}
              context={{ surface: leather, finish, recipeId: chosen?.id ?? null, lab: res?.lab ?? null, guess, method }}
              chips={['ws.pq1', 'ws.pq2', 'ws.pq3', 'ws.pq4', 'ws.pq5', 'ws.pq6'].map((k) => t(k))} />
          </div>
        )}

        {(step > 1 || source) && <button type="button" className="mt-4 w-full text-center text-xs text-muted underline" onClick={restart}>↺ {t('pw.restart')}</button>}
      </div>
    </Page>
  );
}
