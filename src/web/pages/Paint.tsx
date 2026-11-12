import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Notice, Page, errText } from '../ui.tsx';
import BagScan, { type ScanResult } from '../BagScan.tsx';
import Icon from '../Icon.tsx';
import type { Measurement } from '../../shared/color.ts';
import type { StepIcon } from '../../shared/voiceKeys.ts';
import StepPlayer from '../StepPlayer.tsx';
import LeatherPicker, { StepList, type Leather } from '../LeatherPicker.tsx';
import { MembershipNeeded, isMembershipError } from './Membership.tsx';
import AiWorkspace from '../AiWorkspace.tsx';
import AiBusy from '../AiBusy.tsx';
import { minutesIn } from '../../shared/stepMinutes.ts';
import { paintLabel } from '../../shared/paintKnowledge.ts';
import { inkOn, sharePercents } from '../../shared/mixShares.ts';

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
interface MatchResult { ok: true; approx?: boolean; lab: [number, number, number]; hex: string; matches: Match[]; nearest: number | null }

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
interface PaintPick { brand: string; code: string; name: string; parts: number; inShop: boolean; hex: string | null }
interface Method { paints: PaintPick[]; paintsFrom: 'recipe' | 'ai' | 'none'; paintsNote: string; steps?: string[]; prep: string[]; mix: string[]; apply: string[]; dry: string[]; avoid: string[]; tools: string[]; safety: string }
export interface TubeRead {
  brand: string | null; code: string | null; name: string | null; volume_ml: number | null; base: string | null; kind: string | null;
  colour: string; hex: string | null; transparent: boolean | null; confidence: number; label: string;
  uses: string[]; mixes: { with: string; makes: string }[]; leather_tip: string; inShop: { id: string } | null;
}
type Source = 'bag' | 'tube' | 'recipe';
type Finish = 'matte' | 'satin' | 'gloss';

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

/** Two standard buttons: the phone's own camera, or a photo already taken. */
function PhotoButtons({ onFile, disabled, camera, gallery }: { onFile: (f: File) => void; disabled?: boolean; camera: string; gallery: string }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); };
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className={`btn-primary flex cursor-pointer items-center justify-center gap-2 !py-3.5 text-base ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
        <Icon name="camera" />{camera}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} disabled={disabled} />
      </label>
      <label className={`btn-ghost flex cursor-pointer items-center justify-center gap-2 !py-3.5 text-base ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
        <Icon name="image" />{gallery}
        <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={disabled} />
      </label>
    </div>
  );
}

/**
 * 🎨 Paint skill, photo first (like a standard camera app):
 * take or choose one photo of the bag → the colour (automatic; a white paper next to the bag makes it accurate, but
 * it is not needed), the leather and finish (AI), the nearest real recipe (none → "no recipe", never a guess), the AI
 * method for that leather, and the workbench to ask anything. Other ways in: scan a paint tube, or pick a recipe.
 */
