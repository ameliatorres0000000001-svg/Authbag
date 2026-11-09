import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Notice, OutcomeBadge, errText } from '../ui.tsx';
import { STAFF_ROLES } from '../studio.ts';
import { PRECHECK_TONE, STATUS_TONE, money, shrink, type Plan } from './Verify.tsx';
import AnnotatedPhoto, { PointCards, type Point } from '../AnnotatedPhoto.tsx';
import { assetImg } from '../studio.ts';
import ContactInfo from '../ContactInfo.tsx';

type Offer = { id: string; from_side: 'hengz' | 'customer'; amount_cents: number; currency: string; note: string | null; status: string; created_at: string; responded_at: string | null; by_name: string };
type Ref = { id: string; label: string; status: string; model: string | null; same_model: boolean; points: Point[] };

const ANSWERS: [string, string][] = [['c', 'consistent_with_references'], ['f', 'concerns_found'], ['m', 'insufficient_evidence'], ['r', 'requires_expert_review']];

/** Status of one verification request: waiting (15–30 min), the expert's answer, or a request for more photos. */
export default function VerifyRequest() {
  const { id } = useParams();
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [data, setData] = useState<{ request: any; photos: { id: string; step: string }[]; plan: Plan | null; refs?: Record<string, Ref>; certificate?: any; offers?: Offer[]; ai?: any; precheck?: Pc | null; expertReview?: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => api.get(`/api/verify/${id}`).then(setData).catch((e) => setErr(errText(e))), [id]);
  useEffect(() => { load(); }, [load]);
  // keep checking while the experts work on it
  useEffect(() => {
    if (!data) return;
    if (data.precheck?.pending) { const p = window.setInterval(load, 4000); return () => window.clearInterval(p); }
    if (!['submitted', 'in_review'].includes(data.request.status) || data.expertReview === false) return;
    const h = window.setInterval(load, 20000);
    return () => window.clearInterval(h);
  }, [data, load]);

  if (err) return <div className="mx-auto max-w-2xl p-5"><Notice tone="bad">{err}</Notice></div>;
  if (!data) return <div className="p-8 text-muted">…</div>;
  const r = data.request;
  const paused = data.expertReview === false;
  const waiting = !paused && (r.status === 'submitted' || r.status === 'in_review');
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
      <Link to="/verify" className="text-sm text-muted">← {t('nav.verify')}</Link>
      <header>
        <h1 className="text-[26px] leading-tight">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}</h1>
        <p className="font-mono text-[11px] text-muted">{r.id} · {new Date(r.created_at).toLocaleString()}</p>
      </header>

      {data.precheck && <PrecheckCard id={r.id} pc={data.precheck} onChange={load} />}

      <div className={`rounded-2xl border border-hairline bg-surface-card p-4 ${paused && r.status !== 'answered' ? 'hidden' : ''}`}>
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

      {staff && <AiReviewCard requestId={r.id} ai={data.ai ?? null} onChange={load} />}

      <CertificateBox requestId={r.id} cert={data.certificate ?? null} canIssue={staff && r.status === 'answered' && r.expert_outcome === 'consistent_with_references'}
        canRevoke={['owner', 'lead_authenticator'].includes(me.role)} onChange={load} />

      {r.status === 'answered' && r.expert_outcome === 'consistent_with_references' && (
        <BuybackBox requestId={r.id} offers={data.offers ?? []} isOwner={r.user_id === me.id} staff={staff} currency={data.plan?.currency ?? 'USD'} onChange={load} />
      )}

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
  async function remove() {
    if (!window.confirm(t('cert.removeConfirm'))) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/hengz-certificates/${cert.id}/remove`, { reason: 'Removed by admin (test)' }); onChange(); } catch (e) { setErr(errText(e)); }
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
          {canRevoke && <button type="button" className="btn-ghost !py-2 text-xs text-counterfeit" disabled={busy} onClick={remove}>🗑 {t('cert.remove')}</button>}
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

const fmtMoney = (cents: number, cur: string) => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: cur === 'KHR' ? 0 : 2 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${cur}`; }
};
const OFFER_TONE: Record<string, string> = { open: 'bg-gold-light text-ink', accepted: 'bg-verified text-white', declined: 'bg-counterfeit/10 text-counterfeit', withdrawn: 'bg-surface-high text-muted', superseded: 'bg-surface-high text-muted' };

