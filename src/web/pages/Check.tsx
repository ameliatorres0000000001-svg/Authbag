import React, { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import AiBusy from '../AiBusy.tsx';
import { MeContext } from '../App.tsx';
import { STAFF_ROLES } from '../studio.ts';
import BrandPicker, { type BrandChoice } from '../BrandPicker.tsx';
import { api as apiClient, ApiError } from '../api.ts';
import { errText } from '../ui.tsx';
import { STEPS } from './Verify.tsx';
import { MembershipNeeded, isMembershipError } from './Membership.tsx';

interface ShotRef { id: string; title: string | null }
interface Shot { step: number; part: string; title: string; hint: string; refs: ShotRef[] }
interface Identity {
  brandId: string | null; brandName: string | null; modelId: string | null; modelName: string | null; confidence: number; clues: string; otherBrandId: string | null;
  size?: string | null; material?: string | null; desc?: string | null; shots?: Shot[];
}


const ICON: Record<string, string> = {
  photo: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  nfc: 'M6 18a8 8 0 0 1 0-12M9.5 15a4 4 0 0 1 0-6M18 6a8 8 0 0 1 0 12M14.5 9a4 4 0 0 1 0 6',
  code: 'M4 7h16M4 12h10M4 17h7',
  official: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4',
};

/**
 * Check a bag: one photo of the whole bag → AI recognises the brand and model it is styled as (identification
 * only, never genuine/fake) → the customer confirms or corrects it → the list of details to photograph → the
 * photo steps. A HENGZ expert answers; a bag found consistent with our references can receive a HENGZ certificate.
 */
export default function Check() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [tax, setTax] = useState<{ brands: { id: string; name: string; slug: string }[]; models: { id: string; brand_id: string; name: string }[] } | null>(null);
  const [meta, setMeta] = useState<{ trial: { used: number; limit: number; unlimited: boolean }; telegram: boolean; expertReview?: boolean; precheck?: { used: number; limit: number } | null } | null>(null);
  const ai = meta?.expertReview === false;
  const [choice, setChoice] = useState<BrandChoice | null>(() => { try { const v = sessionStorage.getItem('hz_brand2'); return v ? JSON.parse(v) : null; } catch { return null; } });
  const brandId = choice?.brandId ?? '';
  const [model, setModel] = useState('');
  const [hint, setHint] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  const [idBusy, setIdBusy] = useState(false);
  const [ident, setIdent] = useState<Identity | null>(null);
  const [idErr, setIdErr] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [needMember, setNeedMember] = useState(false);
  const [zoom, setZoom] = useState<ShotRef | null>(null);
  const [open, setOpen] = useState<number | null>(null); // which "how to shoot" row is open
  const identify = async (f: File) => {
    setIdErr(''); setIdent(null); setManual(false); setOpen(null); setIdBusy(true);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await apiClient.post<Identity>('/api/verify/identify', fd);
      setIdent(r);
      if (r.brandId && r.confidence >= 0.5) { pick({ brandId: r.brandId }); setModel(r.modelName ?? ''); }
      else if (!r.brandId && r.brandName && r.otherBrandId && r.confidence >= 0.5) { pick({ brandId: r.otherBrandId, brandText: r.brandName }); setModel(r.modelName ?? ''); }
      else { pick(null); setManual(true); }
    } catch (e) {
      if (isMembershipError(e)) { setNeedMember(true); setIdBusy(false); return; }
      setIdErr(e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('ck.aiOff') : e instanceof ApiError && e.body?.error === 'too_many' ? t('ck.tooMany') : errText(e));
      setManual(true);
    } finally { setIdBusy(false); }
  };
  const loadTax = () => api.get('/api/taxonomy').then(setTax).catch(() => setTax({ brands: [], models: [] }));
  useEffect(() => {
    loadTax();
    api.get('/api/verify/meta').then(setMeta).catch(() => {});
  }, []);
  const pick = (v: BrandChoice | null) => { setChoice(v); setModel(''); setHint(false); try { if (v) sessionStorage.setItem('hz_brand2', JSON.stringify(v)); else sessionStorage.removeItem('hz_brand2'); } catch { /* ignore */ } };
  const trialLeft = meta ? Math.max(0, meta.trial.limit - meta.trial.used) : null;
  // with a brand chosen, Scan / Upload open the photo steps directly
  const go = (m: 'scan' | 'upload') => brandId
    ? `/verify?${new URLSearchParams({ mode: m, brandId, ...(choice?.brandText ? { brandText: choice.brandText } : {}), ...(model.trim() ? { model: model.trim() } : {}) })}`
    : undefined;
  const needBrand = () => { setHint(true); pickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  // step 2 once the bag is known: recognised by the AI, or picked by hand and confirmed with "Continue"
  const known = !!brandId && !manual;
  const brandName = (ident && choice?.brandId === (ident.brandId ?? ident.otherBrandId) ? ident.brandName : null)
    ?? choice?.brandText ?? tax?.brands.find((b) => b.id === brandId)?.name ?? '';
  const restart = () => { setIdent(null); setManual(false); setOpen(null); pick(null); setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; }); };
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <AiBusy show={idBusy} stages={['aib.check1', 'aib.check2']} />
      <header>
        <h1 className="text-[28px] leading-tight">{t('check.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t(ai ? 'check.subtitleAi' : 'check.subtitle')}</p>
      </header>
      {meta && !ai && !meta.telegram && STAFF_ROLES.includes(me.role) && <p className="text-xs text-counterfeit">⚠ {t('vr.noTelegram')}</p>}

      {!known && (<>
      {/* how it works: one dark card, four steps joined by a gold line */}
      <div className="rounded-2xl border border-hairline bg-charcoal px-2 pb-4 pt-5 text-white shadow-sm">
        <ol className="relative grid grid-cols-4">
          <span className="absolute left-[12.5%] right-[12.5%] top-[15px] h-px bg-gradient-to-r from-gold/30 via-gold to-gold/30" aria-hidden />
          {(ai ? ['check.s1', 'check.s2', 'check.s3ai', 'check.s4ai'] : ['check.s1', 'check.s2', 'check.s3', 'check.s4']).map((k, i) => (
            <li key={k} className="relative flex flex-col items-center px-1 text-center">
              <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border font-mono text-[12px] font-bold ${i === 3 ? 'border-gold bg-gold text-charcoal' : 'border-gold bg-charcoal text-gold'}`}>
                {i === 3 ? '✦' : i + 1}
              </span>
              <span className="mt-2 text-[12.5px] font-semibold leading-tight">{t(k)}</span>
              <span className="mt-0.5 text-[10.5px] leading-tight text-white/60">{t(`${k}b`)}</span>
            </li>
          ))}
        </ol>
      </div>
      </>)}

      {needMember && <MembershipNeeded />}
      {!known && (<>
      {/* 1. one photo of the whole bag: AI recognises brand + model */}
      <div ref={pickRef} className={`space-y-3 rounded-2xl border p-4 transition ${hint ? 'border-counterfeit ring-2 ring-counterfeit/30' : 'border-hairline bg-surface-card'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-serif text-lg">1. {t('ck.whole')}</div>
          {trialLeft !== null && !meta!.trial.unlimited && <span className="text-[11px] text-muted">🎁 {t('vr.trial')} {trialLeft}/{meta!.trial.limit}</span>}
          {ai && meta?.precheck && <span className="text-[11px] text-muted">🤖 {t('pc.left')} {Math.max(0, meta.precheck.limit - meta.precheck.used)}/{meta.precheck.limit}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['camera', 'file'] as const).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${k === 'camera' ? 'bg-gold text-charcoal' : 'border border-hairline'} ${idBusy ? 'pointer-events-none opacity-60' : ''}`}>
              <Svg d={ICON[k === 'camera' ? 'photo' : 'upload']} />{t(k === 'camera' ? 'ck.shoot' : 'ck.upload')}
              <input type="file" accept="image/*" {...(k === 'camera' ? { capture: 'environment' as const } : {})} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) identify(f); }} />
            </label>
          ))}
        </div>
        {(preview || idBusy) && (
          <div className="flex gap-3">
            {preview && <img src={preview} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1 text-sm">
              {idBusy && <p className="animate-pulse text-muted">{t('ck.identifying')}</p>}
              {ident && !idBusy && (ident.brandName && ident.confidence >= 0.5 ? (
                <>
                  <div className="text-[11px] font-semibold text-gold">{t('ck.aiSees')}</div>
                  <div className="font-serif text-xl leading-tight">{ident.brandName}{ident.modelName ? ` · ${ident.modelName}` : ''}</div>
                  {(ident.size || ident.material) && <div className="mt-0.5 text-xs text-gold/90">{[ident.size, ident.material].filter(Boolean).join(' · ')}</div>}
                  {ident.desc && <div className="mt-1 text-xs leading-relaxed">{ident.desc}</div>}
                  <div className="mt-0.5 text-xs text-muted">{t('ck.confidence')} {Math.round(ident.confidence * 100)}%{ident.clues ? ` · ${ident.clues}` : ''}</div>
                  {!manual && <button type="button" className="mt-1 text-xs text-gold underline" onClick={() => setManual(true)}>✎ {t('ck.fix')}</button>}
                </>
              ) : <p className="text-review">{t('ck.unsure')}</p>)}
              {idErr && <p className="text-counterfeit">{idErr}</p>}
            </div>
          </div>
        )}
        {manual && (
          <div className="space-y-2 border-t border-hairline pt-3">
            {tax ? <BrandPicker brands={tax.brands} value={choice} onChange={pick} canAdd={['owner', 'lead_authenticator'].includes(me.role)} onAdded={loadTax} />
              : <div className="h-11 animate-pulse rounded-xl bg-surface-low" />}
            {brandId && !choice?.brandText && (
              <>
                <input className="input text-sm" list="hub-models" placeholder={t('vr.modelPh')} value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
                <datalist id="hub-models">{tax?.models.filter((m) => m.brand_id === brandId).map((m) => <option key={m.id} value={m.name} />)}</datalist>
              </>
            )}
          </div>
        )}
        {!preview && !manual && <button type="button" className="text-xs text-muted underline" onClick={() => setManual(true)}>{t('ck.pickMyself')}</button>}
        {hint && <p className="text-xs text-counterfeit">{t('ck.needBag')}</p>}
        {manual && brandId && <button type="button" className="btn-primary w-full" onClick={() => { setManual(false); setOpen(null); }}>{t('ck.continue')} →</button>}
      </div>
      </>)}

      {/* STEP 2 — the bag is known: its photo, brand and model, then the photos to take, then scan or upload */}
      {known && (() => {
        const aiShots = ident?.shots?.length && choice?.brandId === (ident.brandId ?? ident.otherBrandId) && model.trim() === (ident.modelName ?? '') ? ident.shots : null;
        const rows: { title: string; hint: string; refs: ShotRef[] }[] = aiShots
          ? aiShots.map((x) => ({ title: x.title, hint: x.hint, refs: x.refs }))
          : STEPS.filter((x) => x !== 'extra').map((x) => ({ title: t(`vr.step.${x}`), hint: t(`vr.tip.${x}`), refs: [] }));
        const sameBag = !!ident && choice?.brandId === (ident.brandId ?? ident.otherBrandId);
        return (
          <>
            <section className="overflow-hidden rounded-2xl border border-gold/40 bg-surface-card">
              {preview && (
                <div className="relative flex justify-center bg-charcoal">
                  <img src={preview} alt="" className="max-h-72 w-full object-contain" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-gold">✓ {t('ck.step1Done')}</span>
                </div>
              )}
              <div className="space-y-1 p-4">
                {sameBag && <div className="text-[11px] font-semibold text-gold">{t('ck.aiSees')}</div>}
                <div className="font-serif text-2xl leading-tight">{brandName}</div>
                <div className="text-lg leading-snug">{model.trim() || <span className="text-muted">{t('ck.modelUnknown')}</span>}</div>
                {sameBag && (ident!.size || ident!.material) && <div className="text-xs text-gold/90">{[ident!.size, ident!.material].filter(Boolean).join(' · ')}</div>}
                {sameBag && ident!.desc && <p className="pt-1 text-sm leading-relaxed text-muted">{ident!.desc}</p>}
                {sameBag && <div className="text-[11px] text-muted">{t('ck.confidence')} {Math.round(ident!.confidence * 100)}%</div>}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setManual(true)}>✎ {t('ck.fix')}</button>
                  <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={restart}>↺ {t('ck.rescan')}</button>
                </div>
              </div>
            </section>

            {/* the photos to take, as short links: tap one to see how to shoot it (and our original photos to follow) */}
            <section className="rounded-2xl border border-hairline bg-surface-card p-4">
              <div className="font-serif text-lg">2. {t('ck.where')}</div>
              {aiShots && <p className="mt-0.5 text-[11px] text-muted">✨ {t('ck.shotsAi').replace('{model}', [ident!.brandName, ident!.modelName].filter(Boolean).join(' '))}</p>}
              <ol className="mt-3 divide-y divide-hairline">
                {rows.map((r, k) => {
                  const on = open === k;
                  return (
                    <li key={k}>
                      <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : k)} className="flex w-full items-center gap-3 py-2.5 text-left">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold font-mono text-xs font-bold text-charcoal">{k + 1}</span>
                        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{r.title}</span>
                        {r.refs.length > 0 && <span className="shrink-0 text-[10px] text-gold">🖼 {r.refs.length}</span>}
                        <span className="shrink-0 text-xs text-gold underline underline-offset-2">{on ? t('ck.hide') : t('ck.howShoot')}</span>
                      </button>
                      {on && (
                        <div className="mb-3 ml-10 space-y-2 rounded-xl bg-surface-low p-3 text-sm">
                          {r.hint ? <p className="leading-relaxed">📷 {r.hint}</p> : null}
                          {r.refs.length > 0 && (
                            <div className="flex gap-2">
                              {r.refs.map((x) => (
                                <button key={x.id} type="button" onClick={() => setZoom(x)} aria-label={t('ck.refOpen')} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gold/40">
                                  <img src={`/api/assets/${x.id}/image`} alt={x.title ?? ''} loading="lazy" className="h-full w-full object-cover" />
                                  <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] font-semibold text-gold">{t('ck.refTag')}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {aiShots && aiShots.every((x) => !x.refs.length) && <p className="mt-2 text-[11px] text-muted">{t('ck.noRefs')}</p>}
            </section>

            {/* 3. scan or upload the points → straight into the photo steps */}
            <section className="space-y-2">
              <div className="px-1 font-serif text-lg">3. {t('ck.verifyNow')}</div>
              <div className="grid grid-cols-2 gap-3">
                <Tile id="photo" title={t('check.photo')} help={t(ai ? 'check.photoHelpAi' : 'check.photoHelp')} to={go('scan')} onClick={needBrand} primary />
                <Tile id="upload" title={t('check.upload')} help={t(ai ? 'check.uploadHelpAi' : 'check.uploadHelp')} to={go('upload')} onClick={needBrand} />
              </div>
            </section>
          </>
        );
      })()}
      {zoom && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <img src={`/api/assets/${zoom.id}/image`} alt={zoom.title ?? ''} className="max-h-[75vh] max-w-full rounded-xl object-contain" />
          {zoom.title && <p className="text-center text-sm text-white">{zoom.title}</p>}
          <p className="text-xs text-white/60">{t('ck.refNote')}</p>
          <button type="button" className="rounded-full border border-white/30 px-5 py-2 text-sm text-white">{t('steps.close')}</button>
        </div>
      )}
      <p className="rounded-2xl bg-surface-low p-3 text-xs text-muted">{t(ai ? 'pc.disclaimer' : 'ck.noVerdict')} <Link to="/authenticity" className="text-gold underline">{t('ck.learn')}</Link></p>
    </div>
  );
}

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

function Tile({ id, title, help, to, onClick, active, primary, dim }: { id: string; title: string; help: string; to?: string; onClick?: () => void; active?: boolean; primary?: boolean; dim?: boolean }) {
  const cls = `flex min-h-[9.5rem] flex-col justify-between rounded-2xl border p-4 text-left transition ${
    primary ? 'border-gold bg-gold text-charcoal' : active ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'} ${active && primary ? 'ring-2 ring-gold' : ''} ${dim ? 'opacity-50' : ''}`;
  const body = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${primary ? 'bg-gold text-charcoal' : 'bg-charcoal text-gold'}`}><Svg d={ICON[id]} /></span>
      <span>
        <span className="block font-serif text-xl leading-tight">{title}</span>
        <span className={`mt-0.5 block text-xs leading-snug ${primary ? 'text-white/70' : 'text-muted'}`}>{help}</span>
      </span>
    </>
  );
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} aria-expanded={active} className={cls}>{body}</button>;
}
