import React from 'react';
import { useI18n } from './i18n.tsx';

import { LEATHERS as LIST, type LeatherKey } from '../shared/leathers.ts';

export const LEATHERS = LIST.map((l) => l.key);
export type Leather = LeatherKey;
const MARK = Object.fromEntries(LIST.map((l) => [l.key, l.mark])) as Record<Leather, string>;

/** Step "which leather?": the method of every skill depends on it. */
export default function LeatherPicker({ value, onChange }: { value: Leather | null; onChange: (v: Leather) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label={t('skill.leather')}>
      {LEATHERS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)}
          className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${value === k ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'}`}>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-base ${value === k ? 'bg-gold text-charcoal' : 'bg-surface-low text-gold'}`} aria-hidden>{MARK[k]}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight">{t(`paint.surface.${k}`)}</span>
            <span className="block truncate text-[10px] leading-tight text-muted">{t(`skill.leatherSub.${k}`)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** A numbered block of short imperative lines (one AI answer section). */
export function StepList({ title, items, numbered = true }: { title: string; items: string[]; numbered?: boolean }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gold">{title}</div>
      <ol className="space-y-1.5">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${numbered ? 'bg-gold text-charcoal' : 'bg-surface-high text-muted'}`}>{numbered ? i + 1 : '•'}</span>
            <span>{x}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
