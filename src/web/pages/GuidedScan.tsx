import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { prepareImage } from '../image.ts';
import { useI18n } from '../i18n.tsx';
import CameraCapture from '../CameraCapture.tsx';
import NfcRead from '../NfcRead.tsx';
import MarkCanvas, { type Mark } from '../MarkCanvas.tsx';
import { ObsForm } from './InspectionDetail.tsx';
import { buildStages, summarizeStages, type Stage, type StageStatus } from '../../shared/stages.ts';
import type { Rect } from '../../shared/marks.ts';
import { Badge, Notice, OutcomeBadge, Page, errText } from '../ui.tsx';

const ST: Record<StageStatus, { km: string; en: string; tone: 'ok' | 'bad' | 'warn' | 'muted' }> = {
  pending: { km: 'កំពុងរង់ចាំរូប', en: 'Photos needed', tone: 'muted' },
  insufficient: { km: 'ភស្តុតាងមិនគ្រប់', en: 'Insufficient evidence', tone: 'warn' },
  concern: { km: 'រកឃើញចំណុចគួរកត់សម្គាល់', en: 'Concern found', tone: 'bad' },
  consistent: { km: 'ស្របនឹង reference', en: 'Consistent with references', tone: 'ok' },
};
const COMP: Record<string, { km: string; en: string }> = {
  heat_stamp: { km: 'ត្រាក្តៅ', en: 'Heat stamp' }, date_code: { km: 'កូដកាលបរិច្ឆេទ', en: 'Date code' }, stitching: { km: 'ថ្នេរ', en: 'Stitching' },
  zipper: { km: 'ហ្ស៊ីប', en: 'Zipper' }, hardware: { km: 'ផ្នែកដែក', en: 'Hardware' }, rivet: { km: 'Rivet', en: 'Rivets' }, canvas: { km: 'Canvas / ស្បែក', en: 'Canvas / leather' },
  lining: { km: 'ក្រណាត់ខាងក្នុង', en: 'Lining' }, handles: { km: 'ដៃកាន់', en: 'Handles' }, rfid: { km: 'ឈីប RFID', en: 'RFID chip' }, general: { km: 'ទូទៅ', en: 'General' },
};

