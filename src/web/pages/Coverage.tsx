import React, { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Notice, Page } from '../ui.tsx';

export default function Coverage() {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get('/api/coverage').then(setD); }, []);
  const needText = (n: any) => `${t(`need.${n.need}`)}${n.want ? ` (${n.have ?? 0}/${n.want})` : ''}`;
  return (
    <Page title={t('coverage')} subtitle="What each model × production era still needs before the system can responsibly assess it. Computed from the database and the thresholds in Settings — not estimated.">
      {d && <Notice>Thresholds: ≥{d.thresholds.minApprovedRules} approved rules · retrieval ≥{d.thresholds.retrievalMinAuthentic} authentic refs · fine-tune ≥{d.thresholds.finetuneMinAuthentic} authentic + ≥{d.thresholds.finetuneMinCounterfeit} counterfeit refs per era.</Notice>}
      <div className="mt-4 space-y-3">
        {d?.models.map((m: any) => (
          <div key={m.modelId} className="card">
            <div className="font-semibold">{m.brandName} · {m.modelName}</div>
            <div className="mt-2 divide-y divide-hairline">
              {m.rows.map((r: any, i: number) => (
                <div key={i} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span>{r.eraName ?? '—'}</span><Badge tone={r.level.startsWith('L0') || r.level.startsWith('L1') ? 'warn' : 'ok'}>{t(`level.${r.level}`)}</Badge></div>
                  {r.needs.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted">{r.needs.map((n: any, j: number) => <li key={j}>{needText(n)}</li>)}</ul>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