/**
 * Buy-back after "consistent with references": HENGZ offers a price and/or the customer sends theirs.
 * The other side accepts or declines; a new price replaces the open one. Once accepted, HENGZ arranges the buy-back.
 */
function BuybackBox({ requestId, offers, isOwner, staff, currency, onChange }: { requestId: string; offers: Offer[]; isOwner: boolean; staff: boolean; currency: string; onChange: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState<{ amount: string; currency: string; note: string }>({ amount: '', currency, note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (!isOwner && !staff) return null;
  const agreed = offers.find((o) => o.status === 'accepted');
  const open = offers.find((o) => o.status === 'open');
  // which side this viewer speaks for (staff on someone else's request = HENGZ; the request owner = customer)
  const mySide: 'hengz' | 'customer' = isOwner ? 'customer' : 'hengz';
  const canAnswer = (o: Offer) => (o.from_side === 'hengz' ? isOwner : staff);
  const canWithdraw = (o: Offer) => (o.from_side === 'customer' ? isOwner : staff);

  async function send(side: 'hengz' | 'customer') {
    const amount = Number(form.amount.replace(/,/g, ''));
    if (!(amount > 0)) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/verify/${requestId}/offers`, { side, amount, currency: form.currency, note: form.note || undefined }); setForm({ ...form, amount: '', note: '' }); onChange(); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  async function respond(o: Offer, action: 'accept' | 'decline' | 'withdraw') {
    if (action === 'accept' && !window.confirm(`${t('bb.confirmAccept')} ${fmtMoney(o.amount_cents, o.currency)}?`)) return;
    setBusy(true); setErr(null);
    try { await api.post(`/api/verify/offers/${o.id}/respond`, { action }); onChange(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-gold/60 bg-surface-card p-4">
      <div>
        <h2 className="font-serif text-lg leading-tight">💰 {t('bb.title')}</h2>
        <p className="text-xs text-muted">{isOwner ? t('bb.helpCustomer') : t('bb.helpStaff')}</p>
      </div>

      {agreed && (
        <div className="rounded-xl bg-verified/10 p-3 text-sm">
          <div className="font-semibold text-verified">✅ {t('bb.agreed')} {fmtMoney(agreed.amount_cents, agreed.currency)}</div>
          <div className="text-xs">{isOwner ? t('bb.agreedCustomer') : t('bb.agreedStaff')}</div>
          {isOwner && <div className="mt-2"><ContactInfo compact /></div>}
        </div>
      )}

      {offers.length > 0 && (
        <ol className="space-y-2">
          {offers.map((o) => (
            <li key={o.id} className={`rounded-xl border p-3 ${o.from_side === 'hengz' ? 'border-gold/50 bg-gold-light/40' : 'border-hairline bg-surface-low'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">{o.from_side === 'hengz' ? `HENGZ AUTHENTIC · ${t('bb.offer')}` : `${o.by_name} · ${t('bb.asking')}`}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${OFFER_TONE[o.status]}`}>{t(`bb.st.${o.status}`)}</span>
              </div>
              <div className="mt-0.5 font-serif text-2xl leading-tight">{fmtMoney(o.amount_cents, o.currency)}</div>
              {o.note && <p className="mt-1 whitespace-pre-wrap text-[13px]">{o.note}</p>}
              <div className="mt-1 text-[11px] text-muted">{new Date(o.created_at).toLocaleString()}</div>
              {o.status === 'open' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {canAnswer(o) && <>
                    <button type="button" className="btn-primary !py-1.5 text-xs" disabled={busy} onClick={() => respond(o, 'accept')}>✓ {t('bb.accept')}</button>
                    <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => respond(o, 'decline')}>{t('bb.decline')}</button>
                  </>}
                  {canWithdraw(o) && !canAnswer(o) && <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => respond(o, 'withdraw')}>{t('bb.withdraw')}</button>}
                  {!canAnswer(o) && <span className="self-center text-xs text-muted">{t('bb.waiting')}</span>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!agreed && (
        <div className="space-y-2 border-t border-hairline pt-3">
          <div className="text-sm font-semibold">{mySide === 'customer' ? (open?.from_side === 'hengz' ? t('bb.counter') : t('bb.sendPrice')) : (open?.from_side === 'customer' ? t('bb.counterStaff') : t('bb.makeOffer'))}</div>
          <div className="flex gap-2">
            <input className="input min-w-0 flex-1" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} aria-label={t('bb.amount')} />
            <select className="input !w-auto" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} aria-label={t('bb.currency')}>
              {['USD', 'KHR', 'THB', 'VND', 'IDR'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <input className="input" maxLength={500} placeholder={t('bb.notePh')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="button" className="btn-primary w-full !py-2.5" disabled={busy || !(Number(form.amount.replace(/,/g, '')) > 0)} onClick={() => send(mySide)}>
            {busy ? '…' : `💰 ${t('bb.send')}`}
          </button>
        </div>
      )}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </section>
  );
}

const FIND_ICON: Record<string, string> = { matches: '✓', differs: '⚠', unclear: '?' };
const FIND_TONE: Record<string, string> = { matches: 'text-verified', differs: 'text-counterfeit', unclear: 'text-muted' };

/**
 * For experts only: the AI's comparison of each photo with the reference of the same part, and its suggested outcome
 * with confidence. The expert decides; the AI's track record (agreement with experts) is shown beside it.
 */
function AiReviewCard({ requestId, ai, onChange }: { requestId: string; ai: any | null; onChange: () => void }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const km = locale === 'km';
  async function run() {
    setBusy(true); setErr(null);
    try { await api.post(`/api/verify/${requestId}/ai-review`); onChange(); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  const track = ai?.track;
  const ok = ai && ai.suggested_outcome;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <section className="space-y-3 rounded-2xl border border-gold/20 bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg leading-tight">🤖 {t('air.title')}</h2>
          <p className="text-[11px] text-muted">{t('air.staffOnly')}</p>
        </div>
        <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={run}>{busy ? `… ${t('air.running')}` : ai ? `↻ ${t('air.rerun')}` : `▶ ${t('air.run')}`}</button>
      </div>
      {!ai && !busy && <p className="text-sm text-muted">{t('air.none')}</p>}
      {ai?.error && !ok && <p className="font-mono text-[11px] text-counterfeit">{ai.error}</p>}
      {ok && (
        <>
          <div className="rounded-xl bg-surface-low p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('air.suggests')}</span>
              <OutcomeBadge outcome={ai.suggested_outcome} />
              <span className="font-mono text-sm font-semibold">{pct(ai.confidence ?? 0)}</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded bg-hairline"><div className="h-1.5 rounded bg-gold" style={{ width: pct(ai.confidence ?? 0) }} /></div>
            {(km ? ai.summary_km : ai.summary_en) && <p className="mt-2 text-sm leading-snug">{km ? (ai.summary_km || ai.summary_en) : ai.summary_en}</p>}
          </div>
          <ul className="space-y-1.5">
            {ai.findings.map((f: any, i: number) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-hairline px-3 py-2 text-sm">
                <span className={`mt-0.5 w-4 shrink-0 text-center font-bold ${FIND_TONE[f.status]}`}>{FIND_ICON[f.status]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="font-semibold">{km ? (f.feature_km || f.feature_en) : f.feature_en}</span>
                    <span className="font-mono text-[10px] text-muted">{t(`vr.step.${f.step}`)} · {pct(f.confidence)}</span>
                  </div>
                  {(km ? f.note_km || f.note_en : f.note_en) && <p className="text-[13px] leading-snug text-muted">{km ? (f.note_km || f.note_en) : f.note_en}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">{ai.model} · {new Date(ai.created_at).toLocaleString()}</p>
        </>
      )}
      {track && (
        <p className="rounded-lg bg-gold-light px-3 py-2 text-xs">
          📈 {t('air.track')}: {track.rate == null ? t('air.trackNone') : `${pct(track.rate)} (${track.agree}/${track.n})`}
        </p>
      )}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </section>
  );
}

interface PcFinding { step: string; feature_en: string; feature_km: string; status: 'matches' | 'differs' | 'unclear'; note_en: string; note_km: string }
interface Pc { pending: boolean; failed: boolean; refs: number; at: string | null; result: { level: string; summary_en: string; summary_km: string; findings: PcFinding[] } | null }
const STATUS_ICON: Record<string, [string, string]> = { matches: ['✓', 'bg-verified-bg text-verified'], differs: ['!', 'bg-counterfeit-bg text-counterfeit'], unclear: ['?', 'bg-surface-high text-muted'] };

/**
 * AI pre-check, shown to the customer while expert review is paused: the AI's comparison with our reference
 * photos, point by point, and a capped summary. Never a verdict, never a certificate.
 */
function PrecheckCard({ id, pc, onChange }: { id: string; pc: Pc; onChange: () => void }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const km = locale === 'km';
  const retry = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/api/verify/${id}/precheck`); onChange(); }
    catch (e) { const code = (e as { body?: { error?: string } })?.body?.error; setErr(code === 'membership_required' ? t('mb.neededBody') : code === 'precheck_limit' ? t('pc.limit') : errText(e)); }
    finally { setBusy(false); }
  };
  const res = pc.result;
  return (
    <section className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-charcoal text-lg" aria-hidden>🤖</span>
        <h2 className="flex-1 text-lg leading-tight">{t('pc.title')}</h2>
        {res && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PRECHECK_TONE[res.level] ?? ''}`}>{t(`pc.lvl.${res.level}`)}</span>}
      </div>
      {pc.pending && <div className="flex items-center gap-3 rounded-xl bg-surface-low p-3 text-sm"><span className="h-3 w-3 animate-pulse rounded-full bg-gold" />{t('pc.working')}</div>}
      {pc.failed && (
        <div className="space-y-2">
          <Notice tone="warn">{t('pc.failed')}</Notice>
          <button type="button" className="btn-primary" disabled={busy} onClick={retry}>{busy ? '…' : t('pc.retry')}</button>
        </div>
      )}
      {res && (
        <>
          <p className="text-sm">{t(`pc.what.${res.level}`)}</p>
          {(km ? res.summary_km : res.summary_en) && <p className="rounded-xl bg-surface-low p-3 text-sm leading-relaxed">{km ? res.summary_km || res.summary_en : res.summary_en}</p>}
          {pc.refs === 0 && <Notice tone="warn">{t('pc.noRefs')}</Notice>}
          <ul className="space-y-2">
            {res.findings.map((f, i) => {
              const [icon, tone] = STATUS_ICON[f.status] ?? STATUS_ICON.unclear;
              return (
                <li key={i} className="flex gap-3 rounded-xl border border-hairline p-3 text-sm">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-bold ${tone}`} aria-label={t(`pc.st.${f.status}`)}>{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{(km && f.feature_km) || f.feature_en} <span className="text-xs font-normal text-muted">· {t(`vr.step.${f.step}`)} · {t(`pc.st.${f.status}`)}</span></div>
                    {((km && f.note_km) || f.note_en) && <p className="mt-0.5 text-muted">{(km && f.note_km) || f.note_en}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {err && <Notice tone="bad">{err}</Notice>}
      <p className="text-[11px] text-muted">{t('pc.disclaimer')}</p>
    </section>
  );
}
