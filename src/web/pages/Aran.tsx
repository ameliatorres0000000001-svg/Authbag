import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page } from '../ui.tsx';

export interface AranPrice { id: string; category: 'bale' | 'bag' | 'service'; item: string; grade: string | null; price_min: number | null; price_max: number | null; currency: string; unit: string; observed_on: string; source: string; note: string | null }
interface Lesson { id: string; topic: string | null; title: string; body: string; brand: string | null; updated_at: string }
interface Data { lessons: Lesson[]; prices: AranPrice[]; topics: string[] }

const TOPIC_ICON: Record<string, string> = { market: '🏪', bales: '📦', grading: '🔍', pricing: '💰', buyers: '🤝', logistics: '🚚', online: '📱', care: '🎨' };
const money = (n: number | null) => (n === null ? '?' : n.toLocaleString());
const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** Price rows: item (grade) · range / unit · date · source. Shared by the Aran page and the admin board. */
export function PriceTable({ rows, onDelete }: { rows: AranPrice[]; onDelete?: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{r.item}{r.grade && <span className="ml-1.5 rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-normal">{t('aran.grade')} {r.grade}</span>}</div>
            <div className="text-[11px] text-muted">
              {r.observed_on} · {isUrl(r.source) ? <a href={r.source} target="_blank" rel="noreferrer" className="underline">{t('aran.source')}</a> : r.source}
              {r.note && <span className="block">{r.note}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-serif text-lg leading-tight">{r.price_min !== null && r.price_max !== null && r.price_min !== r.price_max ? `${money(r.price_min)}–${money(r.price_max)}` : money(r.price_min ?? r.price_max)}</div>
            <div className="text-[11px] text-muted">{r.currency} / {t(`aran.u.${r.unit}`)}</div>
          </div>
          {onDelete && <button type="button" className="shrink-0 text-xs text-muted" aria-label={t('sk.delete')} onClick={() => onDelete(r.id)}>✕</button>}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Aran (Rong Kluea) second-hand market: lessons staff wrote (active AI skills shown as lessons) and the price
 * board (what staff saw at the market, with the date). Teaching and real data only — empty parts say "no data".
 */
export default function Aran() {
  const { t } = useI18n();
  const [d, setD] = useState<Data | null>(null);
  const [cat, setCat] = useState<AranPrice['category']>('bale');
  const [topic, setTopic] = useState<string>('');
  useEffect(() => { api.get<Data>('/api/aran').then(setD).catch(() => setD({ lessons: [], prices: [], topics: [] })); }, []);
  const prices = useMemo(() => d?.prices.filter((p) => p.category === cat) ?? [], [d, cat]);
  const lessons = useMemo(() => d?.lessons.filter((l) => !topic || l.topic === topic) ?? [], [d, topic]);
  const countOf = (k: string) => d?.lessons.filter((l) => l.topic === k).length ?? 0;
  const latest = d?.prices[0]?.observed_on;

  return (
    <Page title={t('aran.title')} subtitle={t('aran.sub')}>
      <div className="grid gap-5 lg:grid-cols-5">
        {/* price board */}
        <section className="space-y-2 lg:col-span-2" aria-labelledby="aran-prices">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="aran-prices" className="text-lg">🏷️ {t('aran.board')}</h2>
            {latest && <span className="text-[11px] text-muted">{t('aran.updated')} {latest}</span>}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-xs">
            {(['bale', 'bag', 'service'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setCat(k)} aria-pressed={cat === k} className={`rounded-full px-2 py-1.5 ${cat === k ? 'bg-charcoal text-white' : ''}`}>{t(`aran.c.${k}`)}</button>
            ))}
          </div>
          <div className="rounded-2xl border border-hairline bg-surface-card px-4">
            {!d ? <div className="h-24 animate-pulse" /> : prices.length ? <PriceTable rows={prices} /> : <p className="py-4 text-sm text-muted">{t('noData')}</p>}
          </div>
          <p className="text-[11px] text-muted">{t('aran.boardNote')}</p>
        </section>

        {/* lessons */}
        <section className="space-y-3 lg:col-span-3" aria-labelledby="aran-learn">
          <h2 id="aran-learn" className="text-lg">📚 {t('aran.learn')}</h2>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setTopic('')} className={`rounded-full border px-3 py-1 text-xs ${!topic ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{t('sk.a.all')} · {d?.lessons.length ?? 0}</button>
            {(d?.topics ?? []).map((k) => (
              <button key={k} type="button" onClick={() => setTopic(k)} disabled={!countOf(k)}
                className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${topic === k ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{TOPIC_ICON[k]} {t(`aran.t.${k}`)} · {countOf(k)}</button>
            ))}
          </div>
          {d && lessons.length === 0 && <div className="rounded-2xl border border-hairline bg-surface-card p-4 text-sm text-muted">{t('noData')}</div>}
          <div className="space-y-2">
            {lessons.map((l, i) => (
              <details key={l.id} open={i === 0} className="group rounded-2xl border border-hairline bg-surface-card p-4">
                <summary className="flex cursor-pointer list-none items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-light text-lg" aria-hidden>{TOPIC_ICON[l.topic ?? ''] ?? '📘'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{l.title}</span>
                    <span className="block text-[11px] text-muted">{l.topic ? t(`aran.t.${l.topic}`) : t('aran.general')}{l.brand ? ` · ${l.brand}` : ''} · {l.updated_at.slice(0, 10)}</span>
                  </span>
                  <span className="text-xs text-gold transition group-open:rotate-180" aria-hidden>▼</span>
                </summary>
                <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{l.body}</div>
              </details>
            ))}
          </div>
          <Link to="/chat" className="flex items-center justify-between rounded-2xl bg-charcoal p-4 text-white">
            <span><span className="block font-semibold">💬 {t('aran.askAi')}</span><span className="block text-xs text-white/60">{t('aran.askAiSub')}</span></span>
            <span className="text-gold">→</span>
          </Link>
        </section>
      </div>
    </Page>
  );
}
