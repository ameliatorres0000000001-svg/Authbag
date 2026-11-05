import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Field, Notice, errText } from '../ui.tsx';

/** Sign in, or create a customer account. The very first account (bootstrap) becomes the owner. */
export default function Login({ onDone, onClose }: { onDone: () => void; onClose?: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [bootstrap, setBootstrap] = useState(false);
  const [register, setRegister] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'register');
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<{ needsBootstrap: boolean }>('/api/auth/state').then((s) => setBootstrap(s.needsBootstrap)).catch(() => {}); }, []);
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