export default function GuidedScan() {
  const { id } = useParams();
  const { locale, t } = useI18n();
  const [d, setD] = useState<any>(null); const [cur, setCur] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null); // shot chosen by hand from the shot list
  const [refs, setRefs] = useState<{ candidates: any[]; aiConfigured: boolean } | null>(null);
  const [selCap, setSelCap] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [flash, setFlash] = useState<string | null>(null);
  const busyRef = useRef(false);
  const L = (o: any, k: string) => (locale === 'km' ? o[`${k}_km`] : o[`${k}_en`]) ?? o[`${k}_en`];

  const load = useCallback(async () => setD(await api.get(`/api/inspections/${id}`)), [id]);
  useEffect(() => { load().catch((e) => setErr(errText(e))); }, [load]);

  const ev = useMemo(() => (d?.evaluation ? JSON.parse(d.evaluation.detail_json) : null), [d]);
  const stages: Stage[] = useMemo(() => {
    if (!d) return [];
    const tpls = d.templates.map((t: any) => ({ code: t.code, componentCode: t.component_code ?? null, required: !!t.required, labelEn: t.label_en, labelKm: t.label_km }));
    return buildStages(tpls, new Set(d.captures.map((c: any) => c.template_code)), ev?.ruleResults ?? []);
  }, [d, ev]);
  const summary = useMemo(() => summarizeStages(stages), [stages]);

  useEffect(() => { // default to the first stage that still needs photos
    if (stages.length && (!cur || !stages.find((s) => s.component === cur))) setCur((stages.find((s) => s.status === 'pending') ?? stages[0]).component);
  }, [stages, cur]);

  const justCaptured = useRef(false);
  useEffect(() => { // right after a photo completes this stage -> move on to the next stage that still needs photos
    if (!justCaptured.current) return;
    justCaptured.current = false;
    const here = stages.find((s) => s.component === cur);
    if (here && here.missingRequired.length === 0) { const nxt = stages.find((s) => s.missingRequired.length > 0); if (nxt) setCur(nxt.component); }
  }, [stages, cur]);

  useEffect(() => { // approved examples for the "how to look" panel of the current stage
    if (!cur) return;
    setRefs(null);
    api.get(`/api/inspections/${id}/references?component=${encodeURIComponent(cur)}`).then(setRefs).catch(() => setRefs({ candidates: [], aiConfigured: false }));
  }, [id, cur]);

  const stage = stages.find((s) => s.component === cur);
  const nextTpl = (pick ? stage?.templates.find((x) => x.code === pick) : undefined)
    ?? stage?.templates.find((x) => x.required && stage.missingRequired.includes(x.code))
    ?? stage?.templates.find((x) => !d.captures.some((c: any) => c.template_code === x.code));
  const stageCaps = useMemo(() => (d && stage ? d.captures.filter((c: any) => stage.templates.some((x) => x.code === c.template_code)) : []), [d, stage]);
  useEffect(() => { // analyse the newest photo of the stage unless the user picked another one
    if (!stageCaps.some((c: any) => c.id === selCap)) setSelCap(stageCaps.length ? stageCaps[stageCaps.length - 1].id : null);
  }, [stageCaps, selCap]);
  const tplFull = (code: string) => d.templates.find((t: any) => t.code === code);
  const locked = d?.inspection.status === 'signed_off';

  const onCapture = useCallback(async (file: File) => {
    if (busyRef.current || !nextTpl) return;
    busyRef.current = true; setBusy('upload'); setErr(null);
    try {
      const p = await prepareImage(file);
      const fd = new FormData();
      fd.append('file', new File([p.blob], 'capture.jpg', { type: 'image/jpeg' }));
      fd.append('templateCode', nextTpl.code); fd.append('width', String(p.width)); fd.append('height', String(p.height)); fd.append('quality', JSON.stringify(p.quality));
      const r = await api.post(`/api/inspections/${id}/captures`, fd);
      setPick(null); setSelCap(r.id); justCaptured.current = true;
      setFlash(p.quality.warnings.length ? `${locale === 'km' ? 'រក្សាទុករួច តែមានព្រមាន' : 'Saved with warning'}: ${p.quality.warnings.join(', ')}` : locale === 'km' ? 'រក្សាទុករួច ✓' : 'Saved ✓');
      try { await api.post(`/api/captures/${r.id}/suggest`); } catch { /* AI optional: 501 when not configured */ }
      await load();
    } catch (e) { setErr(errText(e)); } finally { busyRef.current = false; setBusy(null); }
  }, [nextTpl, id, load, locale]);

  async function evaluate() {
    setBusy('eval'); setErr(null);
    try { await api.post(`/api/inspections/${id}/evaluate`); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function addObs(key: string, value: string | number | boolean) {
    try { await api.post(`/api/inspections/${id}/observations`, { key, value, captureId: null }); await load(); } catch (e) { setErr(errText(e)); }
  }

  async function addMark(r: Rect, label: string) {
    setBusy('mark'); setErr(null);
    try { await api.post(`/api/captures/${selCap}/marks`, { ...r, label }); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function deleteMark(markId: string) {
    setBusy('mark'); setErr(null);
    try { await api.del(`/api/marks/${markId}`); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }
  async function suggestMarks() {
    setBusy('mark'); setErr(null);
    try { await api.post(`/api/captures/${selCap}/marks/suggest`); await load(); } catch (e) { setErr(errText(e)); } finally { setBusy(null); }
  }

  if (!d) return <Page title="…">{err && <Notice tone="bad">{err}</Notice>}</Page>;
  const insp = d.inspection;
  const defs = stage ? (d.observationDefs as any[]).filter((x) => x.component_code === stage.component) : [];
  const stageName = (c: string) => (COMP[c] ? COMP[c][locale] : c);
  const doneTpl = d.templates.filter((x: any) => d.captures.some((c: any) => c.template_code === x.code)).length;

  return (
    <Page title={locale === 'km' ? 'ស្កេនតាមជំហាន' : 'Guided scan'} subtitle={`${insp.brand} · ${insp.model} · ${insp.ref_code}`}
      actions={<div className="flex items-center gap-2"><OutcomeBadge outcome={insp.outcome} /><Link className="btn-ghost" to={`/inspections/${id}`}>{locale === 'km' ? 'មើលលម្អិត / ហត្ថលេខា' : 'Details / sign-off'}</Link></div>}>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}

      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('scan.step')} {Math.max(1, stages.findIndex((s) => s.component === cur) + 1)} / {stages.length}</div>
            <div className="font-mono text-xs">{doneTpl} / {d.templates.length} {t('scan.photos')}</div>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-surface-high"><div className="h-full bg-gold transition-all" style={{ width: `${d.templates.length ? (doneTpl / d.templates.length) * 100 : 0}%` }} /></div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {stages.map((s, i) => (
              <button key={s.component} onClick={() => { setCur(s.component); setPick(null); }} className={`shrink-0 rounded-lg border px-3 py-2 text-left text-xs ${cur === s.component ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card'}`}>
                <div className="font-mono text-[10px] text-muted">{i + 1}</div>
                <div className="font-semibold">{stageName(s.component)}</div>
                <Badge tone={ST[s.status].tone}>{ST[s.status][locale]}</Badge>
              </button>
            ))}
          </div>
        </div>

        {stage && (
          <div className="card space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{t('scan.nowShooting')} · {stageName(stage.component)}</div>
            {nextTpl && !locked ? (
              <>
                <div className="font-serif text-2xl leading-tight">{L(tplFull(nextTpl.code), 'label')}</div>
                <div className="rounded-lg border border-hairline bg-surface-low p-3">
                  <div className="label">{t('scan.howToLook')}</div>
                  <p className="text-sm">{L(tplFull(nextTpl.code), 'guidance') || <span className="text-muted">{t('scan.noGuidance')}</span>}</p>
                  <div className="label mt-3">{t('scan.examples')}</div>
                  {refs === null ? <p className="text-xs text-muted">…</p> : refs.candidates.length === 0 ? <p className="text-xs text-muted">{t('scan.noExamples')}</p> : (
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                      {refs.candidates.map((r: any) => (
                        <a key={r.id} href={`/api/assets/${r.id}/image`} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded border border-hairline">
                          <img src={`/api/assets/${r.id}/image`} alt="" className="h-24 w-24 object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {stage.component === 'rfid' ? (
                  <Notice>{locale === 'km' ? 'ឈីប RFID មិនអាចអានដោយទូរសព្ទសាធារណៈ ដើម្បីបញ្ជាក់ភាពពិតបានទេ។ អាចកត់ត្រាថាមាន ឬអត់ ប៉ុណ្ណោះ ហើយវាមិនបញ្ជាក់អ្វីដោយខ្លួនឯងទេ។' : 'A phone cannot verify an RFID chip. You can only record presence or absence, and that proves nothing on its own.'}</Notice>
                ) : <CameraCapture onCapture={onCapture} locale={locale} disabled={!!busy} />}
                {busy === 'upload' && <p className="text-xs text-muted">…</p>}
                {flash && <p className="text-xs text-verified">{flash}</p>}
              </>
            ) : <p className="text-sm text-muted">{t('scan.stageDone')}</p>}
          </div>
        )}

        <div className="card space-y-3">
          <div className="label">{t('scan.shotList')}</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {d.templates.map((tp: any, i: number) => {
              const caps = d.captures.filter((c: any) => c.template_code === tp.code);
              const last = caps[caps.length - 1];
              const active = nextTpl?.code === tp.code;
              return (
                <button key={tp.code} disabled={locked} onClick={() => { setCur(tp.component_code ?? 'general'); setPick(tp.code); if (last) setSelCap(last.id); }}
                  className={`overflow-hidden rounded-lg border text-left ${active ? 'border-gold ring-1 ring-gold' : 'border-hairline'}`}>
                  <div className="relative bg-surface-high" style={{ aspectRatio: '1 / 1' }}>
                    {last ? <img src={`/api/captures/${last.id}/image`} alt="" className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center font-serif text-2xl text-strong">{i + 1}</div>}
                    {last && <span className="absolute right-1 top-1 rounded-full bg-verified px-1.5 text-[10px] text-white">✓{caps.length > 1 ? ` ${caps.length}` : ''}</span>}
                  </div>
                  <div className="p-1.5 text-[11px] leading-tight">
                    <div className="line-clamp-2 font-semibold">{L(tp, 'label')}</div>
                    <div className="text-muted">{tp.required ? t('required') : t('optional')}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {stage && (
          <div className="card space-y-3">
            <div className="label">{t('scan.analysis')}</div>
            {stageCaps.length === 0 ? <p className="text-sm text-muted">{t('noData')}</p> : (
              <>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                  {stageCaps.map((c: any) => (
                    <button key={c.id} onClick={() => setSelCap(c.id)} className={`shrink-0 overflow-hidden rounded border-2 ${selCap === c.id ? 'border-gold' : 'border-transparent'}`}>
                      <img src={`/api/captures/${c.id}/image`} alt="" className="h-16 w-16 object-cover" />
                    </button>
                  ))}
                </div>
                {selCap ? (
                  <>
                    <MarkCanvas src={`/api/captures/${selCap}/image`} marks={(d.marks as Mark[]).filter((m: any) => m.capture_id === selCap)}
                      locked={locked} aiConfigured={!!refs?.aiConfigured} busy={busy === 'mark'} onAdd={addMark} onDelete={deleteMark} onSuggest={suggestMarks} />
                    <Link className="btn-ghost w-full" to={`/inspections/${id}/compare/${selCap}`}>{t('scan.compare')}</Link>
                  </>
                ) : <p className="text-sm text-muted">{t('scan.tapPhoto')}</p>}
              </>
            )}
          </div>
        )}

        {stage && (
          <div className="card space-y-3">
            <div className="label">{locale === 'km' ? 'ការសង្កេតរបស់ជំនាញ' : 'Appraiser observations'}</div>
            {stage.component === 'rfid' && !locked && (
              <div className="space-y-1">
                <NfcRead locale={locale} disabled={!!busy} onRead={() => addObs('rfid.chip_status', 'detected_readable')} />
                <p className="text-xs text-muted">{locale === 'km' ? 'អានបាន មិនបញ្ជាក់ថាពិតទេ។ លទ្ធផលអវិជ្ជមានត្រូវជ្រើសដោយដៃ។' : 'A successful read proves nothing about authenticity. Negative results are chosen by hand.'}</p>
              </div>
            )}
            {defs.length > 0 && !locked ? <ObsForm defs={defs} locale={locale} onAdd={addObs} /> : <p className="text-sm text-muted">—</p>}
            {stage.component === 'date_code' && ev?.datecode && (
              <Notice tone={ev.datecode.usable ? 'info' : 'warn'}>
                <b>{ev.datecode.raw}</b> — {ev.datecode.reason}
                {!ev.datecode.usable && <div className="mt-1 text-xs">{locale === 'km' ? 'តារាង date code នៅជា draft ដូច្នេះមិនរាប់ក្នុងលទ្ធផលទេ។' : 'Date-code tables are still draft, so this is not counted.'}</div>}
                <ul className="mt-1 text-xs">{ev.datecode.candidates.map((c: any, i: number) => <li key={i}>{c.year} · {c.factory}{c.country ? ` (${c.country})` : ''}</li>)}</ul>
              </Notice>
            )}
            {stage.triggered.length > 0 && <Notice tone="bad">{stage.triggered.map((r) => <div key={r.ruleId}>{locale === 'km' ? r.titleKm : r.titleEn}</div>)}</Notice>}
            {stage.supported.length > 0 && <Notice tone="ok">{stage.supported.map((r) => <div key={r.ruleId}>✓ {locale === 'km' ? r.titleKm : r.titleEn}</div>)}</Notice>}
          </div>
        )}
      </div>

      <div className="mx-auto mt-4 max-w-2xl space-y-3">
        <button className="btn-primary" disabled={!!busy || locked} onClick={evaluate}>{busy === 'eval' ? '…' : locale === 'km' ? 'វាយតម្លៃគ្រប់ជំហាន' : 'Evaluate all stages'}</button>
        {ev && (
          summary.readyForSignoff
            ? <Notice tone="ok">{locale === 'km' ? 'គ្រប់ជំហានស្របនឹង reference។ ត្រៀមឲ្យអ្នកជំនាញចុះហត្ថលេខា (នេះមិនទាន់ជាវិញ្ញាបនបត្រទេ)។' : 'Every stage is consistent with references. Ready for expert sign-off (this is not yet a certificate).'}</Notice>
            : <Notice tone={summary.concerns.length ? 'bad' : 'warn'}>
                {summary.concerns.length > 0 && <div>{locale === 'km' ? 'មានចំណុចគួរកត់សម្គាល់៖ ' : 'Concerns: '}{summary.concerns.map(stageName).join(', ')}</div>}
                {summary.pending.length > 0 && <div>{locale === 'km' ? 'នៅខ្វះរូប៖ ' : 'Photos still needed: '}{summary.pending.map(stageName).join(', ')}</div>}
                {summary.insufficient.length > 0 && <div>{locale === 'km' ? 'ភស្តុតាង/ច្បាប់ដែលអនុម័តមិនគ្រប់៖ ' : 'Not enough evidence / approved rules: '}{summary.insufficient.map(stageName).join(', ')}</div>}
              </Notice>
        )}
        <Notice>{locale === 'km' ? 'ជំហានដែលមានចំណុចសង្ស័យមិនបញ្ឈប់ជំហានផ្សេងទេ។ អ្នកអាចបន្តស្កេនគ្រប់ជំហាន ហើយអ្នកជំនាញសម្រេចចុងក្រោយ។' : 'A concern in one stage does not stop the other stages. Keep scanning every stage; the expert makes the final call.'}</Notice>
      </div>
    </Page>
  );
}
