import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Notice, errText } from './ui.tsx';
import type { DateCodeAppearance } from '../shared/datecodeAppearance.ts';

interface Analysis { id: string; referenceIds: string[]; result: DateCodeAppearance; created_at: string }

/**
 * AI description of what a date code looks like (form, size, shape, font, spacing, depth, placement),
 * optionally compared with approved genuine date-code photos of the same brand. Descriptive only, never a verdict.
 * `base` is `/api/assets/:id` or `/api/captures/:id`.
 */
export default function DateCodeAppearanceCard({ base, canRun, askTyped = false }: { base: string; canRun: boolean; askTyped?: boolean }) {
  const { t } = useI18n();
  const [a, setA] = useState<Analysis | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => api.get(`${base}/datecode-analysis`).then((r) => { setA(r.analysis); setAi(r.aiConfigured); }).catch(() => setAi(false)), [base]);
  useEffect(() => { setA(null); setErr(null); load(); }, [load]);

  async function run() {
    setBusy(true); setErr(null);
    try { setA(await api.post(`${base}/datecode-analysis`, askTyped && typed.trim() ? { typed: typed.trim().toUpperCase() } : {})); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  const r = a?.result;
  const rows: [string, React.ReactNode][] = r ? [
    [t('dca.transcription'), <span className="font-mono text-base font-semibold tracking-widest">{r.transcription || '—'}</span>],
    [t('dca.chars'), `${r.characterCount ?? '—'} / ${r.lines ?? '—'}`],
    [t('dca.method'), t(`method.${r.method}`)],
    [t('dca.placement'), r.placement],
    [t('dca.surface'), r.surface],
    [t('dca.font'), r.font],
    [t('dca.size'), <>{r.size}{r.scaleVisible && r.sizeMm != null ? <div className="mt-0.5 font-semibold">{t('dca.mm')}: ≈ {r.sizeMm} mm</div> : <div className="mt-0.5 text-[11px] text-muted">{t('dca.noScale')}</div>}</>],
    [t('dca.spacing'), r.spacing],
    [t('dca.alignment'), r.alignment],
    [t('dca.depth'), r.depthEdges],
  ] : [];

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface-card p-3">
      <div className="label">{t('dca.title')}</div>
      {ai === false && <Notice>{t('dca.aiOff')}</Notice>}
      {canRun && ai && (
        <div className="flex flex-wrap gap-2">
          {askTyped && <input className="input !w-36 font-mono uppercase" maxLength={20} placeholder="CA4109" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('dca.typed')} />}
          <button className="btn-primary" disabled={busy} onClick={run}>{busy ? '…' : a ? t('dca.rerun') : t('dca.run')}</button>
        </div>
      )}
      {err && <Notice tone="bad">{err}</Notice>}
      {!r ? (ai !== false && <p className="text-sm text-muted">{t('dca.none')}</p>) : (
        <>
          {r.summary && <p className="text-sm">{r.summary}</p>}
          <dl className="divide-y divide-hairline text-sm">
            {rows.filter(([, v]) => v !== '' && v != null).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5">
                <dt className="text-xs text-muted">{k}</dt><dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">{a!.referenceIds.length ? `${t('dca.refs')} ${a!.referenceIds.length}` : t('dca.noRefs')}</p>
          {r.differences.length > 0 && (
            <div>
              <div className="label">{t('dca.differences')}</div>
              <ul className="space-y-2">
                {r.differences.map((d, i) => (
                  <li key={i} className="rounded border-l-4 border-gold bg-surface-low px-3 py-2 text-sm">
                    <div className="font-semibold">{d.feature}</div>
                    <div className="grid gap-1 text-xs sm:grid-cols-2">
                      <div><span className="text-muted">{t('dca.inspected')}: </span>{d.inspected}</div>
                      <div><span className="text-muted">{t('dca.reference')}: </span>{d.reference}</div>
                    </div>
                    {d.photoCaveat && <div className="mt-1 text-[11px] italic text-muted">{d.photoCaveat}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.photoIssues.length > 0 && <Notice tone="warn"><b>{t('dca.photoIssues')}:</b> {r.photoIssues.join(' · ')}</Notice>}
        </>
      )}
      <p className="text-[11px] text-muted">{t('dca.honest')}</p>
    </div>
  );
}

export function DateCodeGuide({ open = false }: { open?: boolean }) {
  const { t } = useI18n();
  const parts = ['where', 'form', 'shape', 'size', 'depth', 'match', 'photo'];
  return (
    <details className="group rounded-lg border border-hairline bg-surface-low" open={open}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">{t('dcg.title')}</summary>
      <div className="space-y-3 px-3 pb-3">
        {parts.map((p) => (
          <div key={p}>
            <div className="text-sm font-semibold">{t(`dcg.${p}.h`)}</div>
            <p className="text-sm text-muted">{t(`dcg.${p}`)}</p>
          </div>
        ))}
        <p className="text-[11px] text-muted">{t('dcg.sources')}</p>
      </div>
    </details>
  );
}
