import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Field, Notice, errText } from '../ui.tsx';

export default function Login({ onDone }: { onDone: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [bootstrap, setBootstrap] = useState(false);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => { api.get<{ needsBootstrap: boolean }>('/api/auth/state').then((s) => setBootstrap(s.needsBootstrap)).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api.post(bootstrap ? '/api/auth/bootstrap' : '/api/auth/login', bootstrap ? { email, name, password } : { email, password });
      onDone();
    } catch (e2) { setErr(errText(e2)); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-3xl">HENGZ <span className="text-gold">AUTHENTIC</span></h1>
          <p className="mt-1 text-xs text-muted">{bootstrap ? t('createOwner') : t('signIn')}</p>
        </div>
        {bootstrap && <Field label={t('name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
        <Field label={t('email')}><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></Field>
        <Field label={t('password')}><input className="input" type="password" minLength={bootstrap ? 12 : 1} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={bootstrap ? 'new-password' : 'current-password'} /></Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <button className="btn-primary w-full" disabled={busy}>{bootstrap ? t('create') : t('signIn')}</button>
        <div className="flex justify-center gap-3 text-xs text-muted">
          <button type="button" className={locale === 'km' ? 'font-bold text-charcoal' : ''} onClick={() => setLocale('km')}>ខ្មែរ</button>
          <button type="button" className={locale === 'en' ? 'font-bold text-charcoal' : ''} onClick={() => setLocale('en')}>English</button>
        </div>
      </form>
    </div>
  );
}
