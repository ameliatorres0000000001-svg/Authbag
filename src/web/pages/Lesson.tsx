import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import GuideButton from '../GuideButton.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, errText } from '../ui.tsx';
import AnnotatedPhoto, { PointCards, type Point } from '../AnnotatedPhoto.tsx';
import MarkCanvas from '../MarkCanvas.tsx';
import DateCodeAppearanceCard, { DateCodeGuide } from '../DateCodeAppearance.tsx';
import { BASES, LICENCES, STAFF_ROLES, annotateAfterUpload, assetImg, uploadReference } from '../studio.ts';

interface Photo { id: string; label: string; label_basis: string; status: string; teaching_note: string | null; source_url: string | null; points: Point[] }
interface Step {
  id: string; sort: number; component_code: string | null; status: string; source_note: string | null;
  title_en: string; title_km: string; body_en: string; body_km: string;
  checks: { en: string; km: string; look_en: string; look_km: string }[];
  photos: Photo[];
}
interface LessonData { model: { id: string; name: string; brand: string; brand_id: string }; aiConfigured: boolean; steps: Step[] }

export default function Lesson() {
  const { modelId } = useParams();
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const staff = STAFF_ROLES.includes(me.role);
  const [sp, setSp] = useSearchParams();
  const [d, setD] = useState<LessonData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'look' | 'compare'>('look');
  const [pick, setPick] = useState<{ photo: string; i: number } | null>(null);

  const load = useCallback(() => api.get<LessonData>(`/api/lessons/${modelId}`).then(setD).catch((e) => setErr(errText(e))), [modelId]);
  useEffect(() => { load(); }, [load]);

  const idx = Math.max(0, Math.min((d?.steps.length ?? 1) - 1, Number(sp.get('step') ?? 0) || 0));
  const step = d?.steps[idx];
  const go = (i: number) => { setSp({ step: String(i) }, { replace: true }); setPick(null); setMode('look'); window.scrollTo({ top: 0 }); };
  const L = (en: string, km: string) => (locale === 'km' ? km : en);

  const genuine = useMemo(() => step?.photos.filter((p) => p.label === 'authentic') ?? [], [step]);
  const counterfeit = useMemo(() => step?.photos.filter((p) => p.label === 'counterfeit') ?? [], [step]);
  const canCompare = genuine.length > 0 && counterfeit.length > 0;

  if (err) return <div className="p-6"><Notice tone="bad">{err}</Notice></div>;
  if (!d || !step) return <div className="p-6 text-muted">…</div>;

  const photoFrame = (p: Photo, tone: 'genuine' | 'counterfeit') => (
    <AnnotatedPhoto key={p.id} src={assetImg(p.id)} points={p.points} tone={tone}
      active={pick?.photo === p.id ? pick.i : null} onPick={(i) => setPick({ photo: p.id, i })}
      caption={tone === 'genuine' ? t('lesson.genuineRef') : t('lesson.counterfeitRef')}
      sub={`${t('lesson.yourLabel')} · ${p.label_basis}${p.status === 'quarantine' ? ` · ${t('study.quarantine')}` : ''}`}
      footer={<><span>{p.points.length} {t('lesson.points')}</span><span>{d.model.brand} · {String(idx + 1).padStart(2, '0')}</span></>} />
  );
  const pickedOf = (p: Photo) => (pick?.photo === p.id ? pick.i : null);

  return (
    <div className="mx-auto max-w-5xl pb-10">
      {/* header */}
      <div className="px-4 pt-5 md:px-8">
        <Link to="/learn" className="font-mono text-[10px] uppercase tracking-widest text-muted">← {t('learn')}</Link>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-gold">{d.model.brand}</div>
        <h1 className="text-3xl leading-tight">{d.model.name}</h1>
      </div>

      {/* step tabs */}
      <div className="sticky top-[49px] z-10 mt-3 border-y border-hairline bg-surface/95 backdrop-blur md:top-0">
        <div className="flex gap-2 overflow-x-auto px-4 py-2 md:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {d.steps.map((s, i) => (
            <button key={s.id} type="button" onClick={() => go(i)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left ${i === idx ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card'}`}>
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${i === idx ? 'bg-gold text-charcoal' : 'bg-surface-high text-muted'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="max-w-[9rem] truncate text-xs font-semibold">{L(s.title_en, s.title_km)}</span>
              {s.photos.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-verified" />}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-4 pt-4 md:px-8">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('lesson.step')} {idx + 1} / {d.steps.length}</div>
          <h2 className="text-2xl leading-tight">{L(step.title_en, step.title_km)}</h2>
          {step.status !== 'approved' && <div className="mt-1"><Badge tone="warn">{t('lesson.draft')}</Badge></div>}
        </div>

        {/* look / compare toggle */}
        <div className="inline-flex rounded-lg border border-hairline bg-surface-card p-0.5">
          {(['look', 'compare'] as const).map((m) => (
            <button key={m} type="button" disabled={m === 'compare' && !canCompare} onClick={() => { setMode(m); setPick(null); }}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold disabled:opacity-40 ${mode === m ? 'bg-gold text-charcoal' : 'text-charcoal'}`}>{t(`lesson.${m}`)}</button>
          ))}
        </div>
        {!canCompare && step.photos.length > 0 && <p className="-mt-3 text-xs text-muted">{t('lesson.compareOff')}</p>}

        {/* photos */}
        {step.photos.length === 0 ? (
          <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-strong bg-surface-low p-6 text-center">
            <div className="font-serif text-xl">{L(step.title_en, step.title_km)}</div>
            <p className="mt-1 text-sm text-muted">{t('lesson.noPhoto')}</p>
          </div>
        ) : mode === 'compare' ? (
          <div className="grid grid-cols-2 gap-2 md:gap-4">
            <div className="space-y-2">{photoFrame(genuine[0], 'genuine')}<PointCards points={genuine[0].points} active={pickedOf(genuine[0])} onPick={(i) => setPick({ photo: genuine[0].id, i })} empty={t('lesson.noPoints')} /></div>
            <div className="space-y-2">
              {photoFrame(counterfeit[0], 'counterfeit')}
              <PointCards points={counterfeit[0].points} active={pickedOf(counterfeit[0])} onPick={(i) => setPick({ photo: counterfeit[0].id, i })} empty={t('lesson.noPoints')} />
              {counterfeit[0].teaching_note && <div className="rounded-lg border-l-4 border-counterfeit bg-counterfeit-bg px-3 py-2 text-sm"><div className="label !text-counterfeit">{t('lesson.whatDiffers')}</div>{counterfeit[0].teaching_note}</div>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {[...genuine.map((p) => [p, 'genuine'] as const), ...counterfeit.map((p) => [p, 'counterfeit'] as const)].map(([p, tone]) => (
              <div key={p.id} className="grid gap-3 md:grid-cols-[3fr_2fr]">
                {photoFrame(p, tone)}
                <div className="space-y-2">
                  {p.points.length > 0 && <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('lesson.tapPoint')}</div>}
                  <PointCards points={p.points} active={pickedOf(p)} onPick={(i) => setPick({ photo: p.id, i })} empty={t('lesson.noPoints')} />
                  {p.teaching_note && <p className="whitespace-pre-wrap rounded-lg bg-surface-low px-3 py-2 text-sm">{p.teaching_note}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* explanation */}
        <section className="card">
          <div className="label">{t('lesson.explain')}</div>
          <p className="text-[15px] leading-relaxed">{L(step.body_en, step.body_km)}</p>
          {step.source_note && <p className="mt-2 text-[11px] text-muted">{step.source_note}</p>}
        </section>

        {/* checks table */}
        {step.checks.length > 0 && (
          <section className="card p-0">
            <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <span className="h-2 w-2 rounded-full bg-gold" /><h3 className="font-serif text-lg">{t('lesson.whatToCheck')}</h3>
            </div>
            <div className="grid grid-cols-[2.25rem_minmax(6rem,1fr)_2fr] font-mono text-[10px] uppercase tracking-wider text-muted">
              <div className="px-4 py-2" /><div className="py-2 pr-2">{t('lesson.feature')}</div><div className="py-2 pr-4">{t('lesson.lookFor')}</div>
            </div>
            {step.checks.map((c, i) => (
              <div key={i} className="grid grid-cols-[2.25rem_minmax(6rem,1fr)_2fr] border-t border-hairline text-sm">
                <div className="px-4 py-2.5 font-mono text-[11px] text-gold">{String(i + 1).padStart(2, '0')}</div>
                <div className="py-2.5 pr-2 font-semibold">{L(c.en, c.km)}</div>
                <div className="py-2.5 pr-4">{L(c.look_en, c.look_km)}</div>
              </div>
            ))}
          </section>
        )}

        {step.component_code === 'date_code' && <DateCodeGuide />}

        {staff && <AdminTools step={step} model={d.model} ai={d.aiConfigured} onChanged={load} />}

        <div className="flex justify-between gap-2">
          <button className="btn-ghost" disabled={idx === 0} onClick={() => go(idx - 1)}>{t('lesson.prev')}</button>
          <button className="btn-primary" disabled={idx === d.steps.length - 1} onClick={() => go(idx + 1)}>{t('lesson.next')}</button>
        </div>

        <div className="flex gap-2 border-t border-hairline pt-4 text-xs text-muted">
          <span aria-hidden>◈</span><p>{t('lesson.honest')}</p>
        </div>
      </div>
    </div>
  );
}

function AdminTools({ step, model, ai, onChanged }: { step: Step; model: LessonData['model']; ai: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ label: 'authentic', labelBasis: 'purchase_receipt', license: 'own', teachingNote: '', sourceUrl: '' });
  const [file, setFile] = useState<File | null>(null);
  const [sel, setSel] = useState<string | null>(step.photos[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const photo = step.photos.find((p) => p.id === sel) ?? null;
  useEffect(() => { if (!photo && step.photos[0]) setSel(step.photos[0].id); }, [photo, step.photos]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMsg(null);
    try { await fn(); onChanged(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(false); }
  };

  return (
    <details className="rounded-xl border border-hairline bg-surface-low">
      <summary className="cursor-pointer select-none px-4 py-3 font-mono text-[11px] uppercase tracking-widest">{t('lesson.admin')}</summary>
      <div className="space-y-5 px-4 pb-4">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (file) run(async () => { const r = await uploadReference(file, { ...f, brandId: model.brand_id, modelId: model.id, purpose: 'study', lessonStepId: step.id }); await annotateAfterUpload(r.id, step.component_code); setFile(null); setSel(r.id); (e.target as HTMLFormElement).reset(); }); }}>
          <div className="label">{t('lesson.addPhoto')}</div>
          <div className="grid grid-cols-2 gap-2">
            {(['authentic', 'counterfeit'] as const).map((l) => (
              <button type="button" key={l} onClick={() => set('label', l)}
                className={`rounded border px-3 py-2 text-left text-xs font-semibold ${f.label === l ? (l === 'authentic' ? 'border-verified bg-verified-bg text-verified' : 'border-counterfeit bg-counterfeit-bg text-counterfeit') : 'border-strong bg-surface-card'}`}>
                {l === 'authentic' ? t('study.knownGenuine') : t('study.knownCounterfeit')}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('studio.basis')}><select className="input" value={f.labelBasis} onChange={(e) => set('labelBasis', e.target.value)}>{BASES.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label={t('studio.licence')}><select className="input" value={f.license} onChange={(e) => set('license', e.target.value)}>{LICENCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Field label={f.label === 'counterfeit' ? t('study.whatDiffers') : t('studio.teachingNote')}><textarea className="input" rows={2} maxLength={4000} value={f.teachingNote} onChange={(e) => set('teachingNote', e.target.value)} /></Field>
          <Field label={t('studio.source')}><input className="input" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} /></Field>
          <input className="input" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn-primary w-full" disabled={busy || !file}>{busy ? t('studio.uploading') : t('studio.upload')}</button>
        </form>

        {step.photos.length > 0 && (
          <div className="space-y-3">
            <div className="label">{t('lesson.editPoints')}</div>
            <div className="flex gap-2 overflow-x-auto">
              {step.photos.map((p) => (
                <button key={p.id} type="button" onClick={() => setSel(p.id)} className={`shrink-0 overflow-hidden rounded border-2 ${sel === p.id ? 'border-gold' : 'border-transparent'}`} aria-label={t('lesson.pickPhoto')}>
                  <img src={assetImg(p.id)} alt="" className="h-14 w-14 object-cover" />
                </button>
              ))}
            </div>
            {photo && (
              <>
                <MarkCanvas key={photo.id} src={assetImg(photo.id)} marks={photo.points as any} locked={false} aiConfigured={ai} busy={busy} withNote
                  onAdd={(r, label, note) => run(() => api.post(`/api/assets/${photo.id}/points`, { ...r, label, note }))}
                  onDelete={(id) => run(() => api.del(`/api/reference-points/${id}`))}
                  onSuggest={() => run(() => api.post(`/api/assets/${photo.id}/points/suggest`))} />
                {(photo as any).label === 'authentic' && step.component_code && <GuideButton assetId={photo.id} points={photo.points as any} onDone={() => run(async () => {})} />}
                {step.component_code === 'date_code' && <DateCodeAppearanceCard base={`/api/assets/${photo.id}`} canRun askTyped />}
              </>
            )}
          </div>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </details>
  );
}
