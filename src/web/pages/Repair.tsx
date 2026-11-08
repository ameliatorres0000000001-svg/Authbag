import React, { useState } from 'react';
import { api, ApiError } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Notice, Page, errText } from '../ui.tsx';
import LeatherPicker, { StepList, type Leather } from '../LeatherPicker.tsx';
import { MembershipNeeded, isMembershipError } from './Membership.tsx';

interface Advice { problem: string; unclear: boolean; severity: 'light' | 'medium' | 'heavy' | null; steps: string[]; materials: string[]; avoid: string[]; pro: string; safety: string }
const PROBLEMS = ['stain', 'mould', 'peeling', 'edge', 'corners', 'scratch', 'odour', 'sticky', 'hardware', 'darkened'];
const SEV: Record<string, string> = { light: 'bg-verified-bg text-verified', medium: 'bg-review-bg text-review', heavy: 'bg-counterfeit-bg text-counterfeit' };

/**
 * 🧽 Clean & repair skill: leather type + a photo of the problem (and/or a few words) → the AI says what it sees and
 * how to fix it on that leather, gentlest first. "Unclear" instead of guessing.
 */
export default function Repair() {
  const { t } = useI18n();
  const [leather, setLeather] = useState<Leather | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Advice | null>(null);
  const [err, setErr] = useState('');
  const [member, setMember] = useState(false);

  const pick = (f: File | null) => { setFile(f); setRes(null); if (preview) URL.revokeObjectURL(preview); setPreview(f ? URL.createObjectURL(f) : null); };
  const addChip = (k: string) => setProblem((p) => (p.includes(t(`repair.p.${k}`)) ? p : `${p ? `${p}, ` : ''}${t(`repair.p.${k}`)}`));
  const ask = async () => {
    if (!leather) return;
    setBusy(true); setErr(''); setRes(null); setMember(false);
    try {
      const fd = new FormData(); fd.append('surface', leather); fd.append('problem', problem.trim()); if (file) fd.append('file', file);
      setRes(await api.post<Advice>('/api/skills/repair', fd));
    } catch (e) {
      if (isMembershipError(e)) setMember(true);
      else setErr(e instanceof ApiError && e.status === 429 ? t('skill.tooMany') : e instanceof ApiError && e.body?.error === 'ai_not_configured' ? t('chat.notConfigured') : errText(e));
    } finally { setBusy(false); }
  };
  const ready = !!leather && (!!file || problem.trim().length >= 5);

  return (
    <Page title={`🧽 ${t('skill.repair')}`} subtitle={t('repair.sub')}>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5">
          <div>
            <h2 className="mb-2 text-base">① {t('skill.leather')}</h2>
            <LeatherPicker value={leather} onChange={(v) => { setLeather(v); setRes(null); }} />
          </div>
          <div>
            <h2 className="mb-2 text-base">② {t('repair.photo')}</h2>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-strong bg-surface-card p-3">
              {preview ? <img src={preview} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-surface-low text-3xl" aria-hidden>📷</span>}
              <span className="min-w-0 flex-1 text-sm">{file ? file.name : t('repair.photoHelp')}</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div>
            <h2 className="mb-2 text-base">③ {t('repair.what')}</h2>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PROBLEMS.map((k) => <button key={k} type="button" onClick={() => addChip(k)} className="rounded-full border border-hairline bg-surface-card px-3 py-1 text-xs hover:border-gold">{t(`repair.p.${k}`)}</button>)}
            </div>
            <textarea className="input min-h-[80px]" maxLength={1000} placeholder={t('repair.whatPh')} value={problem} onChange={(e) => setProblem(e.target.value)} />
          </div>
          <button type="button" className="btn-primary w-full !py-3 text-base" disabled={!ready || busy} onClick={ask}>{busy ? t('skill.thinking') : `✦ ${t('repair.ask')}`}</button>
          {!leather && <p className="text-xs text-muted">{t('skill.pickLeather')}</p>}
        </section>

        <section className="space-y-3" aria-live="polite">
          {busy && <div className="animate-pulse rounded-2xl border border-hairline bg-surface-card p-6 text-sm text-muted">{t('skill.thinking')}</div>}
          {member && <MembershipNeeded />}
          {err && <Notice tone="bad">{err}</Notice>}
          {res && (
            <article className="space-y-4 rounded-2xl border border-gold/40 bg-surface-card p-4">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-semibold leading-snug">{res.problem}</p>
                {res.severity && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${SEV[res.severity]}`}>{t(`repair.sev.${res.severity}`)}</span>}
              </div>
              {res.unclear && <Notice tone="warn">{t('repair.unclear')}</Notice>}
              <StepList title={t('repair.steps')} items={res.steps} />
              <StepList title={t('repair.materials')} items={res.materials} numbered={false} />
              <StepList title={t('skill.avoid')} items={res.avoid} numbered={false} />
              {res.pro && <p className="rounded-xl bg-surface-low px-3 py-2 text-sm">👨‍🔧 {res.pro}</p>}
              {res.safety && <p className="rounded-xl bg-review-bg px-3 py-2 text-xs text-review">⚠️ {res.safety}</p>}
              <p className="text-[11px] text-muted">{t('skill.aiNote')}</p>
            </article>
          )}
          {!res && !busy && !err && !member && (
            <div className="rounded-2xl border border-hairline bg-surface-card p-5 text-sm text-muted">{t('repair.empty')}</div>
          )}
        </section>
      </div>
    </Page>
  );
}
