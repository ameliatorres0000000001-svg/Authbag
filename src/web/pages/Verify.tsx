import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, OutcomeBadge, errText } from '../ui.tsx';
import CameraCapture from '../CameraCapture.tsx';
import { assetImg } from '../studio.ts';

export const STEPS = ['model', 'logo', 'serial', 'material', 'hardware', 'zipper', 'extra'] as const;
export type Step = (typeof STEPS)[number];
const REQUIRED: Step[] = ['model', 'logo', 'serial'];
const MAX_EXTRA = 4;

export interface Plan { id: string; name_en: string; name_km: string; price_cents: number | null; entrupy_price_cents: number | null; currency: string }
interface Meta { trial: { used: number; limit: number; unlimited: boolean }; telegram: boolean; examples: Partial<Record<Step, string | null>>; plan: Plan | null }

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
  const [tax, setTax] = useState<{ brands: { id: string; name: string }[]; models: { id: string; brand_id: string; name: string }[] } | null>(null);
  const [brandId, setBrandId] = useState('');
  const [model, setModel] = useState('');
  const [mode, setMode] = useState<'scan' | 'upload' | null>(null);
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

  async function submit() {
    if (!brandId || !mode) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.append('brandId', brandId); fd.append('model', model); fd.append('mode', mode); fd.append('entrupy', entrupy ? '1' : '0');
    for (const s of STEPS) (shots[s] ?? []).forEach((f) => fd.append(s, f, `${s}.jpg`));
    try { const r = await api.post<{ id: string }>('/api/verify', fd); nav(`/verify/r/${r.id}`); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  }

  // ── step 0: brand, model and how to take the photos
  if (!mode) return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <header>
        <h1 className="text-[28px] leading-tight">{t('vr.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('vr.subtitle')}</p>
      </header>
      {meta && !meta.telegram && <Notice tone="warn">{t('vr.noTelegram')}</Notice>}
      {meta && !meta.trial.unlimited && (
        <div className={`rounded-2xl border p-3 text-sm ${blocked ? 'border-counterfeit/40 bg-counterfeit/5' : 'border-gold bg-gold-light'}`}>
          🎁 {t('vr.trial')}: <b>{trialLeft}/{meta.trial.limit}</b> {t('vr.trialLeft')}
          {blocked && <div className="mt-1 text-xs">{t('vr.trialUsed')}</div>}
        </div>
      )}

      <section className="space-y-2">
        <div className="font-serif text-lg">1. {t('vr.pickBrand')}</div>
        <div className="flex flex-wrap gap-2">
          {tax?.brands.map((b) => (
            <button key={b.id} type="button" onClick={() => { setBrandId(b.id); setModel(''); }}
              className={`rounded-full border px-3 py-1.5 text-sm ${brandId === b.id ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
          ))}
          {tax && !tax.brands.length && <p className="text-sm text-muted">{t('noData')}</p>}
        </div>
        {brandId && (
          <>
            <input className="input" list="vr-models" placeholder={t('vr.modelPh')} value={model} onChange={(e) => setModel(e.target.value)} maxLength={120} />
            <datalist id="vr-models">{tax?.models.filter((m) => m.brand_id === brandId).map((m) => <option key={m.id} value={m.name} />)}</datalist>
            {meta?.plan && (
              <p className="text-xs text-muted">{t('vr.plan')}: {lc === 'km' ? meta.plan.name_km : meta.plan.name_en} · {money(meta.plan.price_cents, meta.plan.currency, t('vr.priceLater'))}</p>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <div className="font-serif text-lg">2. {t('vr.how')}</div>
        <div className="grid grid-cols-2 gap-3">
          {(['scan', 'upload'] as const).map((m) => (
            <button key={m} type="button" disabled={!brandId || blocked} onClick={() => { setMode(m); setIdx(0); }}
              className={`flex min-h-[8.5rem] flex-col justify-between rounded-2xl border p-4 text-left transition disabled:opacity-40 ${m === 'scan' ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>
              <span className="text-2xl" aria-hidden>{m === 'scan' ? '📷' : '🖼️'}</span>
              <span>
                <span className="block font-serif text-xl leading-tight">{t(`vr.${m}`)}</span>
                <span className={`mt-0.5 block text-xs ${m === 'scan' ? 'text-white/70' : 'text-muted'}`}>{t(`vr.${m}Help`)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {err && <Notice tone="bad">{err}</Notice>}
      <MyRequests />
    </div>
  );

  // ── review and send
  if (!step) return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-5 md:px-8">
      <button type="button" className="text-sm text-muted" onClick={() => setIdx(STEPS.length - 1)}>← {t('vr.back')}</button>
      <h1 className="text-[26px] leading-tight">{t('vr.review')}</h1>
      <p className="text-sm text-muted">{brand?.name}{model ? ` · ${model}` : ''}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {STEPS.flatMap((s) => (urls[s] ?? []).map((u, i) => (
          <button key={`${s}${i}`} type="button" onClick={() => setIdx(STEPS.indexOf(s))} className="relative overflow-hidden rounded-xl bg-charcoal">
            <img src={u} alt="" className="aspect-square w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{t(`vr.step.${s}`)}</span>
          </button>
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

      <div className="rounded-2xl bg-surface-low p-3 text-xs text-muted">⏱ {t('vr.sla')}<br />{t('vr.disclaimer')}</div>
      {err && <Notice tone="bad">{err}</Notice>}
      <button type="button" className="btn-primary w-full !py-3" disabled={busy || REQUIRED.some((s) => !shots[s]?.length)} onClick={submit}>
        {busy ? '…' : `${t('vr.send')} →`}
      </button>
    </div>
  );

  // ── one guided photo step
  const optional = !REQUIRED.includes(step);
  const ex = meta?.examples[step === 'extra' ? 'model' : step];
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 pb-10 pt-4">
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-muted" onClick={() => (idx === 0 ? setMode(null) : setIdx(idx - 1))}>← {t('vr.back')}</button>
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
        <div className="flex gap-2 overflow-x-auto">
          {(urls[step] ?? []).map((u, i) => <img key={u} src={u} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" title={String(i + 1)} />)}
        </div>
      )}

      {mode === 'scan'
        ? <CameraCapture locale={lc} onCapture={take} disabled={step === 'extra' && (shots.extra?.length ?? 0) >= MAX_EXTRA} />
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
  submitted: 'bg-gold-light text-charcoal', in_review: 'bg-gold-light text-charcoal', more_photos: 'bg-counterfeit/10 text-counterfeit',
  answered: 'bg-verified/10 text-verified', cancelled: 'bg-surface-high text-muted',
};

function MyRequests() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/verify').then((r) => setRows(r.requests)).catch(() => setRows([])); }, []);
  return (
    <section className="space-y-2 pt-2">
      <div className="font-serif text-lg">{t('vr.mine')}</div>
      {rows === null ? <p className="text-sm text-muted">…</p> : !rows.length ? <p className="text-sm text-muted">{t('noData')}</p> : (
        <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-surface-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/verify/r/${r.id}`} className="flex items-center gap-3 p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-charcoal">{r.cover && <img src={`/api/verify/photos/${r.cover}/image`} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}</div>
                  <div className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {r.expert_outcome && r.status === 'answered' ? <OutcomeBadge outcome={r.expert_outcome} /> : <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>{t(`vr.status.${r.status}`)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
