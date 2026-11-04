import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import DateCodeDecoder from '../DateCodeDecoder.tsx';

type Mode = 'code' | null;

const ICON: Record<string, string> = {
  photo: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  nfc: 'M6 18a8 8 0 0 1 0-12M9.5 15a4 4 0 0 1 0-6M18 6a8 8 0 0 1 0 12M14.5 9a4 4 0 0 1 0 6',
  code: 'M4 7h16M4 12h10M4 17h7',
  official: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4',
};

/**
 * Scan hub = HENGZ expert verification. Scan or upload the key points of the bag, a HENGZ expert answers
 * in 15–30 minutes, and a bag found consistent with our references can receive a HENGZ certificate.
 */
export default function Check() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <header>
        <h1 className="text-[28px] leading-tight">{t('check.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('check.subtitle')}</p>
      </header>

      {/* how it works */}
      <ol className="grid grid-cols-4 gap-1.5 text-center">
        {['check.s1', 'check.s2', 'check.s3', 'check.s4'].map((k, i) => (
          <li key={k} className="rounded-xl border border-hairline bg-surface-card px-1 py-2">
            <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-charcoal font-mono text-[11px] font-bold text-gold">{i + 1}</div>
            <div className="text-[11px] leading-tight">{t(k)}</div>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3">
        <Tile id="photo" title={t('check.photo')} help={t('check.photoHelp')} to="/verify?mode=scan" primary />
        <Tile id="upload" title={t('check.upload')} help={t('check.uploadHelp')} to="/verify?mode=upload" />
        <Tile id="nfc" title={t('check.nfc')} help={t('check.nfcHelp')} to="/check/nfc" />
        <Tile id="code" title={t('check.code')} help={t('check.codeHelp')} active={mode === 'code'} onClick={() => setMode(mode === 'code' ? null : 'code')} />
      </div>
      {mode === 'code' && <DateCodeDecoder />}

      <Link to="/verify" className="flex items-center justify-between rounded-2xl border border-hairline bg-surface-card px-4 py-3 text-sm">
        <span>🗂 {t('vr.mine')}</span><span className="text-muted">→</span>
      </Link>
    </div>
  );
}

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

function Tile({ id, title, help, to, onClick, active, primary }: { id: string; title: string; help: string; to?: string; onClick?: () => void; active?: boolean; primary?: boolean }) {
  const cls = `flex min-h-[9.5rem] flex-col justify-between rounded-2xl border p-4 text-left transition ${
    primary ? 'border-charcoal bg-charcoal text-white' : active ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'} ${active && primary ? 'ring-2 ring-gold' : ''}`;
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
