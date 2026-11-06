import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { COUNTRIES, FLAG, type Country, type MarketUpdate, type TrendRow } from './Market.tsx';

const MOVES = ['up', 'down', 'same', 'new'] as const;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const num = (s: string) => { const v = s.replace(/[,\s]/g, ''); return v === '' ? null : /^\d+$/.test(v) ? Number(v) : NaN; };

/** "brand | model | min | max | movement | note" per line → rows ranked by line order. Returns the bad line number on error. */
function parseLines(text: string): { rows: Record<string, unknown>[] } | { bad: number } {
  const rows: Record<string, unknown>[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const [brand = '', model = '', min = '', max = '', mv = '', ...note] = lines[i].split('|').map((x) => x.trim());
    const pmin = num(min); const pmax = num(max);
    const movement = mv.toLowerCase();
    if (!brand || !model || Number.isNaN(pmin) || Number.isNaN(pmax) || (movement && !(MOVES as readonly string[]).includes(movement))) return { bad: i + 1 };
    rows.push({ rank: i + 1, brand, model, price_min: pmin, price_max: pmax, movement: movement || null, note: note.join(' | ') || null });
  }
  return { rows };
}

/** Admin: enter one country's monthly ranking (with its source) and post short market updates. */
export default function MarketAdmin() {
  const { t } = useI18n();
  const [country, setCountry] = useState<Country>('TH');
  const [period, setPeriod] = useState(thisMonth());
  const [currency, setCurrency] = useState('THB');
  const [source, setSource] = useState('');
  const [lines, setLines] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [upd, setUpd] = useState({ country: '' as '' | Country, title: '', body: '', source: '' });
  const [posted, setPosted] = useState<MarketUpdate[]>([]);
  const loadUpdates = useCallback(() => api.get<{ updates: MarketUpdate[] }>('/api/market/updates?limit=10').then((r) => setPosted(r.updates)).catch(() => setPosted([])), []);
  useEffect(() => { loadUpdates(); }, [loadUpdates]);

  const pickCountry = (c: Country) => { setCountry(c); setCurrency(c === 'TH' ? 'THB' : c === 'ID' ? 'IDR' : 'MYR'); };

  const load = async () => {
    setMsg(null);
    try {
      const r = await api.get<{ period: string | null; rows: TrendRow[] }>(`/api/market/trends?country=${country}&period=${period}`);
      if (r.period !== period) { setLines(''); setMsg({ tone: 'bad', text: t('noData') }); return; }
      setLines(r.rows.map((x) => [x.brand, x.model, x.price_min ?? '', x.price_max ?? '', x.movement ?? '', x.note ?? ''].join(' | ').replace(/( \| )+$/, '')).join('\n'));
      if (r.rows[0]) { setSource(r.rows[0].source); if (r.rows[0].currency) setCurrency(r.rows[0].currency); }
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };

  const save = async () => {
    setMsg(null);
    const p = parseLines(lines);
    if ('bad' in p) { setMsg({ tone: 'bad', text: `${t('madm.badLine')}: ${p.bad}` }); return; }
    const rows = p.rows.map((r) => ({ ...r, currency: r.price_min != null || r.price_max != null ? currency : null }));
    try {
      await api.post('/api/admin/market/trends', { country, period, source, rows });
      setMsg({ tone: 'ok', text: `${t('madm.saved')} · ${FLAG[country]} ${period} · ${rows.length}` });
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };

  const del = async () => {
    if (!confirm(t('madm.confirmDelete'))) return;
    try { await api.del(`/api/admin/market/trends?country=${country}&period=${period}`); setLines(''); setMsg({ tone: 'ok', text: t('madm.saved') }); }
    catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };

  const post = async () => {
    setMsg(null);
    try {
      await api.post('/api/admin/market/updates', { country: upd.country || null, title: upd.title, body: upd.body || null, source: upd.source });
      setUpd({ country: '', title: '', body: '', source: '' });
      setMsg({ tone: 'ok', text: t('madm.saved') });
      loadUpdates();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-xl">{t('madm.title')}</h2>
      <div className="flex gap-2">
        {COUNTRIES.map((c) => (
          <button key={c} type="button" onClick={() => pickCountry(c)}
            className={`rounded-full border px-3 py-1 text-sm ${c === country ? 'border-charcoal bg-charcoal text-white' : 'border-hairline'}`}>{FLAG[c]} {t(`market.country.${c}`)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('madm.period')}><input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
        <Field label={t('madm.currency')}>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>{['THB', 'IDR', 'MYR', 'USD'].map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
      </div>
      <Field label={t('madm.source')}><input className="input" value={source} maxLength={300} onChange={(e) => setSource(e.target.value)} /></Field>
      <Field label={t('madm.rows')}>
        <textarea className="input min-h-[160px] font-mono text-xs" value={lines} onChange={(e) => setLines(e.target.value)}
          placeholder={'brand | model | min | max | up/down/same/new | why it sells'} />
      </Field>
      <p className="text-xs text-muted">{t('madm.help')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!lines.trim() || source.trim().length < 3 || !/^\d{4}-\d{2}$/.test(period)} onClick={save}>{t('madm.save')}</button>
        <button type="button" className="btn-ghost" onClick={load}>{t('madm.load')}</button>
        <button type="button" className="btn-ghost text-counterfeit" onClick={del}>{t('madm.deleteMonth')}</button>
      </div>

      <hr className="border-hairline" />
      <h3 className="text-base">{t('market.updates')}</h3>
      <select className="input" value={upd.country} onChange={(e) => setUpd({ ...upd, country: e.target.value as '' | Country })} aria-label={t('madm.country')}>
        <option value="">{t('madm.allCountries')}</option>
        {COUNTRIES.map((c) => <option key={c} value={c}>{FLAG[c]} {t(`market.country.${c}`)}</option>)}
      </select>
      <Field label={t('madm.updTitle')}><input className="input" value={upd.title} maxLength={160} onChange={(e) => setUpd({ ...upd, title: e.target.value })} /></Field>
      <Field label={t('madm.updBody')}><textarea className="input min-h-[80px]" value={upd.body} maxLength={2000} onChange={(e) => setUpd({ ...upd, body: e.target.value })} /></Field>
      <Field label={t('madm.source')}><input className="input" value={upd.source} maxLength={300} onChange={(e) => setUpd({ ...upd, source: e.target.value })} /></Field>
      <button type="button" className="btn-primary" disabled={upd.title.trim().length < 3 || upd.source.trim().length < 3} onClick={post}>{t('madm.post')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {posted.length > 0 && (
        <ul className="divide-y divide-hairline text-sm">
          {posted.map((u) => (
            <li key={u.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{u.country ? FLAG[u.country] : '🌏'} {u.title}</span>
              <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs text-counterfeit"
                onClick={async () => { if (!confirm(t('madm.delete') + '?')) return; await api.del(`/api/admin/market/updates/${u.id}`).catch(() => {}); loadUpdates(); }}>{t('madm.delete')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
