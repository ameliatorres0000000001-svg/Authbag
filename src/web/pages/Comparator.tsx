import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Badge, Empty, Notice, Page, errText } from '../ui.tsx';

const TXT = {
  title: { km: 'ប្រៀបធៀបរូប', en: 'Side-by-side comparison' },
  sub: {
    km: 'ប្រៀបធៀបរូបដែលកំពុងពិនិត្យ ជាមួយរូប reference ពិតដែលបានអនុម័តតែប៉ុណ្ណោះ។ AI ពន្យល់តែអ្វីដែលឃើញ មិនផ្តល់ភាគរយ ឬសេចក្តីសម្រេចទេ។',
    en: 'Compare the inspected photo with approved authentic references only. The AI explains what is visible. It gives no percentage and no verdict.',
  },
  inspected: { km: 'រូបដែលកំពុងពិនិត្យ', en: 'Inspected photo' },
  reference: { km: 'រូប reference ដែលបានអនុម័ត', en: 'Approved reference' },
  sideBySide: { km: 'ពីរជាប់គ្នា', en: 'Side by side' },
  slider: { km: 'ស្លាយត្រួតគ្នា', en: 'Slider overlay' },
  zoom: { km: 'ពង្រីក', en: 'Zoom' },
  explain: { km: 'ឲ្យ AI ពន្យល់ភាពខុសគ្នា', en: 'Ask AI to explain the differences' },
  none: {
    km: 'មិនទាន់មានរូប reference ពិតដែលបានអនុម័តសម្រាប់ម៉ូដែល/ផ្នែកនេះទេ។ ដាក់រូបចូល "បណ្ណាល័យ reference" ជាមួយវិក្កយបត្រ ឬប្រភពច្បាស់ ហើយឲ្យ reviewer អនុម័តជាមុន។ បើគ្មានវា ប្រព័ន្ធមិនប្រៀបធៀបទេ។',
    en: 'There is no approved authentic reference for this model/component yet. Add photos to the Reference library with a receipt or clear provenance and have a reviewer approve them. Without them the system will not compare.',
  },
  feature: { km: 'ចំណុច', en: 'Feature' }, insp: { km: 'រូបពិនិត្យ', en: 'Inspected' }, ref: { km: 'Reference', en: 'Reference' },
  caveat: { km: 'ប្រយ័ត្នអំពីរូប', en: 'Photo caveat' },
  notAi: { km: 'AI មិនកំណត់ថា ពិត ឬ ក្លែង។ ភាពខុសគ្នាខាងលើអាចមកពីពន្លឺ មុំ ឬគុណភាពរូប។ សូមអ្នកជំនាញបញ្ជាក់ ហើយបញ្ចូលជាការសង្កេតក្នុងទំព័រការត្រួតពិនិត្យ។', en: 'The AI does not decide authentic or counterfeit. Differences may come from lighting, angle or image quality. An appraiser must confirm and record them as observations on the inspection page.' },
  cfg: { km: 'AI មិនទាន់កំណត់ (GEMINI_API_KEY ឬ ANTHROPIC_API_KEY និង AI_MODEL)។', en: 'AI is not configured (GEMINI_API_KEY or ANTHROPIC_API_KEY, plus AI_MODEL).' },
  back: { km: '← ត្រឡប់ទៅការត្រួតពិនិត្យ', en: '← Back to inspection' },
} as const;

