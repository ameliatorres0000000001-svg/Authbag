import { useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { errText } from './ui.tsx';

/**
 * Staff: ask the AI once to explain the numbered boxes on an original reference photo. The text is stored on each box,
 * so viewers see it with no AI call. Boxes that already have a guide are skipped; "write again" redoes them all.
 */
export default function GuideButton({ assetId, points, onDone }: { assetId: string; points: { guide_json?: string | null }[]; onDone: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!points.length) return null;
  const missing = points.filter((p) => !p.guide_json).length;
  const run = async (force: boolean) => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ done: number; boxes: number }>(`/api/assets/${assetId}/guide`, { force });
      setMsg({ ok: true, text: t('pg.doneN').replace('{n}', String(r.done)) });
      onDone();
    } catch (e) {
      const code = e instanceof ApiError ? e.body?.error : null;
      setMsg({ ok: false, text: code === 'whole_bag' ? t('pg.wholeBag') : code === 'not_original' ? t('pg.notOriginal') : errText(e) });
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1.5 rounded-xl border border-gold/30 bg-surface-low p-3">
      <div className="flex flex-wrap items-center gap-2">
        {missing > 0
          ? <button type="button" className="btn-primary !py-2 text-sm" disabled={busy} onClick={() => run(false)}>✨ {t('pg.write').replace('{n}', String(missing))}</button>
          : <span className="text-xs text-verified">✓ {t('pg.allDone')}</span>}
        {missing < points.length && <button type="button" className="btn-ghost !py-2 text-xs" disabled={busy} onClick={() => run(true)}>{t('pg.again')}</button>}
      </div>
      <p className="text-[11px] text-muted">{busy ? t('pg.busy') : t('pg.once')}</p>
      {msg && <p className={`text-xs ${msg.ok ? 'text-verified' : 'text-counterfeit'}`}>{msg.text}</p>}
    </div>
  );
}
