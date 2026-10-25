import React from 'react';
import { useI18n } from './i18n.tsx';

export function Badge({ tone = 'muted', children }: { tone?: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; children: React.ReactNode }) {
  const c = { ok: 'bg-verified-bg text-verified', warn: 'bg-review-bg text-review', bad: 'bg-counterfeit-bg text-counterfeit', info: 'bg-telemetry-bg text-telemetry', muted: 'bg-surface-high text-muted' }[tone];
  return <span className={`inline-block rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${c}`}>{children}</span>;
}

export const outcomeTone = (o?: string | null) =>
  o === 'consistent_with_references' ? 'ok' : o === 'concerns_found' ? 'bad' : o === 'requires_expert_review' ? 'warn' : 'muted';

export function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  const { t } = useI18n();
  if (!outcome) return <Badge>—</Badge>;
  return <Badge tone={outcomeTone(outcome) as any}>{t(`outcome.${outcome}`)}</Badge>;
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; children: React.ReactNode }) {
  const c = { info: 'border-strong bg-surface-low', warn: 'border-review bg-review-bg', bad: 'border-counterfeit bg-counterfeit-bg', ok: 'border-verified bg-verified-bg' }[tone];
  return <div className={`rounded border-l-4 px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

export function Empty({ children }: { children?: React.ReactNode }) {
  const { t } = useI18n();
  return <div className="rounded border border-dashed border-strong p-8 text-center text-sm text-muted">{children ?? t('noData')}</div>;
}

export function errText(e: unknown): string {
  const any = e as { body?: { error?: string; detail?: string }; message?: string };
  return any?.body?.detail ?? any?.body?.error ?? any?.message ?? 'error';
}