export default function Comparator() {
  const { id, captureId } = useParams();
  const { locale } = useI18n();
  const T = (k: keyof typeof TXT) => TXT[k][locale];
  const [info, setInfo] = useState<any>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [view, setView] = useState<string | null>(null);
  const [mode, setMode] = useState<'side' | 'slider'>('side');
  const [zoom, setZoom] = useState(1); const [pos, setPos] = useState(50);
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/captures/${captureId}/references`).then((r) => {
      setInfo(r);
      setSel(r.candidates.slice(0, 3).map((x: any) => x.id));
      setView(r.candidates[0]?.id ?? null);
      if (r.history[0]) setRes(JSON.parse(r.history[0].result_json));
    }).catch((e) => setErr(errText(e)));
  }, [captureId]);

  async function explain() {
    setBusy(true); setErr(null);
    try { setRes(await api.post(`/api/captures/${captureId}/compare`, { assetIds: sel })); }
    catch (e: any) { setErr(e?.status === 501 ? T('cfg') : e?.status === 409 ? T('none') : errText(e)); }
    finally { setBusy(false); }
  }

  const img = (src: string, label: string, clip?: boolean) => (
    <figure className="relative overflow-hidden rounded border border-hairline bg-surface-high" style={{ aspectRatio: '1 / 1' }}>
      <img src={src} alt="" className="h-full w-full object-contain" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }} />
      <figcaption className="absolute left-2 top-2 rounded bg-charcoal/80 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">{label}</figcaption>
    </figure>
  );

  return (
    <Page title={T('title')} subtitle={T('sub')} actions={<Link className="btn-ghost" to={`/inspections/${id}`}>{T('back')}</Link>}>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}
      {info && info.candidates.length === 0 && <Notice tone="warn">{T('none')}</Notice>}
      {info && !info.aiConfigured && <div className="mt-3"><Notice>{T('cfg')}</Notice></div>}

      {info && info.candidates.length > 0 && (
        <>
          <div className="mb-3 mt-4 flex flex-wrap items-center gap-3">
            <button className={mode === 'side' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('side')}>{T('sideBySide')}</button>
            <button className={mode === 'slider' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('slider')}>{T('slider')}</button>
            <label className="flex items-center gap-2 text-xs text-muted">{T('zoom')}
              <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
          </div>

          {mode === 'side' ? (
            <div className="grid gap-3 md:grid-cols-2">
              {img(`/api/captures/${captureId}/image`, T('inspected'))}
              {view && img(`/api/assets/${view}/image`, T('reference'))}
            </div>
          ) : (
            <div className="mx-auto max-w-xl">
              <div className="relative">
                {view && img(`/api/assets/${view}/image`, T('reference'))}
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>{img(`/api/captures/${captureId}/image`, T('inspected'))}</div>
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-gold" style={{ left: `${pos}%` }} />
              </div>
              <input className="mt-2 w-full" type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {info.candidates.map((c: any) => (
              <button key={c.id} onClick={() => setView(c.id)} className={`overflow-hidden rounded border ${view === c.id ? 'border-gold' : 'border-hairline'}`}>
                <img src={`/api/assets/${c.id}/image`} alt="" className="h-16 w-16 object-cover" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            {info.candidates.map((c: any) => (
              <label key={c.id} className="flex items-center gap-1">
                <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id].slice(0, 4) : sel.filter((x) => x !== c.id))} />
                {c.id.slice(-5)} · {c.label_basis}
              </label>
            ))}
          </div>

          <div className="mt-5"><button className="btn-primary" disabled={busy || sel.length === 0 || !info.aiConfigured} onClick={explain}>{busy ? '…' : T('explain')}</button></div>
        </>
      )}

      {res && (
        <div className="mt-6 space-y-3">
          {res.summary && <div className="card text-sm">{res.summary}</div>}
          {res.differences?.length === 0 ? <Empty /> : (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-low font-mono text-[10px] uppercase tracking-widest text-muted"><tr><th className="p-3">{T('feature')}</th><th>{T('insp')}</th><th>{T('ref')}</th><th>{T('caveat')}</th></tr></thead>
                <tbody>{res.differences.map((d: any, i: number) => (
                  <tr key={i} className="border-t border-hairline align-top">
                    <td className="p-3 font-semibold">{d.feature}</td><td>{d.inspected}</td><td>{d.reference}</td>
                    <td className="text-xs text-muted">{d.photoCaveat ? <Badge tone="warn">!</Badge> : null} {d.photoCaveat ?? d.note}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          <Notice tone="warn">{T('notAi')}</Notice>
        </div>
      )}
    </Page>
  );
}
