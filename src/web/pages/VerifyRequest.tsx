import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Notice, OutcomeBadge, errText } from '../ui.tsx';
import { STAFF_ROLES } from '../studio.ts';
import { STATUS_TONE, money, shrink, type Plan } from './Verify.tsx';
import AnnotatedPhoto, { PointCards, type Point } from '../AnnotatedPhoto.tsx';
import { assetImg } from '../studio.ts';

type Ref = { id: string; label: string; status: string; model: string | null; same_model: boolean; points: Point[] };

const ANSWERS: [string, string][] = [['c', 'consistent_with_references'], ['f', 'concerns_found'], ['m', 'insufficient_evidence'], ['r', 'requires_expert_review']];

/** Status of one verification request: waiting (15–30 min), the expert's answer, or a request for more photos. */
export default function VerifyRequest() {
  const { id } = useParams();
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [data, setData] = useState<{ request: any; photos: { id: string; step: string }[]; plan: Plan | null; refs?: Record<string, Ref>; certificate?: any } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => api.get(`/api/verify/${id}`).then(setData).catch((e) => setErr(errText(e))), [id]);
  useEffect(() => { load(); }, [load]);
  // keep checking while the experts work on it
  useEffect(() => {
    if (!data || !['submitted', 'in_review'].includes(data.request.status)) return;
    const h = window.setInterval(load, 20000);
    return () => window.clearInterval(h);
  }, [data, load]);

  if (err) return <div className="mx-auto max-w-2xl p-5"><Notice tone="bad">{err}</Notice></div>;
  if (!data) return <div className="p-8 text-muted">…</div>;
  const r = data.request;
  const waiting = r.status === 'submitted' || r.status === 'in_review';
  const staff = STAFF_ROLES.includes(me.role);

  async function addPhotos(files: File[]) {
    setBusy(true); setErr(null);
    const fd = new FormData();
    for (const f of files.slice(0, 10)) fd.append('extra', await shrink(f), 'extra.jpg');
    try { await api.post(`/api/verify/${id}/photos`, fd); await load(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  async function answer(code: string) {
    setBusy(true);
    try { await api.post(`/api/verify/${id}/answer`, { code, note: note || undefined }); await load(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pb-10 pt-5">
      <Link to="/verify" className="text-sm text-muted">← {t('vr.title')}</Link>
      <header>
        <h1 className="text-[26px] leading-tight">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}</h1>
        <p className="font-mono text-[11px] text-muted">{r.id} · {new Date(r.created_at).toLocaleString()}</p>
      </header>

      <div className="rounded-2xl border border-hairline bg-surface-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{t(`vr.status.${r.status}`)}</span>
          {r.status === 'answered' && <OutcomeBadge outcome={r.expert_outcome} />}
        </div>
        {waiting && (
          <div className="mt-3 flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-gold" aria-hidden />
            <p className="text-sm">{t('vr.waiting')}</p>
          </div>
        )}
        {r.expert_note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-low p-3 text-sm">{r.expert_note}</p>}
        {r.expert_name && <p className="mt-2 text-xs text-muted">{t('vr.expert')}: {r.expert_name}{r.answered_at ? ` · ${new Date(r.answered_at).toLocaleString()}` : ''}</p>}
        {r.entrupy_requested ? <p className="mt-2 text-xs">➕ {t('vr.entrupy')} · {money(data.plan?.entrupy_price_cents, data.plan?.currency ?? 'USD', t('vr.priceLater'))}</p> : null}
        <p className="mt-3 text-[11px] text-muted">{t('vr.disclaimer')}</p>
      </div>

      <CertificateBox requestId={r.id} cert={data.certificate ?? null} canIssue={staff && r.status === 'answered' && r.expert_outcome === 'consistent_with_references'}
        canRevoke={['owner', 'lead_authenticator'].includes(me.role)} onChange={load} />

      {r.status === 'more_photos' && r.user_id === me.id && (
        <label className="btn-primary flex w-full cursor-pointer justify-center !py-3">
          {busy ? '…' : `📷 ${t('vr.addMore')}`}
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy}
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) addPhotos(fs); }} />
        </label>
      )}

      {staff && (
        <div className="space-y-2 rounded-2xl border border-gold p-4">
          <div className="text-sm font-semibold">{t('vr.staffAnswer')}</div>
          {!r.sent && r.telegram_error && <p className="font-mono text-[11px] text-counterfeit">Telegram: {r.telegram_error}</p>}
          <textarea className="input min-h-[4rem]" maxLength={2000} placeholder={t('vr.notePh')} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            {ANSWERS.map(([code, o]) => <button key={code} type="button" className="btn-ghost !text-xs" disabled={busy} onClick={() => answer(code)}>{t(`outcome.${o}`)}</button>)}
          </div>
        </div>
      )}

      <CompareWithRefs photos={data.photos} refs={data.refs ?? {}} />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {data.photos.map((p) => (
          <a key={p.id} href={`/api/verify/photos/${p.id}/image`} target="_blank" rel="noreferrer" className="relative overflow-hidden rounded-xl bg-charcoal">
            <img src={`/api/verify/photos/${p.id}/image`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{t(`vr.step.${p.step}`)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Each of the customer's photos next to a reference photo of the same part (same model first), with the
 * reference's numbered points: what to compare. Teaching aid only; the expert gives the answer.
 */
function CompareWithRefs({ photos, refs }: { photos: { id: string; step: string }[]; refs: Record<string, Ref> }) {
  const { t } = useI18n();
  const pairs = photos.filter((p) => refs[p.step]).filter((p, k, all) => all.findIndex((x) => x.step === p.step) === k);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  if (!pairs.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg leading-tight">⚖ {t('vr.compareTitle')}</h2>
        <p className="text-xs text-muted">{t('vr.compareHelp')}</p>
      </div>
      {pairs.map((p) => {
        const r = refs[p.step];
        const on = open === p.step;
        return (
          <div key={p.step} className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="font-semibold">{t(`vr.step.${p.step}`)}</span>
              {r.points.length > 0 && (
                <button type="button" className="text-xs underline" onClick={() => { setOpen(on ? null : p.step); setActive(null); }}>
                  {on ? t('vr.hidePoints') : `${t('vr.showPoints')} (${r.points.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-px bg-hairline">
              <figure className="bg-charcoal">
                <img src={`/api/verify/photos/${p.id}/image`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                <figcaption className="bg-charcoal px-2 py-1 text-[11px] text-white">{t('vr.yourPhoto')}</figcaption>
              </figure>
              <figure className="bg-charcoal">
                <div className="flex aspect-square items-center justify-center overflow-hidden">
                  <AnnotatedPhoto src={assetImg(r.id)} points={on ? r.points : []} active={active} onPick={on ? setActive : undefined} className="!rounded-none !border-0" />
                </div>
                <figcaption className="truncate bg-charcoal px-2 py-1 text-[11px] text-white">
                  {t('vr.reference')}{r.model ? ` · ${r.model}` : ''} · {r.label === 'authentic' ? t('study.knownGenuine') : t('study.unlabelled')}
                </figcaption>
              </figure>
            </div>
            {on && <div className="p-3"><PointCards points={r.points} active={active} onPick={setActive} empty="" /></div>}
          </div>
        );
      })}
    </section>
  );
}

/**
 * HENGZ expert certificate for this request. Staff issue it by hand (only after the answer
 * "consistent with references"); the customer opens it to print or save as PDF.
 */
function CertificateBox({ requestId, cert, canIssue, canRevoke, onChange }: { requestId: string; cert: any | null; canIssue: boolean; canRevoke: boolean; onChange: () => void }) {
  const { t } = useI18n();
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function issue() {
    if (!window.confirm(t('cert.confirmIssue'))) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/verify/${requestId}/certificate`, { itemDesc: desc || undefined }); onChange(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  async function revoke() {
    const reason = window.prompt(t('cert.revokeReason'));
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/hengz-certificates/${cert.id}/revoke`, { reason: reason.trim() }); onChange(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  if (cert) {
    const revoked = cert.status === 'revoked';
    return (
      <div className={`rounded-2xl border p-4 ${revoked ? 'border-counterfeit/40 bg-counterfeit/5' : 'border-gold bg-gold-light'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-serif text-lg">🏅 {t('cert.title')}</div>
            <div className="font-mono text-xs">{cert.cert_no} · {new Date(cert.issued_at).toLocaleDateString()} · {cert.expert_name}</div>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${revoked ? 'bg-counterfeit text-white' : 'bg-verified text-white'}`}>{revoked ? t('cert.revokedBadge') : t('cert.validBadge')}</span>
        </div>
        {revoked && <p className="mt-2 text-xs">{cert.revoked_reason}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn-primary !py-2 text-xs" href={`/certificate/${cert.public_code}`} target="_blank" rel="noreferrer">⎙ {t('cert.open')}</a>
          {canRevoke && !revoked && <button type="button" className="btn-ghost !py-2 text-xs" disabled={busy} onClick={revoke}>{t('cert.revoke')}</button>}
        </div>
        {err && <p className="mt-2 text-xs text-counterfeit">{err}</p>}
      </div>
    );
  }
  if (!canIssue) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-gold p-4">
      <div className="font-semibold">🏅 {t('cert.issueTitle')}</div>
      <p className="text-xs text-muted">{t('cert.issueHelp')}</p>
      <input className="input text-sm" maxLength={300} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('cert.descPh')} />
      <button type="button" className="btn-primary w-full !py-2.5" disabled={busy} onClick={issue}>{busy ? '…' : `🏅 ${t('cert.issue')}`}</button>
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
