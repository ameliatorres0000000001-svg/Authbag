import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, Page, errText } from '../ui.tsx';

export interface MembershipInfo {
  status: 'staff' | 'trial' | 'active' | 'expired'; trialEnds: string | null; paidUntil: string | null; daysLeft: number; pending: number;
  prices: { usd: number; thb: number }; trialDays: number;
  methods: Record<'khqr' | 'kbank', { qr: boolean; name: string | null; v: string | null }>;
}
interface Payment { id: string; method: 'khqr' | 'kbank'; amount: number; currency: string; months: number; reference: string | null; status: 'pending' | 'approved' | 'rejected'; review_note: string | null; created_at: string }

const TONE: Record<string, string> = { trial: 'bg-review-bg text-review', active: 'bg-verified-bg text-verified', expired: 'bg-counterfeit-bg text-counterfeit', staff: 'bg-surface-high text-muted' };
export const fmtDate = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleDateString(locale === 'km' ? 'km-KH' : locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** One-line membership status (trial days left / active until / expired), for menus and banners. */
export function MembershipLine({ m }: { m: MembershipInfo }) {
  const { t, locale } = useI18n();
  if (m.status === 'staff') return null;
  const text = m.status === 'trial' ? `${t('mb.trial')} · ${m.daysLeft} ${t('mb.daysLeft')}` : m.status === 'active' ? `${t('mb.active')} · ${fmtDate(m.paidUntil, locale)}` : t('mb.expired');
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[m.status]}`}>{text}</span>;
}

/** When an AI feature answers 402: a short card that sends the person to the membership page. */
export function MembershipNeeded() {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-2xl border border-gold bg-gold-light p-4 text-sm">
      <p className="font-semibold">⭐ {t('mb.neededTitle')}</p>
      <p>{t('mb.neededBody')}</p>
      <a href="/subscribe" className="btn-primary inline-block">{t('mb.join')} →</a>
    </div>
  );
}
export const isMembershipError = (e: unknown) => e instanceof ApiError && e.status === 402 && e.body?.error === 'membership_required';

/**
 * Membership: 7-day free trial, then a month at a time by QR — KHQR (USD) or K Bank / PromptPay (THB).
 * The customer pays in their bank app and uploads the slip; staff check it against the bank and approve.
 */
export default function Membership() {
  const { t, locale } = useI18n();
  const [m, setM] = useState<MembershipInfo | null>(null);
  const [mine, setMine] = useState<Payment[]>([]);
  const [method, setMethod] = useState<'khqr' | 'kbank'>(() => (locale === 'th' ? 'kbank' : 'khqr'));
  const [slip, setSlip] = useState<File | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = useCallback(async () => {
    setM(await api.get<MembershipInfo>('/api/membership'));
    setMine((await api.get<{ payments: Payment[] }>('/api/payments/mine')).payments);
  }, []);
  useEffect(() => { load().catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, [load]);

  const send = async () => {
    if (!slip) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('method', method); fd.append('months', '1'); if (ref.trim()) fd.append('reference', ref.trim()); fd.append('file', slip);
      await api.post('/api/payments', fd);
      setSlip(null); setRef(''); setMsg({ tone: 'ok', text: t('mb.sent') }); await load();
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'too_many_pending' ? t('mb.tooMany') : errText(e) });
    } finally { setBusy(false); }
  };

  if (!m) return <Page title={t('mb.title')}><div className="h-40 animate-pulse rounded-2xl bg-surface-low" /></Page>;
  const price = method === 'khqr' ? `$${m.prices.usd}` : `${m.prices.thb.toLocaleString()} ฿`;
  const pm = m.methods[method];

  return (
    <Page title={t('mb.title')} subtitle={t('mb.sub')}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="rounded-2xl border border-hairline bg-surface-card p-4">
            <div className="text-xs text-muted">{t('mb.status')}</div>
            <div className="mt-1"><MembershipLine m={m} /></div>
            {m.status === 'trial' && <p className="mt-2 text-sm">{t('mb.trialHelp').replace('{date}', fmtDate(m.trialEnds, locale))}</p>}
            {m.status === 'expired' && <p className="mt-2 text-sm">{t('mb.expiredHelp')}</p>}
            {m.pending > 0 && <p className="mt-2 text-sm text-review">⏳ {t('mb.pending')}</p>}
          </div>

          {/* what members get */}
          <div className="rounded-2xl border border-gold/40 bg-charcoal p-5 text-white">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-2xl">Pro</span>
              <span className="font-serif text-2xl text-gold">${m.prices.usd} <span className="text-sm text-white/60">/ {t('mb.month')}</span></span>
            </div>
            <div className="text-right text-xs text-white/60">{t('mb.or')} {m.prices.thb.toLocaleString()} ฿ / {t('mb.month')}</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {['mb.f1', 'mb.f2', 'mb.f3', 'mb.f4'].map((k) => <li key={k} className="flex gap-2"><span className="text-gold">✓</span>{t(k)}</li>)}
            </ul>
            <p className="mt-3 text-xs text-white/60">{t('mb.free')}</p>
          </div>
        </section>

        {m.status !== 'staff' && (
          <section className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
            <h2 className="text-lg">{t('mb.pay')}</h2>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-low p-1 text-sm">
              {(['khqr', 'kbank'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setMethod(k)} className={`rounded-full px-3 py-2 ${method === k ? 'bg-gold text-charcoal' : ''}`}>
                  {k === 'khqr' ? `KHQR · $${m.prices.usd}` : `K Bank · ${m.prices.thb} ฿`}
                </button>
              ))}
            </div>
            {pm.qr ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4">
                <img src={`/api/membership/qr/${method}?v=${pm.v}`} alt={method === 'khqr' ? 'KHQR' : 'K Bank QR'} className="w-56 max-w-full" />
                {pm.name && <div className="text-sm font-semibold text-charcoal">{pm.name}</div>}
                <div className="font-serif text-3xl text-charcoal">{price}</div>
              </div>
            ) : <Notice tone="warn">{t('mb.noQr')}</Notice>}
            <ol className="space-y-1 text-sm">
              {['mb.s1', 'mb.s2', 'mb.s3'].map((k, i) => <li key={k} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-charcoal font-mono text-[10px] text-gold">{i + 1}</span>{t(k).replace('{amount}', price)}</li>)}
            </ol>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-strong p-3 text-sm">
              <span className="text-2xl" aria-hidden>🧾</span>
              <span className="min-w-0 flex-1 truncate">{slip ? slip.name : t('mb.slip')}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setSlip(e.target.files?.[0] ?? null)} />
            </label>
            <input className="input" maxLength={80} placeholder={t('mb.ref')} value={ref} onChange={(e) => setRef(e.target.value)} />
            <button type="button" className="btn-primary w-full !py-3" disabled={busy || !slip || !pm.qr} onClick={send}>{busy ? '…' : t('mb.send')}</button>
            {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

            {mine.length > 0 && (
              <ul className="divide-y divide-hairline border-t border-hairline pt-2 text-sm">
                {mine.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1">{p.method === 'khqr' ? 'KHQR' : 'K Bank'} · {p.amount.toLocaleString()} {p.currency} · {fmtDate(p.created_at, locale)}
                      {p.review_note && <span className="block text-xs text-muted">{p.review_note}</span>}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.status === 'approved' ? 'bg-verified-bg text-verified' : p.status === 'rejected' ? 'bg-counterfeit-bg text-counterfeit' : 'bg-review-bg text-review'}`}>{t(`mb.st.${p.status}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Page>
  );
}
