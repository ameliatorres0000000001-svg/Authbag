import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Field, Notice, errText } from '../ui.tsx';

/** Sign in, or create a customer account. The very first account (bootstrap) becomes the owner. */
export default function Login({ onDone, onClose }: { onDone: () => void; onClose?: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [bootstrap, setBootstrap] = useState(false);
  const [line, setLine] = useState(false);
  const [register, setRegister] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'register');
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<{ needsBootstrap: boolean; line?: boolean }>('/api/auth/state').then((s) => { setBootstrap(s.needsBootstrap); setLine(!!s.line); }).catch(() => {});
    const e = new URLSearchParams(window.location.search).get('error'); if (e) setErr(e.startsWith('line') ? t('acct.lineFailed') : e); }, []);
  const creating = bootstrap || register;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (bootstrap) await api.post('/api/auth/bootstrap', { email, name, password });
      else if (register) await api.post('/api/auth/register', { email, name, password });
      else await api.post('/api/auth/login', { email, password });
      onDone();
    } catch (e2) { setErr(errText(e2)); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4">
      <form onSubmit={submit} className="card relative w-full max-w-sm space-y-4">
        {onClose && <button type="button" onClick={onClose} aria-label={t('install.close')} className="absolute right-3 top-3 px-2 text-lg text-muted">✕</button>}
        <div>
          <h1 className="text-3xl">HENGZ <span className="text-gold">AUTHENTIC</span></h1>
          <p className="mt-1 text-sm text-muted">{bootstrap ? t('createOwner') : register ? t('acct.createHelp') : t('acct.signInHelp')}</p>
        </div>
        {creating && <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" /></Field>}
        <Field label={t('email')}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
        <Field label={t('password')}>
          <input className="input" type="password" minLength={bootstrap ? 12 : register ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} required
            autoComplete={creating ? 'new-password' : 'current-password'} />
        </Field>
        {register && <p className="-mt-2 text-[11px] text-muted">{t('acct.pwHint')}</p>}
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? '…' : bootstrap ? t('create') : register ? t('acct.create') : t('acct.signIn')}</button>
        {!bootstrap && line && (
          <>
            <div className="flex items-center gap-2 text-[11px] text-muted"><span className="h-px flex-1 bg-hairline" />{t('acct.or')}<span className="h-px flex-1 bg-hairline" /></div>
            <a href="/api/auth/line/start" className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold text-white" style={{ background: '#06C755' }}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.6 7.2 8.4 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.6 1.1-.5 5.9-3.5 8-6C21.4 14.4 22 12.8 22 11c0-4.4-4.5-8-10-8z" /></svg>
              {t('acct.line')}
            </a>
          </>
        )}
        {!bootstrap && (
          <p className="text-center text-sm">
            {register ? t('acct.haveAccount') : t('acct.noAccount')}{' '}
            <button type="button" className="font-semibold underline" onClick={() => { setRegister(!register); setErr(null); }}>{register ? t('acct.signIn') : t('acct.create')}</button>
          </p>
        )}
        <div className="flex justify-center gap-3 text-xs text-muted">
          <button type="button" className={locale === 'km' ? 'font-bold text-charcoal' : ''} onClick={() => setLocale('km')}>ខ្មែរ</button>
          <button type="button" className={locale === 'en' ? 'font-bold text-charcoal' : ''} onClick={() => setLocale('en')}>English</button>
        </div>
      </form>
    </div>
  );
}
