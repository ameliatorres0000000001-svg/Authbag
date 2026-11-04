import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Badge, Notice, errText } from './ui.tsx';
import { normalizeStyleCode, parseStyleCode, type StyleField } from '../shared/styleCode.ts';

interface Part { field: string; code: string; meaning_en: string; meaning_km: string; year: number | null; status: string }
interface Known { id: string; code: string; model_name: string; colour_name: string | null; product_url: string | null; source: string; sources_json: string; notes: string | null; status: string }
interface Data { brand: { id: string; slug: string; name: string }; parts: Part[]; codes: Known[]; aiWeb: boolean }

const FIELD_KM: Record<StyleField, [string, string]> = {
  brand: ['ម៉ាក', 'Brand'], gender: ['ភេទ', 'Gender'], category: ['ប្រភេទ', 'Type'], year: ['ឆ្នាំ', 'Year'], season: ['រដូវ', 'Season'],
  collection: ['ខ្សែ / collection', 'Line'], model: ['លេខម៉ូដែល', 'Model no.'], colour: ['ពណ៌', 'Colour'], size: ['ទំហំ / ប្រភេទ', 'Size / variant'],
};
const SOURCE_LABEL: Record<string, [string, string]> = {
  official_site: ['គេហទំព័រផ្លូវការ', 'Official site'], resale: ['គេហទំព័រលក់បន្ត', 'Resale listing'], ai_web: ['AI ស្វែងរកលើ web', 'AI web search'], admin: ['Admin', 'Admin'],
};
const json = (s: string): string[] => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };

/** Article / style code: split into parts, show the exact model when known, otherwise let the AI search the web for it. */
export default function StyleCodeBox({ brandId }: { brandId: string }) {
  const { t, locale } = useI18n();
  const km = locale === 'km';
  const [d, setD] = useState<Data | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Known | null>(null);
  const [aiNote, setAiNote] = useState<{ text: string; tone: 'warn' | 'bad' } | null>(null);

  useEffect(() => { api.get<Data>(`/api/style-codes?brandId=${brandId}`).then(setD).catch(() => setD(null)); }, [brandId]);
  useEffect(() => { setFound(null); setAiNote(null); }, [code]);

  const norm = normalizeStyleCode(code);
  const parts = useMemo(() => (d ? parseStyleCode(d.brand.slug, code) : null), [d, code]);
  const meaning = (field: string, c: string) => d?.parts.find((p) => p.field === field && p.code === c);
  const exact = d?.codes.find((k) => k.code === norm) ?? found;
  // same model number, other colour / size (everything up to and including the model part)
  const prefixLen = parts ? parts.slice(0, parts.findIndex((p) => p.field === 'model') + 1).reduce((n, p) => n + p.code.length, 0) : 0;
  const siblings = parts && !exact ? d?.codes.filter((k) => k.code.slice(0, prefixLen) === norm.slice(0, prefixLen)) ?? [] : [];
  const hint = parts?.map((p) => `${p.field}=${p.code}${meaning(p.field, p.code) ? ` (${meaning(p.field, p.code)!.meaning_en})` : ''}`).join(', ') ?? '';

  async function search() {
    setBusy(true); setAiNote(null);
    try {
      const r = await api.post<{ match: Known | null; from: string; note?: string }>('/api/style-codes/identify', { brandId, code: norm, hint });
      if (r.match) { setFound(r.match); setD((x) => (x && !x.codes.some((k) => k.code === r.match!.code) ? { ...x, codes: [...x.codes, r.match!] } : x)); }
      else setAiNote({ text: `${t('sc.aiNotFound')}${r.note ? ` — ${r.note}` : ''}`, tone: 'warn' });
    } catch (e) {
      setAiNote({ text: e instanceof ApiError && e.status === 501 ? t('sc.aiOff') : errText(e), tone: 'bad' });
    } finally { setBusy(false); }
  }

  if (!d) return null;
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-xl leading-tight">{t('sc.title')}</h2>
        <p className="text-sm text-muted">{t('sc.help')}</p>
      </div>
      <input className="input font-mono text-lg uppercase tracking-widest" value={code} maxLength={40} placeholder={t('sc.placeholder')}
        onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} />

      {parts && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {parts.map((p) => <span key={p.field} className="rounded border border-strong bg-surface-low px-2 py-1 font-mono text-lg font-semibold">{p.code}</span>)}
          </div>
          <dl className="grid grid-cols-2 gap-1.5 text-sm">
            {parts.filter((p) => p.field !== 'brand').map((p) => {
              const m = meaning(p.field, p.code);
              return (
                <div key={p.field} className="rounded bg-surface-low px-2.5 py-1.5">
                  <dt className="label !mb-0">{FIELD_KM[p.field][km ? 0 : 1]} · {p.code}</dt>
                  <dd className={m ? 'font-semibold' : 'text-muted'}>{m ? (km ? m.meaning_km : m.meaning_en) : ['model', 'size'].includes(p.field) ? p.code : t('sc.unknownPart')}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
      {norm.length >= 6 && !parts && d.brand.slug === 'mcm' && <p className="text-sm text-muted">{t('sc.noFit')}</p>}

      {exact && (
        <div className="rounded-lg border-l-4 border-verified bg-surface-low px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label !mb-0">{t('sc.model')}</span>
            <Badge tone={exact.source === 'official_site' ? 'ok' : 'info'}>{SOURCE_LABEL[exact.source]?.[km ? 0 : 1] ?? exact.source}</Badge>
            {exact.status !== 'approved' && <Badge tone="warn">{t('dc.draftShort')}</Badge>}
          </div>
          <div className="font-serif text-lg leading-tight">{exact.model_name}</div>
          {exact.colour_name && <div className="text-sm">{t('sc.colour')}: {exact.colour_name}</div>}
          {exact.notes && <p className="mt-1 text-xs text-muted">{exact.notes}</p>}
          <ul className="mt-1 space-y-0.5 text-xs">
            {[...new Set([exact.product_url, ...json(exact.sources_json)].filter(Boolean) as string[])].map((u) => (
              <li key={u} className="truncate"><a className="underline" href={u} target="_blank" rel="noreferrer">{u.replace(/^https?:\/\/(www\.)?/, '')}</a></li>
            ))}
          </ul>
        </div>
      )}

      {!exact && siblings.length > 0 && (
        <div className="rounded-lg bg-surface-low px-3 py-2 text-sm">
          <div className="label">{t('sc.sameModel')}</div>
          {siblings.map((s) => <div key={s.id}><span className="font-mono">{s.code}</span> — {s.model_name}{s.colour_name ? ` · ${s.colour_name}` : ''}</div>)}
        </div>
      )}

      {!exact && norm.length >= 6 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">{t('sc.notInDb')}</p>
          {d.aiWeb
            ? <button type="button" className="btn-primary w-full" disabled={busy} onClick={search}>{busy ? t('sc.searching') : `🔎 ${t('sc.aiSearch')}`}</button>
            : <Notice tone="warn">{t('sc.aiOff')}</Notice>}
        </div>
      )}
      {aiNote && <Notice tone={aiNote.tone}>{aiNote.text}</Notice>}

      <p className="text-xs text-muted">{t('sc.disclaimer')}</p>
    </section>
  );
}
