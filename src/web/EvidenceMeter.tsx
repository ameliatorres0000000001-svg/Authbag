import React from 'react';
import { useI18n } from './i18n.tsx';
import type { EvidenceCompleteness } from '../shared/stages.ts';

/** Two plain counts as percentages: how much evidence is collected. Never an authenticity probability. */
export default function EvidenceMeter({ e }: { e: EvidenceCompleteness }) {
  const { t } = useI18n();
  const Row = ({ label, pct, a, b }: { label: string; pct: number; a: number; b: number }) => (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span>{label}</span><span className="font-mono tabular-nums">{a}/{b} · <b className="text-sm">{pct}%</b></span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-surface-high" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-surface-low p-3">
      <div className="label !mb-0">{t('ev.title')}</div>
      <Row label={t('ev.photos')} pct={e.photosPercent} a={e.photosDone} b={e.photosRequired} />
      <Row label={t('ev.parts')} pct={e.partsPercent} a={e.partsAssessed} b={e.partsTotal} />
      <p className="text-[11px] leading-snug text-muted">{t('ev.note')}</p>
    </div>
  );
}
