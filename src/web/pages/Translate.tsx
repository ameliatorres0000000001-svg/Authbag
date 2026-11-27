import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page, errText } from '../ui.tsx';
import { MeContext } from '../App.tsx';

type L = 'km' | 'th' | 'ms' | 'id';
const LANGS: { k: L; name: string }[] = [
  { k: 'km', name: 'ខ្មែរ' }, { k: 'th', name: 'ไทย' }, { k: 'ms', name: 'Bahasa Melayu' }, { k: 'id', name: 'Bahasa Indonesia' },
];
const NAME: Record<string, string> = { km: 'ខ្មែរ', th: 'ไทย', ms: 'Bahasa Melayu', id: 'Bahasa Indonesia' };
const STAFF_ROLES = ['owner', 'lead_authenticator', 'appraiser'];

/** Khmer ⇄ Thai ⇄ Malay ⇄ Indonesian translator for staff. Nothing is stored. */
export default function TranslatePage() {
  const { t } = useI18n();
  const [from, setFrom] = useState<L | 'auto'>('auto');
  const [to, setTo] = useState<L>('km');
  const [text, setText] = useState('');
  const [check, setCheck] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ from: string; text: string; back: string | null; to: L } | null>(null);
  const [copied, setCopied] = useState(false);

  const swap = () => {
    if (from === 'auto') return;
    setFrom(to); setTo(from);
    if (res) { setText(res.text); setRes(null); }
  };
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(''); setRes(null); setCopied(false);
    try {
      const r = await api.post<{ from: string; text: string; back: string | null }>('/api/translate', { text, to, from: from === 'auto' ? null : from, check });
      setRes({ ...r, to });
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(res?.text ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard not allowed */ }
  };
  const chip = (on: boolean) => `shrink-0 rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`;

  return (
    <Page title={t('tr.title')} subtitle={t('tr.sub')}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-xs text-muted">{t('tr.from')}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('tr.from')}>
            <button type="button" role="radio" aria-checked={from === 'auto'} className={chip(from === 'auto')} onClick={() => setFrom('auto')}>{t('tr.auto')}</button>
            {LANGS.map((l) => <button key={l.k} type="button" role="radio" aria-checked={from === l.k} className={chip(from === l.k)} onClick={() => setFrom(l.k)}>{l.name}</button>)}
          </div>
        </div>

        <textarea className="input min-h-[8rem] w-full" maxLength={3000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('tr.placeholder')} aria-label={t('tr.from')} />

        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>{t('tr.to')}</span>
            <button type="button" className="rounded-full border border-hairline px-3 py-1 disabled:opacity-40" disabled={from === 'auto'} onClick={swap} aria-label={t('tr.swap')}>⇅ {t('tr.swap')}</button>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('tr.to')}>
            {LANGS.map((l) => <button key={l.k} type="button" role="radio" aria-checked={to === l.k} className={chip(to === l.k)} onClick={() => setTo(l.k)}>{l.name}</button>)}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={check} onChange={(e) => setCheck(e.target.checked)} />
          <span>{t('tr.check')}<span className="block text-xs text-muted">{t('tr.checkHint')}</span></span>
        </label>

        <button type="button" className="btn-primary w-full" disabled={busy || !text.trim()} onClick={go}>{busy ? '…' : `🌐 ${t('tr.go')}`}</button>
        {err && <p className="text-sm text-counterfeit" role="alert">{err}</p>}

        {res && (
          <div className="space-y-3 rounded-2xl border border-hairline bg-surface-card p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>{res.from !== 'other' && NAME[res.from] ? `${NAME[res.from]} → ${NAME[res.to]}` : NAME[res.to]}</span>
              <button type="button" className="rounded-full border border-hairline px-3 py-1" onClick={copy}>{copied ? `✓ ${t('tr.copied')}` : `⧉ ${t('tr.copy')}`}</button>
            </div>
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed" lang={res.to}>{res.text}</p>
            {res.back && (
              <div className="border-t border-hairline pt-3">
                <div className="mb-1 text-xs text-muted">{t('tr.back')} ({NAME[res.from] ?? ''})</div>
                <p className="whitespace-pre-wrap break-words text-sm text-muted" lang={res.from}>{res.back}</p>
              </div>
            )}
            <p className="text-[11px] text-muted">{t('tr.note')}</p>
          </div>
        )}
      </div>
    </Page>
  );
}

/** Home shortcut (staff only). */
export function TranslateHome() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  if (!me || !STAFF_ROLES.includes(me.role)) return null;
  return (
    <Link to="/translate" className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3.5 hover:border-gold">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-xl" aria-hidden>🌐</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{t('tr.homeTitle')}</span>
        <span className="block text-xs text-muted">{t('tr.homeSub')}</span>
      </span>
      <span className="text-muted" aria-hidden>›</span>
    </Link>
  );
}
