import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, OutcomeBadge, errText } from '../ui.tsx';
import CameraCapture from '../CameraCapture.tsx';
import ContactInfo from '../ContactInfo.tsx';
import { assetImg } from '../studio.ts';

export const STEPS = ['model', 'logo', 'serial', 'material', 'hardware', 'zipper', 'extra'] as const;
export type Step = (typeof STEPS)[number];
const REQUIRED: Step[] = ['model', 'logo', 'serial'];
const MAX_EXTRA = 4;

export interface Plan { id: string; name_en: string; name_km: string; price_cents: number | null; entrupy_price_cents: number | null; currency: string }
interface Meta { trial: { used: number; limit: number; unlimited: boolean }; telegram: boolean; examples: Partial<Record<Step, string | null>>; plan: Plan | null;
  expertReview?: boolean; aiConfigured?: boolean; precheck?: { used: number; limit: number } | null }

export const money = (cents: number | null | undefined, cur: string, later: string) =>
  cents == null ? later : new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(cents / 100);

/** Shrink big photos before upload (long side ≤ 2000 px, JPEG) so they send fast and fit Telegram's limits. */
export async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 3_000_000) return file;
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9));
    return b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

/** Customer flow: brand → scan or upload → 6 guided photos (+ extra) → send to the experts. */
export default function Verify() {
  const { t, locale } = useI18n();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  // the Scan hub opens this page with ?mode=scan or ?mode=upload already chosen
  const preset = (['scan', 'upload'] as const).find((m) => m === sp.get('mode')) ?? null;
  const [tax, setTax] = useState<{ brands: { id: string; name: string }[]; models: { id: string; brand_id: string; name: string }[] } | null>(null);
  // the Scan hub sends the brand (and model) with the mode: open the photo steps straight away
  const [brandId] = useState(sp.get('brandId') ?? '');
  const [model] = useState(sp.get('model') ?? '');
  const [brandText] = useState(sp.get('brandText') ?? '');
  const [mode, setMode] = useState<'scan' | 'upload' | null>(sp.get('brandId') ? preset : null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [idx, setIdx] = useState(0); // current step; STEPS.length = review
  const [shots, setShots] = useState<Partial<Record<Step, File[]>>>({});
  const [entrupy, setEntrupy] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api.get('/api/taxonomy').then(setTax).catch((e) => setErr(errText(e))); }, []);
  // examples follow the brand, and the model once the customer starts the photos
  useEffect(() => {
    const q = new URLSearchParams(); if (brandId) q.set('brandId', brandId); if (mode && model.trim()) q.set('model', model.trim());
    api.get<Meta>(`/api/verify/meta?${q}`).then(setMeta).catch((e) => setErr(errText(e)));
  }, [brandId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const lc = locale === 'km' ? 'km' : 'en';
  const step = STEPS[idx] as Step | undefined;
  const brand = tax?.brands.find((b) => b.id === brandId);
  const trialLeft = meta ? Math.max(0, meta.trial.limit - meta.trial.used) : 0;
  const blocked = !!meta && !meta.trial.unlimited && trialLeft === 0;
  const urls = useMemo(() => Object.fromEntries(Object.entries(shots).map(([k, fs]) => [k, (fs ?? []).map((f) => URL.createObjectURL(f))])) as Record<string, string[]>, [shots]);
  useEffect(() => () => Object.values(urls).flat().forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const take = useCallback(async (raw: File) => {
    const f = await shrink(raw);
    setShots((s) => {
      const cur = STEPS[idx];
      return { ...s, [cur]: cur === 'extra' ? [...(s.extra ?? []), f].slice(0, MAX_EXTRA) : [f] };
    });
    if (STEPS[idx] !== 'extra') setIdx((i) => i + 1);
  }, [idx]);

  /** Upload: pick every photo at once. They fill the steps in order (whole bag, logo, code, material, hardware,
   *  zipper, then extras); the review screen lets the user move any photo to the right step. */
  const takeAll = async (raw: File[]) => {
    const fs = await Promise.all(raw.slice(0, 6 + MAX_EXTRA).map((f) => shrink(f)));
    setShots((s) => {
      const next: Partial<Record<Step, File[]>> = { ...s };
      const free = STEPS.filter((st) => st !== 'extra' && !next[st]?.length);
      for (const f of fs) {
        const st = free.shift();
        if (st) next[st] = [f];
        else next.extra = [...(next.extra ?? []), f].slice(0, MAX_EXTRA);
      }
      return next;
    });
    setIdx(STEPS.length); // straight to the review
  };
  /** Review: move one photo to another step; a photo already there swaps back (or goes to extras). */
  const moveShot = (from: Step, i: number, to: Step) => {
    if (from === to) return;
    setShots((s) => {
      const next: Partial<Record<Step, File[]>> = { ...s };
      const f = (next[from] ?? [])[i];
      if (!f) return s;
      next[from] = (next[from] ?? []).filter((_, k) => k !== i);
      if (to === 'extra') next.extra = [...(next.extra ?? []), f].slice(0, MAX_EXTRA);
      else {
        const old = next[to]?.[0];
        next[to] = [f];
        if (old) { if (from === 'extra') next.extra = [...(next.extra ?? []), old].slice(0, MAX_EXTRA); else next[from] = [old]; }
      }
      return next;
    });
  };

  async function submit() {
    if (!brandId || !mode) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append('brandId', brandId); if (brandText) fd.append('brandText', brandText); fd.append('model', model); fd.append('mode', mode); fd.append('entrupy', entrupy ? '1' : '0');
    for (const s of STEPS) (shots[s] ?? []).forEach((f) => fd.append(s, f, `${s}.jpg`));
    try { const r = await api.post<{ id: string }>('/api/verify', fd); nav(`/verify/r/${r.id}`); }
    catch (e) {
      const code = (e as { body?: { error?: string } })?.body?.error;
      setErr(code === 'membership_required' ? t('mb.neededBody') : code === 'precheck_limit' ? t('pc.limit') : code === 'ai_not_configured' ? t('pc.aiOff') : errText(e)); setBusy(false);
    }
  }

  // ── step 0: brand, model and how to take the photos
  // without a brand + mode this page is the customer's list: requests, certificates and buy-back
  if (!mode) return <MyChecks />;
  if (blocked) return (
    <div className="mx-auto max-w-xl space-y-3 px-4 pt-6">
      <Notice tone="warn">🎁 {t('vr.trialUsed')}</Notice>
      <Link to="/check" className="btn-ghost">← {t('vr.back')}</Link>
    </div>
  );

  // ── review and send
  if (!step) return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-5 md:px-8">
      <button type="button" className="text-sm text-muted" onClick={() => setIdx(STEPS.length - 1)}>← {t('vr.back')}</button>
      <h1 className="text-[26px] leading-tight">{t('vr.review')}</h1>
      <p className="text-sm text-muted">{brandText || brand?.name}{model ? ` · ${model}` : ''}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {STEPS.flatMap((s) => (urls[s] ?? []).map((u, i) => (
          <div key={`${s}${i}`} className="overflow-hidden rounded-xl border border-hairline bg-charcoal">
            <button type="button" onClick={() => setIdx(STEPS.indexOf(s))} className="block w-full"><img src={u} alt="" className="aspect-square w-full object-cover" /></button>
            {/* which part this photo shows: change it if the order was different */}
            <select value={s} onChange={(e) => moveShot(s, i, e.target.value as Step)} aria-label={t('vr.whichPart')}
              className="w-full border-0 bg-black/70 px-1.5 py-1 text-[11px] text-white">
              {STEPS.map((x) => <option key={x} value={x}>{t(`vr.step.${x}`)}</option>)}
            </select>
          </div>
        )))}
      </div>
      {REQUIRED.some((s) => !shots[s]?.length) && <Notice tone="warn">{t('vr.needRequired')}</Notice>}

      <label className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface-card p-4">
        <input type="checkbox" className="mt-1" checked={entrupy} onChange={(e) => setEntrupy(e.target.checked)} />
        <span className="min-w-0">
          <span className="block font-semibold">➕ {t('vr.entrupy')}</span>
          <span className="block text-xs text-muted">{t('vr.entrupyHelp')} · {money(meta?.plan?.entrupy_price_cents, meta?.plan?.currency ?? 'USD', t('vr.priceLater'))}</span>
        </span>
      </label>

      <div className="rounded-2xl bg-surface-low p-3 text-xs text-muted">{meta?.expertReview === false ? <>🤖 {t('pc.sla')}<br />{t('pc.disclaimer')}</> : <>⏱ {t('vr.sla')}<br />{t('vr.disclaimer')}</>}</div>
      {err && <Notice tone="bad">{err}</Notice>}
      <button type="button" className="btn-primary w-full !py-3" disabled={busy || REQUIRED.some((s) => !shots[s]?.length)} onClick={submit}>
        {busy ? '…' : `${t(meta?.expertReview === false ? 'pc.send' : 'vr.send')} →`}
      </button>
    </div>
  );

  // ── one guided photo step
  const optional = !REQUIRED.includes(step);
  const ex = meta?.examples[step === 'extra' ? 'model' : step];
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 pb-10 pt-4">
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-muted" onClick={() => (idx === 0 ? nav('/check') : setIdx(idx - 1))}>← {t('vr.back')}</button>
        <span className="font-mono text-xs text-muted">{Math.min(idx + 1, 6)}/6{step === 'extra' ? '+' : ''}</span>
      </div>
      <div className="flex gap-1" aria-hidden>
        {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${shots[s]?.length ? 'bg-verified' : i === idx ? 'bg-gold' : 'bg-hairline'}`} />)}
      </div>

      {/* example on top: where to aim */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
        <div className="flex gap-3 p-3">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-charcoal">
            {ex ? <img src={assetImg(ex)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl text-gold" aria-hidden>{ICON[step]}</div>}
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{t('vr.example')}</div>
            <div className="font-serif text-xl leading-tight">{STEPS.indexOf(step) < 6 ? `${idx + 1}. ` : '+ '}{t(`vr.step.${step}`)}{optional && <span className="ml-1 text-xs text-muted">({t('vr.optional')})</span>}</div>
            <p className="mt-0.5 text-xs leading-snug text-muted">{t(`vr.tip.${step}`)}</p>
          </div>
        </div>
      </div>

      {(urls[step] ?? []).length > 0 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(urls[step] ?? []).map((u, i) => <img key={u} src={u} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" title={String(i + 1)} />)}
        </div>
      )}

      {mode === 'upload' && idx === 0 && !STEPS.some((x) => shots[x]?.length) && (
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-gold/60 bg-gold/10 p-4 text-center">
          <span className="text-base font-semibold text-gold">🖼 {t('vr.pickAll')}</span>
          <span className="text-xs text-muted">{t('vr.pickAllHelp')}</span>
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={async (e) => { const fs = Array.from(e.target.files ?? []) as File[]; e.target.value = ''; if (fs.length) await takeAll(fs); }} />
        </label>
      )}
      {mode === 'scan'
        ? <CameraCapture locale={lc} onCapture={take} example={ex ? assetImg(ex) : null} disabled={step === 'extra' && (shots.extra?.length ?? 0) >= MAX_EXTRA} />
        : (
          <label className="btn-primary flex w-full cursor-pointer justify-center !py-3">
            {shots[step]?.length ? t('vr.replace') : t('vr.choose')}
            <input type="file" accept="image/*" multiple={step === 'extra'} className="hidden"
              onChange={async (e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; for (const f of fs) await take(f); }} />
          </label>
        )}

      <div className="flex gap-2">
        {(optional || !!shots[step]?.length) && (
          <button type="button" className="btn-ghost flex-1" onClick={() => setIdx(idx + 1)}>
            {shots[step]?.length ? `${t('vr.next')} →` : t('vr.skip')}
          </button>
        )}
      </div>
    </div>
  );
}

const ICON: Record<Step, string> = { model: '👜', logo: '®', serial: '#', material: '▦', hardware: '⚙', zipper: '⇕', extra: '+' };

export const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-gold-light text-ink', in_review: 'bg-gold-light text-ink', more_photos: 'bg-counterfeit/10 text-counterfeit',
  answered: 'bg-verified/10 text-verified', cancelled: 'bg-surface-high text-muted',
};

/** "Certificate & buy-back" tab: the customer's requests with their expert answer, HENGZ certificate and buy-back status. */
function MyChecks() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/verify').then((r) => setRows(r.requests)).catch(() => setRows([])); }, []);
  const certs = rows?.filter((r) => r.cert_code) ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <header>
        <h1 className="text-[28px] leading-tight">{t('mc.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('mc.subtitle')}</p>
      </header>

      {certs.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-serif text-lg">🏅 {t('mc.certs')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {certs.map((r) => (
              <a key={r.id} href={`/certificate/${r.cert_code}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-gold bg-gold-light p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-charcoal">{r.cover && <img src={`/api/verify/photos/${r.cover}/image`} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}</div>
                  <div className="font-mono text-[11px]">{r.cert_no}</div>
                </div>
                <span className="text-xs underline">⎙ PDF</span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-serif text-lg">{t('vr.mine')}</h2>
        {rows === null ? <p className="text-sm text-muted">…</p> : !rows.length ? (
          <div className="rounded-2xl border border-dashed border-strong p-5 text-center text-sm text-muted">
            {t('noData')}<br /><Link to="/check" className="mt-2 inline-block font-semibold underline">{t('mc.start')} →</Link>
          </div>
        ) : (
          <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-surface-card">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to={`/verify/r/${r.id}`} className="flex items-center gap-3 p-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-charcoal">{r.cover && <img src={`/api/verify/photos/${r.cover}/image`} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}</div>
                    <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.cert_code && <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-charcoal">🏅 Certificate</span>}
                      {r.offer_status && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.offer_status === 'accepted' ? 'bg-verified text-white' : r.offer_status === 'open' ? 'bg-gold-light text-ink' : 'bg-surface-high text-muted'}`}>
                          💰 {r.offer_status === 'accepted' ? t('bb.st.accepted') : r.offer_status === 'open' ? (r.offer_from === 'hengz' ? t('mc.newOffer') : t('bb.st.open')) : t(`bb.st.${r.offer_status}`)}
                          {r.offer_cents ? ` · ${(r.offer_cents / 100).toLocaleString()} ${r.offer_currency}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {r.expert_outcome && r.status === 'answered' ? <OutcomeBadge outcome={r.expert_outcome} />
                    : r.precheck_level ? <PrecheckBadge level={r.precheck_level} />
                      : <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>{t(`vr.status.${r.status}`)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ContactInfo />
    </div>
  );
}

export const PRECHECK_TONE: Record<string, string> = {
  no_differences_seen: 'bg-verified-bg text-verified', concerns: 'bg-counterfeit-bg text-counterfeit',
  more_photos: 'bg-review-bg text-review', unclear: 'bg-surface-high text-muted',
};
/** The AI pre-check level as a small label (never a verdict). */
export function PrecheckBadge({ level }: { level: string }) {
  const { t } = useI18n();
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRECHECK_TONE[level] ?? PRECHECK_TONE.unclear}`}>🤖 {t(`pc.lvl.${level}`)}</span>;
}
