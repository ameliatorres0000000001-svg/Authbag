import React, { useState } from 'react';
import { useI18n } from './i18n.tsx';
import { REPORT_TONE, renderReportPng, type ReportVerdict } from './reportPng.ts';

export interface ReportPart { step: string; score: number | null; weight: number; note: string }
export interface AiReportProps {
  requestId: string; brand: string; model: string | null; analysedAt: string | null; photoId: string | null;
  verdict: ReportVerdict; score: number | null; reason: string; summary: string; parts: ReportPart[];
}

const GOLD = '#b8922e';
const barColor = (n: number | null) => (n === null ? '#e6dfcf' : n >= 90 ? '#2f7d4f' : n > 60 ? '#b8892a' : '#9b2c2c');

/** SQLite stores "2026-11-15 10:49:57" (UTC) — make that a real date; ISO strings pass through. */
const toDate = (s: string | null): Date => {
  if (!s) return new Date();
  const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

function Paper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="rounded-xl bg-[#fbf8f1] p-2 text-[#1d1b16] shadow-xl">
      <div className="rounded-lg border-[1.5px] p-1" style={{ borderColor: GOLD }}>
        <div className="space-y-4 rounded-md border px-4 pb-5 pt-5" style={{ borderColor: `${GOLD}80` }}>{children}</div>
      </div>
    </section>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 border-b pb-1 font-serif text-[12px] uppercase tracking-[0.18em]" style={{ color: GOLD, borderColor: '#d9c9a0' }}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * The AI result laid out as a standard report sheet (ivory paper, gold frame, report number, seal, score by part) that
 * can be saved or shared as a PNG. It shows the customer's own bag only. It is an AI report from photos: the sheet says
 * so in its title and footer, and it is never a certificate (see CLAUDE.md).
 */
export default function AiReportCard(p: AiReportProps) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [err, setErr] = useState('');
  const tone = REPORT_TONE[p.verdict] ?? REPORT_TONE.unidentified;
  const no = `AR-${p.requestId.replace(/^vr_/, '').slice(0, 8).toUpperCase()}`;
  const date = toDate(p.analysedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const item = [p.brand, p.model].filter(Boolean).join(' · ');
  const label = t(`pc.v.${p.verdict}`).replace('{n}', String(p.score ?? '–'));
  const why = p.verdict === 'unidentified' ? t(p.reason === 'mixed' ? 'pc.why.mixed' : 'pc.why.retake') : '';
  const photoSrc = p.photoId ? `/api/verify/photos/${p.photoId}/image` : null;
  const canShare = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  const make = async (): Promise<Blob> => {
    const get = async (url: string | null) => { if (!url) return null; try { const r = await fetch(url, { credentials: 'same-origin' }); return r.ok ? await r.blob() : null; } catch { return null; } };
    const [photo, logo] = await Promise.all([get(photoSrc), get('/icons/icon-192.png')]);
    return renderReportPng({
      brandName: 'HENGZ AUTHENTIC', title: t('rp.title'), subtitle: locale === 'km' ? 'AI INSPECTION REPORT' : 'របាយការណ៍ពិនិត្យដោយ AI',
      no, noLabel: t('rp.no'), date, dateLabel: t('rp.date'), itemLabel: t('rp.item'), item,
      brand: p.brand, model: p.model ?? '', kvBrand: t('rp.brand'), kvModel: t('rp.model'), kvScore: t('pc.score'),
      statementTitle: t('rp.statementTitle'), statement: t('rp.statement'), noticeTitle: t('rp.noticeTitle'), notice: t('rp.notice'),
      signName: t('rp.sign'), signRole: t('rp.signRole'), analysisTitle: t('rp.analysis'), summaryTitle: t('rp.summary'),
      methodTitle: t('rp.method'), method: [t('rp.m1'), t('rp.m2'), t('rp.m3')], limit: t('rp.limit'), page1: t('rp.p1'), page2: t('rp.p2'),
      verdict: p.verdict, verdictLabel: label, score: p.score, scoreLabel: t('pc.score'), why,
      partsTitle: t('pc.scoresTitle'), noScore: t('pc.noScore'),
      parts: p.parts.map((x) => ({ label: t(`pc.part.${x.step}`), score: x.score, weight: x.weight > 0 ? t('pc.weight').replace('{n}', String(x.weight)) : '', note: x.note })),
      summary: p.summary, disclaimer: t('pc.disclaimer'), footer: t('rp.notCert'),
    }, photo, logo);
  };
  const run = async (kind: 'save' | 'share') => {
    setBusy(kind); setErr('');
    try {
      const blob = await make();
      const name = `AI-Report-${no}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (kind === 'share' && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${t('rp.title')} ${no}` }); } catch (e) { if ((e as Error).name !== 'AbortError') throw e; }
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }
    } catch { setErr(t('rp.failed')); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      {/* page 1: cover. Ivory paper in both themes, like a printed report. Never styled as a certificate (CLAUDE.md). */}
      <Paper label={t('rp.title')}>
        <header className="text-center">
          <img src="/icons/icon-192.png" alt="" width={48} height={48} className="mx-auto rounded-xl" />
          <div className="mt-2 font-serif text-[22px] tracking-[0.14em]">HENGZ <span style={{ color: GOLD }}>AUTHENTIC</span></div>
          <div className="mx-auto my-2 h-px w-16" style={{ background: GOLD }} />
          <h2 className="font-serif text-[17px] font-medium uppercase tracking-[0.12em]">{t('rp.title')}</h2>
        </header>
        <div className="flex justify-between gap-2 border-y py-1.5 font-mono text-[11px]" style={{ borderColor: `${GOLD}66` }}>
          <span>{t('rp.no')}: <b>{no}</b></span>
          <span>{t('rp.date')}: <b>{date}</b></span>
        </div>
        <div className="flex gap-3">
          <div className="h-[112px] w-[112px] shrink-0 overflow-hidden border bg-white" style={{ borderColor: `${GOLD}99` }}>
            {photoSrc && <img src={photoSrc} alt="" className="h-full w-full object-cover" />}
          </div>
          <dl className="min-w-0 flex-1 text-[13px]">
            {([[t('rp.brand'), p.brand], [t('rp.model'), p.model ?? ''], [t('pc.score'), p.score === null ? '–' : `${p.score}%`]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="border-b py-1" style={{ borderColor: '#e3d9be' }}>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-[#6b665a]">{k}</dt>
                <dd className="font-serif text-[17px] leading-tight">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="border p-3 text-center" style={{ borderColor: `${GOLD}99`, borderLeft: `5px solid ${tone.color}` }}>
          <div className="font-serif text-[12px] uppercase tracking-[0.1em]" style={{ color: GOLD }}>{t('rp.statementTitle')}</div>
          <div className="mt-1 text-[15px] font-bold leading-snug" style={{ color: tone.color }}>{label}</div>
          <p className="mt-1.5 text-[12.5px] leading-snug">{t('rp.statement')}</p>
          {why && <p className="mt-1.5 text-[12px] leading-snug" style={{ color: tone.color }}>{why}</p>}
        </div>
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: GOLD }}>{t('rp.noticeTitle')}</div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-[#4a443b]">{t('rp.notice')}</p>
        </div>
        <div className="pt-2">
          <div className="h-px w-40 bg-[#1d1b16]" />
          <div className="mt-1 text-[12px] font-bold">{t('rp.sign')}</div>
          <div className="text-[10.5px] text-[#6b665a]">{t('rp.signRole')}</div>
        </div>
        <footer className="border-t pt-2 text-center" style={{ borderColor: `${GOLD}77` }}>
          <div className="text-[11px] font-bold" style={{ color: GOLD }}>{t('rp.notCert')}</div>
          <div className="text-[10px] text-[#6b665a]">{t('rp.p1')}</div>
        </footer>
      </Paper>

      {/* page 2: analysis */}
      <Paper label={t('rp.analysis')}>
        <header className="text-center">
          <div className="font-serif text-[20px] tracking-[0.14em]">HENGZ <span style={{ color: GOLD }}>AUTHENTIC</span></div>
          <div className="mx-auto my-2 h-px w-16" style={{ background: GOLD }} />
          <h2 className="font-serif text-[17px] font-medium uppercase tracking-[0.12em]">{t('rp.analysis')}</h2>
          <div className="mt-0.5 text-[12px] text-[#6b665a]">{item}</div>
        </header>
        <div className="flex items-center gap-3 border p-3" style={{ borderColor: `${tone.color}55`, background: `${tone.color}14` }}>
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(${tone.color} ${p.score ?? 0}%, #e6dfcf 0)` }}>
            <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[#fbf8f1] text-[16px] font-bold" style={{ color: tone.color }}>{p.score === null ? '–' : `${p.score}%`}</span>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-snug" style={{ color: tone.color }}>{label}</div>
            <div className="text-[12px] text-[#4a443b]">{t('pc.score')}{p.score !== null ? ` ${p.score}%` : ''}</div>
          </div>
        </div>
        {p.summary && <Section title={t('rp.summary')}><p className="text-[12.5px] leading-relaxed">{p.summary}</p></Section>}
        {!!p.parts.length && (
          <Section title={t('pc.scoresTitle')}>
            <ul className="space-y-3">
              {p.parts.map((s) => (
                <li key={s.step}>
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 text-[13px] font-semibold">{t(`pc.part.${s.step}`)}</span>
                    {s.weight > 0 && <span className="text-[10px] text-[#6b665a]">{t('pc.weight').replace('{n}', String(s.weight))}</span>}
                    <span className="min-w-[2.8rem] text-right text-base font-bold">{s.score === null ? '–' : `${s.score}%`}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: '#e6dfcf' }}>
                    <div className="h-full rounded-full" style={{ width: `${s.score ?? 0}%`, background: barColor(s.score) }} />
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-[#6b665a]">{s.score === null ? t('pc.noScore') : s.note}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
        <Section title={t('rp.method')}>
          <ul className="space-y-1">
            {['rp.m1', 'rp.m2', 'rp.m3'].map((k) => <li key={k} className="flex gap-2 text-[12px] leading-snug"><span className="font-bold text-[#2f7d4f]">✓</span>{t(k)}</li>)}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-[#6b665a]">{t('rp.limit')}</p>
        </Section>
        <footer className="border-t pt-2 text-center" style={{ borderColor: `${GOLD}77` }}>
          <div className="text-[11px] font-bold" style={{ color: GOLD }}>{t('rp.notCert')}</div>
          <div className="text-[10px] text-[#6b665a]">{t('rp.p2')} · {no} · {date}</div>
        </footer>
      </Paper>

      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1 !py-3" disabled={!!busy} onClick={() => run('save')}>
          {busy === 'save' ? t('rp.saving') : `⬇ ${t('rp.save')}`}
        </button>
        {canShare && (
          <button type="button" className="btn-ghost !py-3" disabled={!!busy} onClick={() => run('share')}>
            {busy === 'share' ? '…' : `↗ ${t('rp.share')}`}
          </button>
        )}
      </div>
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