export default function Paint() {
  const { t, locale } = useI18n();
  const me = useContext(MeContext);
  const admin = !!me && ['owner', 'lead_authenticator'].includes(me.role);
  const [mode, setMode] = useState<Source | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [leather, setLeather] = useState<Leather | null>(null);
  const [finish, setFinish] = useState<Finish>('satin');
  const [res, setRes] = useState<MatchResult | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [chosen, setChosen] = useState<PaintRecipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [precise, setPrecise] = useState<Measurement | null>(null);
  const [recipes, setRecipes] = useState<PaintRecipe[] | null>(null);
  const [products, setProducts] = useState<PaintProduct[]>([]);
  const [method, setMethod] = useState<Method | null>(null);
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState('');
  const [follow, setFollow] = useState(false);
  const [added, setAdded] = useState<Set<number>>(new Set()); // paints ticked off while mixing
  const [member, setMember] = useState(false);
  const [guess, setGuess] = useState<LeatherGuess | null>(null);
  const [gBusy, setGBusy] = useState(false);
  const [gNote, setGNote] = useState<'member' | 'failed' | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [tube, setTube] = useState<TubeRead | null>(null);
  const [tBusy, setTBusy] = useState(false);
  const [tErr, setTErr] = useState('');
  const picked = useRef({ leather: false, finish: false });
  const seq = useRef(0);

  useEffect(() => {
    api.get<{ recipes: PaintRecipe[] }>('/api/paint/recipes').then((r) => setRecipes(r.recipes)).catch(() => setRecipes([]));
    api.get<{ products: PaintProduct[] }>('/api/paint/products').then((r) => setProducts(r.products)).catch(() => {});
  }, []);
  useEffect(() => { setMethod(null); setMErr(''); setMember(false); setAdded(new Set()); }, [leather, finish, chosen]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [mode, photo]);

  const restart = () => {
    setMode(null); setPhoto(null); setRes(null); setIssues([]); setChosen(null); setGuess(null); setGNote(null); setTube(null); setTErr('');
    setErr(''); setPrecise(null); setShowPicker(false); setLeather(null); picked.current = { leather: false, finish: false };
  };

  /** A new bag photo: the AI looks at the leather while the colour is measured on the phone. */
  const onBagPhoto = async (f: File) => {
    restart(); setMode('bag'); setPhoto(f); setGBusy(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const g = await api.post<LeatherGuess>('/api/skills/paint/leather', fd);
      setGuess(g);
      if (g.surface && g.confidence >= 0.5 && !picked.current.leather) setLeather(g.surface);
      else if (!picked.current.leather) setShowPicker(true);
      if (g.finish && g.confidence >= 0.5 && !picked.current.finish) setFinish(g.finish);
    } catch (e) { setGNote(isMembershipError(e) ? 'member' : 'failed'); if (!picked.current.leather) setShowPicker(true); } finally { setGBusy(false); }
  };
  const onScan = (r: ScanResult) => {
    const n = ++seq.current;
    setErr('');
    if (r.kind === 'issues') { setRes(null); setChosen(null); setIssues(r.issues); setPrecise(null); return; }
    setIssues([]); setBusy(true); setPrecise(r.kind === 'precise' ? r.measurement : null);
    api.post<MatchResult>('/api/paint/match', r.kind === 'precise' ? { measurement: r.measurement } : { quick: r.quick })
      .then((m) => { if (n !== seq.current) return; setRes(m); setChosen(m.matches[0]?.recipe ?? null); })
      .catch((e) => { if (n === seq.current) setErr(e instanceof ApiError && e.status === 422 ? t('paint.cannot') : errText(e)); })
      .finally(() => { if (n === seq.current) setBusy(false); });
  };
  const readTube = async (f: File) => {
    setTBusy(true); setTErr(''); setTube(null);
    try {
      const fd = new FormData(); fd.append('file', f); if (leather) fd.append('surface', leather);
      setTube(await api.post<TubeRead>('/api/paint/tube', fd));
    } catch (e) {
      setTErr(isMembershipError(e) ? t('mb.neededBody') : e instanceof ApiError && e.status === 429 ? t('skill.tooMany') : e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
    } finally { setTBusy(false); }
  };
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  /** Admin: put the paint the AI just read into the shop's paints (so the AI can name its code in mixes). */
  const addTube = async () => {
    if (!tube?.brand) return;
    setAdding(true); setTErr('');
    try {
      const fd = new FormData();
      const kinds = ['leather_paint', 'edge_paint', 'dye', 'finisher', 'preparer', 'cleaner', 'other'];
      fd.append('brand', tube.brand); fd.append('name', tube.name || tube.colour);
      fd.append('kind', tube.kind && kinds.includes(tube.kind) ? tube.kind : 'leather_paint');
      if (tube.code) fd.append('code', tube.code);
      if (tube.volume_ml) fd.append('volume_ml', String(tube.volume_ml));
      if (tube.base) fd.append('base', tube.base);
      if (tube.hex && /^#[0-9a-f]{6}$/i.test(tube.hex)) fd.append('color_hex', tube.hex.toLowerCase());
      await api.post('/api/admin/paint/products', fd);
      setAdded(true);
      api.get<{ products: PaintProduct[] }>('/api/paint/products').then((r) => setProducts(r.products)).catch(() => {});
    } catch (e) { setTErr(errText(e)); } finally { setAdding(false); }
  };
  const asked = useRef('');
  const askMethod = async () => {
    if (!leather) return;
    const body = { surface: leather, finish, recipeId: chosen?.id ?? null, colour: !chosen && res ? { hex: res.hex, lab: res.lab, approx: !!res.approx } : null };
    asked.current = JSON.stringify(body);
    setMBusy(true); setMErr(''); setMember(false);
    try { setMethod(await api.post<Method>('/api/skills/paint', body)); setAdded(new Set()); }
    catch (e) {
      if (isMembershipError(e)) setMember(true);
      else setMErr(e instanceof ApiError && e.status === 429 ? t('skill.tooMany') : e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
    } finally { setMBusy(false); }
  };
  const match = res?.matches.find((x) => x.recipe.id === chosen?.id);
  // the result comes by itself: once the colour (or a recipe) and the leather are known, ask the AI (once per change)
  useEffect(() => {
    if (!leather || gBusy || mBusy || method || mErr || member) return;
    if (mode === 'bag' ? !res : mode === 'recipe' ? !chosen : true) return;
    const body = JSON.stringify({ surface: leather, finish, recipeId: chosen?.id ?? null, colour: !chosen && res ? { hex: res.hex, lab: res.lab, approx: !!res.approx } : null });
    if (body === asked.current) return;
    const id = setTimeout(askMethod, 400);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leather, finish, chosen, res, gBusy, mode, method, mErr, member]);

  /** Leather + finish, each one tap to change. */
  const details = (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted">{t('skill.leather')}{gBusy && <span className="animate-pulse font-normal">· 🤖 {t('paint.aiLooking')}</span>}</div>
        {leather && !showPicker ? (
          <button type="button" onClick={() => setShowPicker(true)} className="flex w-full items-center gap-2 rounded-xl border border-hairline bg-surface-low px-3 py-2.5 text-left text-sm">
            <span className="min-w-0 flex-1"><b>{t(`paint.surface.${leather}`)}</b>
              <span className="block text-[11px] text-muted">{guess?.surface === leather ? `🤖 ${t('pn.aiPicked')} · ${Math.round((guess?.confidence ?? 0) * 100)}%` : t(`skill.leatherSub.${leather}`)}</span></span>
            <span className="text-xs font-semibold text-gold">{t('paint.change')}</span>
          </button>
        ) : !gBusy && <LeatherPicker value={leather} onChange={(v) => { picked.current.leather = true; setLeather(v); setShowPicker(false); }} />}
        {gNote === 'member' && <p className="mt-1 text-[11px] text-muted">🤖 {t('paint.aiMember')}</p>}
        {guess && (guess.condition || guess.tip) && (
          <div className="mt-2 space-y-0.5 rounded-xl bg-surface-low px-3 py-2 text-xs text-muted">
            {guess.condition && <div>⚠️ {guess.condition}</div>}
            {guess.tip && <div>💡 {guess.tip}</div>}
          </div>
        )}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold text-muted">{t('paint.finishTitle')}</div>
        <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-[13px]">
          {(['matte', 'satin', 'gloss'] as const).map((k) => <button key={k} type="button" onClick={() => { picked.current.finish = true; setFinish(k); }} aria-pressed={finish === k} className={`rounded-full px-3 py-1.5 ${finish === k ? 'bg-gold text-charcoal' : ''}`}>{t(`paint.finish.${k}`)}</button>)}
        </div>
      </div>
    </div>
  );

  /** The picture of the mix: each paint as drops in its colour, "+", then "=" the colour to reach. */
  /** One bar for the whole mix: each paint's width is its share of the drops, then the bag colour to aim for. */
  const MixBar = ({ paints, target }: { paints: PaintPick[]; target: string | null }) => {
    const pct = sharePercents(paints.map((p) => p.parts));
    const total = paints.reduce((a, p) => a + p.parts, 0);
    return (
      <div className="space-y-2 rounded-2xl bg-surface-low p-3">
        <div className="flex items-stretch gap-3">
          <div className="flex h-14 min-w-0 flex-1 overflow-hidden rounded-xl border border-hairline" role="img"
            aria-label={paints.map((p, k) => `${paintLabel(p, locale).main} ${p.parts} ${t('pn.drops')}`).join(', ')}>
            {paints.map((p, k) => (
              <span key={k} className="flex min-w-[22px] items-center justify-center font-mono text-sm font-bold"
                style={{ flexGrow: p.parts, flexBasis: 0, background: p.hex ?? '#888888', color: inkOn(p.hex) }}>{pct[k] >= 9 ? p.parts : ''}</span>
            ))}
          </div>
          {target && (
            <span className="flex shrink-0 flex-col items-center justify-center">
              <span className="h-14 w-14 rounded-xl border-2 border-gold" style={{ background: target }} />
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{t('pn.totalDrops').replace('{n}', String(total))}</span>
          {target && <span>{t('pn.target')} ↑</span>}
        </div>
      </div>
    );
  };

  /** ② paints with codes + the mix picture · ③ short steps · ④ chat about this job, right below. */
  const methodAndChat = (
    <>
      <section className="space-y-3 rounded-2xl border border-gold/40 bg-surface-card p-4" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-mono text-xs text-charcoal">2</span>{t('pn.mixTitle')}</div>
        {!leather && <p className="text-sm text-muted">{t('skill.pickLeather')}</p>}
        {mBusy && <div className="space-y-2" aria-label={t('skill.thinking')}><div className="h-24 animate-pulse rounded-2xl bg-surface-low" /><p className="text-xs text-muted">🤖 {t('pn.aiWorking')}</p></div>}
        {member && <MembershipNeeded />}
        {mErr && <><Notice tone="bad">{mErr}</Notice><button type="button" className="btn-ghost w-full" onClick={askMethod}>{t('pn.tryAgain')}</button></>}
        {method && (method.paints.length > 0 ? (
          <>
            <MixBar paints={method.paints} target={chosen?.hex ?? res?.hex ?? null} />
            <p className="px-1 text-xs text-muted">👆 {t('pn.tapAdded')}</p>
            <ul className="space-y-2">
              {method.paints.map((p, i) => {
                const lbl = paintLabel(p, locale), done = added.has(i), pct = sharePercents(method.paints.map((x) => x.parts))[i];
                return (
                  <li key={i}>
                    <button type="button" aria-pressed={done}
                      onClick={() => setAdded((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${done ? 'border-gold/60 bg-gold/10' : 'border-transparent bg-surface-low'}`}>
                      <span className="relative h-11 w-11 shrink-0 rounded-full border border-hairline shadow-inner" style={{ background: p.hex ?? 'transparent' }}>
                        {done && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-lg font-bold text-white">✓</span>}
                      </span>
                      <span className={`min-w-0 flex-1 ${done ? 'opacity-60' : ''}`}>
                        <span className="block text-base font-semibold leading-snug">{lbl.main}{lbl.code && <span className="ml-1.5 font-mono text-gold">{lbl.code}</span>}</span>
                        <span className="block text-xs text-muted">{lbl.sub || (p.code ? '' : t('pn.anyBrand'))}{p.inShop && <span className="ml-1 text-verified">✓ {t('pn.inShop')}</span>}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="font-mono text-2xl font-bold leading-none text-gold">{p.parts}</span>
                        <span className="text-[11px] text-muted">{t('pn.drops')} · {pct}%</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(() => {
              const missing = method.paints.filter((p) => !p.inShop && p.code).length;
              return missing > 0 ? <p className="px-1 text-[11px] text-muted">ⓘ {t('pn.missingCount').replace('{n}', String(missing))}</p> : null;
            })()}
            <p className="rounded-xl bg-surface-low px-3 py-2 text-xs leading-relaxed">💧 {t('pn.mixLighter')}</p>
            {method.paintsFrom === 'ai' && <p className="text-[11px] leading-relaxed text-review">✨ {t('pn.aiMix')}{method.paintsNote ? ` ${method.paintsNote}` : ''}</p>}
          </>
        ) : <p className="text-sm text-muted">{t('pn.noPaints')}</p>)}
      </section>

      {method && (
        <section className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-mono text-xs text-charcoal">3</span>{t('pn.how')}</div>
          <StepList title="" items={method.steps?.length ? method.steps : [...method.prep, ...method.mix, ...method.apply, ...method.dry].slice(0, 6)} />
          {/* the same paints and steps, one big card at a time (with voice and drying timers); shop recipes have their own player above */}
          {!(chosen && chosen.steps.length > 0) && (
            <button type="button" onClick={() => setFollow(true)} className="btn-primary flex w-full items-center justify-center gap-2 !py-3 text-base">▶ {t('pn.follow')}</button>
          )}
          {follow && (
            <StepPlayer onClose={() => setFollow(false)} recipe={{
              id: 'method', name_km: guess?.colour || t('paint.yourColor'), name_en: null, surface: leather ?? 'other', finish, lab_l: 0, lab_a: 0, lab_b: 0,
              hex: chosen?.hex ?? res?.hex ?? '#888888', method: null, status: 'published', has_photo: false, updated_at: '', mix_text: null, mix_audio: false,
              parts: method.paints.map((p, i) => ({ id: String(i), brand: paintLabel(p, locale).main, name: paintLabel(p, locale).code, kind: '', color_hex: p.hex, parts: p.parts, has_photo: false, updated_at: '' })),
              steps: (method.steps?.length ? method.steps : [...method.prep, ...method.mix, ...method.apply, ...method.dry].slice(0, 6))
                .map((text, i) => ({ id: `m${i}`, sort: i, text, icon: null, minutes: minutesIn(text), has_photo: false, audio: null, updated_at: '' })),
            }} />
          )}
          {(method.avoid.length > 0 || method.tools.length > 0 || method.safety) && (
            <details className="rounded-xl bg-surface-low px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted">{t('pn.more')}</summary>
              <div className="mt-3 space-y-3">
                <StepList title={t('skill.avoid')} items={method.avoid} numbered={false} />
                <StepList title={t('paint.m.tools')} items={method.tools} numbered={false} />
                {method.safety && <p className="text-xs text-review">⚠️ {method.safety}</p>}
              </div>
            </details>
          )}
        </section>
      )}

      {/* the chat comes with the answer it is about: nothing to ask before the paints and steps are there */}
      {method && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-mono text-xs text-charcoal">4</span>{t('pn.chatTitle')}</div>
          <AiWorkspace skill="paint"
            context={{ surface: leather, finish, recipeId: chosen?.id ?? null, lab: res?.lab ?? null, approxColour: res?.approx ?? null, guess, paints: method?.paints ?? null, steps: method?.steps ?? null }} />
        </section>
      )}
    </>
  );

  return (
    <Page title={`🎨 ${t('skill.paint')}`} subtitle={t('pn.sub')}>
      <AiBusy show={busy || gBusy || mBusy} stages={busy ? ['aib.measure'] : gBusy ? ['aib.leather'] : ['aib.mix', 'aib.steps']} />
      <div className="mx-auto max-w-xl space-y-4">
        {mode && <button type="button" onClick={restart} className="flex items-center gap-1 text-sm text-muted">← {t('pn.back')}</button>}

        {/* start: one photo */}
        {!mode && (
          <>
            <section className="space-y-4 rounded-3xl border border-gold/40 bg-surface-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold text-charcoal" aria-hidden><Icon name="camera" size={28} /></span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug">{t('pn.startTitle')}</h2>
                  <p className="text-xs text-muted">{t('pn.startSub')}</p>
                </div>
              </div>
              <PhotoButtons onFile={onBagPhoto} camera={t('pn.camera')} gallery={t('pn.gallery')} />
              <ol className="grid grid-cols-3 gap-2 text-center text-[11px] leading-snug text-muted">
                {['pn.how1', 'pn.how2', 'pn.how3'].map((k, i) => (
                  <li key={k} className="rounded-xl bg-surface-low px-1.5 py-2"><span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold/20 font-mono text-[11px] font-bold text-gold">{i + 1}</span>{t(k)}</li>
                ))}
              </ol>
              {/* the white sheet is found by itself (autoSpots); say so up front instead of hiding it in a tip */}
              <div className="rounded-xl border border-gold/30 bg-surface-low px-3 py-2 text-xs leading-relaxed">
                <p className="font-semibold">📄 {t('pn.whiteAuto')}</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-muted">{t('pn.whiteWhy')}</summary>
                  <p className="mt-1 text-muted">{t('pn.paperA')}</p>
                </details>
              </div>
            </section>

            <div className="space-y-2">
              <div className="px-1 text-xs font-semibold text-muted">{t('pn.other')}</div>
              {([['recipe', 'palette', 'pw.recipe', 'pw.recipeSub']] as const).map(([k, icon, title, sub]) => (
                <button key={k} type="button" onClick={() => { restart(); setMode(k); }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3.5 text-left hover:border-gold">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-low text-gold" aria-hidden><Icon name={icon} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t(title)}</span><span className="block text-xs text-muted">{t(sub)}</span></span>
                  <span className="text-muted" aria-hidden>›</span>
                </button>
              ))}
            </div>

            {products.length > 0 && (
              <details className="rounded-2xl border border-hairline bg-surface-card p-3">
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
          </>
        )}

        {/* bag photo → result */}
        {mode === 'bag' && photo && (
          <>
            <BagScan file={photo} onResult={onScan} />
            <div className="flex gap-2 text-xs">
              <label className="btn-ghost flex flex-1 cursor-pointer items-center justify-center gap-1.5 !py-2"><Icon name="camera" size={16} />{t('pn.retake')}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onBagPhoto(f); }} /></label>
              <label className="btn-ghost flex flex-1 cursor-pointer items-center justify-center gap-1.5 !py-2"><Icon name="image" size={16} />{t('pn.gallery')}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onBagPhoto(f); }} /></label>
            </div>

            <section className="space-y-4 rounded-2xl border border-gold/40 bg-surface-card p-4" aria-live="polite">
              <div className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold font-mono text-xs text-charcoal">1</span>{t('pn.result')}</div>
              {issues.length > 0 ? (
                <div className="rounded-xl bg-counterfeit-bg px-3 py-2 text-sm">
                  <p className="font-semibold">{t('pn.spotBad')}</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">{issues.map((i) => <li key={i}>{t(`paint.issue.${i}`)}</li>)}</ul>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="h-16 w-16 shrink-0 rounded-2xl border border-hairline" style={{ background: res?.hex ?? 'transparent' }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{guess?.colour || t('paint.yourColor')}</div>
                    <div className="font-mono text-xs text-muted">{busy ? '…' : res?.hex ?? ''}</div>
                    {res && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${res.approx ? 'bg-review-bg text-review' : 'bg-verified-bg text-verified'}`}>{res.approx ? t('pn.approx') : t('pn.accurate')}</span>}
                  </div>
                </div>
              )}
              {res?.approx && <p className="text-[11px] leading-relaxed text-muted">{t('pn.approxNote')}</p>}
              {err && <Notice tone="bad">{err}</Notice>}
              {details}
            </section>

            {res && res.matches.length > 0 && (
              <section className="space-y-3">
                <div className="px-1 text-xs font-semibold uppercase tracking-wider text-gold">{t('pn.recipe')}</div>
                {res.matches.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {res.matches.map((x) => <button key={x.recipe.id} type="button" onClick={() => setChosen(x.recipe)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chosen?.id === x.recipe.id ? 'border-gold' : 'border-hairline'}`}><span className="h-3 w-3 rounded-full" style={{ background: x.recipe.hex }} />{x.recipe.name_km} · ΔE {x.dE}</button>)}
                  </div>
                )}
                {chosen && <RecipeCard r={chosen} mine={res.hex} level={match?.level} dE={match?.dE} />}
                {chosen && leather && chosen.surface !== leather && chosen.surface !== 'other' && <Notice tone="warn">{t('paint.otherSurface').replace('{a}', t(`paint.surface.${chosen.surface}`)).replace('{b}', t(`paint.surface.${leather}`))}</Notice>}
              </section>
            )}
            {methodAndChat}
          </>
        )}

        {/* paint tube */}
        {mode === 'tube' && (
          <>
            {!tube && (
              <section className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
                <div className="font-semibold">🧴 {t('pw.tube')}</div>
                <p className="text-xs text-muted">{t('tube.tip')}</p>
                <PhotoButtons onFile={readTube} disabled={tBusy} camera={t('pn.camera')} gallery={t('pn.gallery')} />
                {tBusy && <div className="animate-pulse text-sm text-muted">🤖 {t('tube.reading')}</div>}
                {tErr && <Notice tone="bad">{tErr}</Notice>}
              </section>
            )}
            {tube && (
              <>
                <TubeCard r={tube} admin={admin} />
                {admin && !tube.inShop && tube.brand && (tube.name || tube.colour) && (
                  added ? <Notice tone="ok">✓ {t('pn.added')}</Notice>
                    : <button type="button" className="btn-primary flex w-full items-center justify-center gap-2" disabled={adding} onClick={addTube}><Icon name="plus" size={18} />{adding ? '…' : t('pn.addToShop')}</button>
                )}
                {tErr && <Notice tone="bad">{tErr}</Notice>}
                <AiWorkspace skill="paint" title={t('pn.chatTitle')}
                  context={{ surface: leather, finish, tube: { brand: tube.brand, code: tube.code, name: tube.name, base: tube.base } }}
                  chips={['tube.q1', 'tube.q2', 'tube.q3'].map((k) => t(k))} />
                <button type="button" className="btn-ghost w-full" onClick={() => { setTube(null); setAdded(false); }}>🧴 {t('tube.another')}</button>
              </>
            )}
          </>
        )}

        {/* pick a recipe */}
        {mode === 'recipe' && !chosen && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {recipes?.length === 0 && <p className="col-span-full text-sm text-muted">{t('noData')}</p>}
            {recipes?.map((r) => (
              <button key={r.id} type="button" onClick={() => { setChosen(r); setLeather(r.surface === 'other' ? null : r.surface as Leather); setShowPicker(r.surface === 'other'); setFinish(r.finish as Finish); }}
                className="overflow-hidden rounded-xl border border-hairline text-left hover:border-gold">
                <span className="block h-12" style={{ background: r.hex }} />
                <span className="block truncate bg-surface-card px-1.5 py-1 text-[10px]">{r.name_km}</span>
              </button>
            ))}
          </div>
        )}
        {mode === 'recipe' && chosen && (
          <>
            <RecipeCard r={chosen} />
            <section className="rounded-2xl border border-hairline bg-surface-card p-4">{details}</section>
            {methodAndChat}
          </>
        )}
      </div>
    </Page>
  );
}
