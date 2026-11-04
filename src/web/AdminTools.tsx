import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { OutcomeBadge } from './ui.tsx';

// Sections moved out of the customer tab bar: they live here for staff.
const GROUPS: { title: string; links: [string, string][] }[] = [
  { title: 'adm.gWork', links: [['/inspections', 'inspections'], ['/inspections/new', 'newInspection'], ['/knowledge', 'knowledge'], ['/coverage', 'coverage'], ['/library', 'library']] },
  { title: 'adm.gEntrupy', links: [['/providers', 'adm.entrupySdk'], ['/verify/entrupy', 'adm.entrupyGuide'], ['/certificates', 'adm.providerCerts']] },
  { title: 'adm.gSystem', links: [['/audit', 'audit'], ['/settings', 'settings']] },
];

export default function AdminTools() {
  const { t } = useI18n();
  return (
    <div className="card space-y-3">
      <div className="font-semibold">🧰 {t('adm.tools')}</div>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted">{t(g.title)}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.links.map(([to, k]) => <Link key={to} to={to} className="btn-ghost !px-2.5 !py-1 text-xs">{t(k)}</Link>)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** All verification requests (newest first) and the HENGZ certificates issued. */
export function VerifyQueue() {
  const { t } = useI18n();
  const [rows, setRows] = useState<any[] | null>(null);
  const [certs, setCerts] = useState<any[] | null>(null);
  useEffect(() => {
    api.get('/api/verify?all=1').then((r) => setRows(r.requests)).catch(() => setRows([]));
    api.get('/api/hengz-certificates').then((r) => setCerts(r.certificates)).catch(() => setCerts([]));
  }, []);
  return (
    <div className="card space-y-3">
      <div className="font-semibold">🗂 {t('adm.queue')}</div>
      {rows === null ? <p className="text-xs text-muted">…</p> : !rows.length ? <p className="text-xs text-muted">{t('noData')}</p> : (
        <ul className="max-h-80 divide-y divide-hairline overflow-y-auto text-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/verify/r/${r.id}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{r.brand}{r.model_text ? ` · ${r.model_text}` : ''}<span className="block text-[11px] text-muted">{new Date(r.created_at).toLocaleString()}</span></span>
                {r.status === 'answered' ? <OutcomeBadge outcome={r.expert_outcome} /> : <span className="text-[11px]">{t(`vr.status.${r.status}`)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-hairline pt-2">
        <div className="mb-1 text-xs font-semibold">🏅 {t('cert.list')}</div>
        {certs === null ? <p className="text-xs text-muted">…</p> : !certs.length ? <p className="text-xs text-muted">{t('noData')}</p> : (
          <ul className="divide-y divide-hairline text-xs">
            {certs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                <a href={`/certificate/${c.public_code}`} target="_blank" rel="noreferrer" className="font-mono underline">{c.cert_no}</a>
                <span className="min-w-0 flex-1 truncate">{c.brand}{c.model_text ? ` · ${c.model_text}` : ''}</span>
                <span className={c.status === 'valid' ? 'text-verified' : 'text-counterfeit'}>{c.status === 'valid' ? t('cert.validBadge') : t('cert.revokedBadge')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Admin: test the AI keys and models now, with the provider's own error message when something fails. */
export function AiCheck() {
  const { t } = useI18n();
  const [r, setR] = useState<{ configured: boolean; results: { name: string; model: string; ok: boolean; ms: number; error?: string }[]; untranslated: number } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true); setErr(null);
    try { setR(await api.get('/api/admin/ai/test')); } catch (e) { setErr(String((e as Error).message)); }
    setBusy(false);
  }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">🤖 {t('ai.check')}</div>
        <button type="button" className="btn-primary !py-1 text-xs" disabled={busy} onClick={run}>{busy ? '…' : `🔎 ${t('ai.test')}`}</button>
      </div>
      {r && !r.configured && <p className="text-xs text-counterfeit">{t('ai.noKey')}</p>}
      {r?.results.map((x) => (
        <div key={x.name} className={`rounded-lg p-2 text-xs ${x.ok ? 'bg-verified/10' : 'bg-counterfeit/10'}`}>
          <div className="font-semibold">{x.ok ? '✅' : '❌'} {x.name}</div>
          <div className="font-mono text-[10px] text-muted">{x.model} · {x.ms} ms</div>
          {x.error && <div className="mt-1 break-words font-mono text-[11px] text-counterfeit">{x.error}</div>}
        </div>
      ))}
      {r && <p className="text-xs text-muted">{t('ai.untranslated')}: {r.untranslated}</p>}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
