import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Page } from '../ui.tsx';
import { Posts } from './Dashboard.tsx';

// [route, title key, subtitle key, icon path, needs an account]
const ITEMS: [string, string, string, string, boolean][] = [
  ['/learn', 'auth.lessons', 'auth.lessonsSub', 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7', false],
  ['/datecode', 'auth.datecode', 'auth.datecodeSub', 'M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12', false],
  ['/check', 'auth.scan', 'auth.scanSub', 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8', true],
  ['/check/nfc', 'auth.nfc', 'auth.nfcSub', 'M6 18a8 8 0 0 1 0-12M9.5 15a4 4 0 0 1 0-6M18 6a8 8 0 0 1 0 12M14.5 9a4 4 0 0 1 0 6', true],
  ['/verify', 'auth.cert', 'auth.certSub', 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8', true],
];

/** "Learn & verify originals": the existing lessons, date codes, expert scan, NFC and certificates in one place. */
export default function Authenticity() {
  const { t } = useI18n();
  const me = useContext(MeContext);
  const guest = !me?.id;
  return (
    <Page title={t('auth.title')} subtitle={t('auth.sub')}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map(([to, title, sub, icon, account]) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-4 hover:shadow-md">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-light">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon} /></svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">{t(title)}</span>
              <span className="block text-xs text-muted">{t(sub)}</span>
            </span>
            {account && guest && <span aria-hidden className="text-xs text-muted">🔒</span>}
          </Link>
        ))}
      </div>
      <div className="mt-8"><Posts /></div>
    </Page>
  );
}
