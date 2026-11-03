import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge } from '../ui.tsx';

/**
 * Explainer of how an Entrupy check works, so users understand it before using it. The real check runs in the HENGZ
 * Android app through Entrupy's official SDK, which supplies its own screens and branding (no logo or mock screens here).
 * Shows the real connection status from /api/providers.
 */
export default function EntrupyGuide() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => { api.get<any[]>('/api/providers').then((r) => setStatus(r.find((p) => p.id === 'entrupy')?.status ?? 'not_configured')).catch(() => setStatus('not_configured')); }, []);
  const steps = [1, 2, 3, 4, 5];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <Link to="/check" className="font-mono text-[10px] uppercase tracking-widest text-muted">← {t('check.title')}</Link>
      <header>
        <h1 className="text-[28px] leading-tight">{t('ent.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('ent.subtitle')}</p>
      </header>

      <section className="rounded-2xl bg-charcoal p-4 text-white">
        <h2 className="font-serif text-xl">{t('ent.app.h')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/75">{t('ent.app')}</p>
      </section>

      <section className="flex items-start justify-between gap-3 rounded-2xl border border-hairline bg-surface-card p-4">
        <div>
          <div className="label">{t('ent.status')}</div>
          <p className="text-sm">{status === 'connected' ? t('ent.statusOk') : t('ent.statusNot')}</p>
        </div>
        {status && <Badge tone={status === 'connected' ? 'ok' : 'muted'}>{status}</Badge>}
      </section>

      <section>
        <h2 className="mb-3 text-2xl">{t('ent.steps')}</h2>
        <ol className="relative space-y-4 border-l-2 border-gold/40 pl-6">
          {steps.map((n) => (
            <li key={n} className="relative">
              <span className="absolute -left-[2.15rem] flex h-7 w-7 items-center justify-center rounded-full bg-charcoal font-mono text-xs text-gold">{n}</span>
              <h3 className="font-serif text-lg leading-tight">{t(`s${n}.h`)}</h3>
              <p className="mt-0.5 text-[15px] leading-relaxed">{t(`s${n}`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <h2 className="text-2xl sm:col-span-2">{t('ent.compare')}</h2>
        <div className="rounded-2xl border border-gold bg-gold-light p-4 text-sm leading-relaxed">{t('ent.c.hengz')}</div>
        <div className="rounded-2xl border border-hairline bg-surface-card p-4 text-sm leading-relaxed">{t('ent.c.ent')}</div>
      </section>

      <section className="rounded-2xl border border-hairline bg-surface-card p-4">
        <h2 className="text-lg">{t('ent.before')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>{t('ent.b1')}</li><li>{t('ent.b2')}</li><li>{t('ent.b3')}</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn-primary" href="https://www.entrupy.com/how-to-use/" target="_blank" rel="noopener noreferrer">{t('ent.visit')} ↗</a>
          {me.role === 'owner' && <Link className="btn-ghost" to="/providers">{t('ent.setup')}</Link>}
        </div>
      </section>
    </div>
  );
}
