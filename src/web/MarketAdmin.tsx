import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { COUNTRIES, FLAG, modelImageUrl, type Country, type MarketUpdate, type TrendRow } from './Market.tsx';

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
  const [research, setResearch] = useState<{ rows: { brand: string; model: string; reason: string; sources: string[] }[]; sources: { title: string; url: string }[] } | null>(null);
  const [researching, setResearching] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [upd, setUpd] = useState({ country: '' as '' | Country, title: '', body: '', source: '' });
  const [posted, setPosted] = useState<MarketUpdate[]>([]);
  const [photosKey, setPhotosKey] = useState(0);
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

  /** AI looks the market up on the web and fills the form; staff check the links, edit, then save. */
  const askAi = async () => {
    setMsg(null); setResearch(null); setResearching(true);
    try {
      const r = await api.post<{ draft: { rows: { brand: string; model: string; reason: string; price_min: number | null; price_max: number | null; currency: string | null; sources: string[] }[]; sources: { title: string; url: string }[] } }>('/api/admin/market/research', { country, period });
      const d = r.draft;
      if (!d.rows.length) { setMsg({ tone: 'bad', text: t('madm.aiNothing') }); return; }
      setLines(d.rows.map((x) => [x.brand, x.model, x.price_min ?? '', x.price_max ?? '', '', x.reason.replace(/\|/g, '/')].join(' | ')).join('\n'));
      const cur = d.rows.find((x) => x.currency)?.currency; if (cur) setCurrency(cur);
      const hosts = [...new Set(d.sources.map((x) => { try { return new URL(x.url).hostname.replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean))];
      setSource(`${t('madm.aiSource')}: ${hosts.join(', ')}`.slice(0, 300));
      setResearch(d);
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'ai_web_not_configured' ? t('padm.aiWebOff') : errText(e) });
    } finally { setResearching(false); }
  };

  const save = async () => {
    setMsg(null);
    const p = parseLines(lines);
    if ('bad' in p) { setMsg({ tone: 'bad', text: `${t('madm.badLine')}: ${p.bad}` }); return; }
    const rows = p.rows.map((r) => ({ ...r, currency: r.price_min != null || r.price_max != null ? currency : null }));
    try {
      await api.post('/api/admin/market/trends', { country, period, source, rows });
      setMsg({ tone: 'ok', text: `${t('madm.saved')} · ${FLAG[country]} ${period} · ${rows.length}` });
      setPhotosKey((k) => k + 1);
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
        <button type="button" className="btn-ghost" disabled={researching} onClick={askAi}>{researching ? t('padm.researching') : t('madm.askAi')}</button>
        <button type="button" className="btn-ghost text-counterfeit" onClick={del}>{t('madm.deleteMonth')}</button>
      </div>

      {research && (
        <div className="space-y-2 rounded-lg border border-review bg-review-bg p-3 text-sm">
          <p className="font-semibold">{t('madm.aiCheck')}</p>
          <ol className="list-decimal space-y-1 pl-5">
            {research.rows.map((r, i) => (
              <li key={i}><b>{r.brand}</b> {r.model} — {r.reason}{' '}
                {r.sources.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-xs underline">[{k + 1}]</a>)}
              </li>
            ))}
          </ol>
        </div>
      )}
      <ModelPhotos country={country} period={period} refresh={photosKey} />

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

/** Shrink a photo before upload (max 1600 px); PNG stays PNG so an existing transparent background survives. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  const png = file.type === 'image/png';
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode_failed'))), png ? 'image/png' : 'image/jpeg', 0.9));
}

/** Photos of the models in the chosen country + month: upload / replace (AI removes the background), retry the cut, delete. */
function ModelPhotos({ country, period, refresh }: { country: Country; period: string; refresh: number }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TrendRow[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(period)) { setRows([]); return; }
    api.get<{ period: string | null; rows: TrendRow[] }>(`/api/market/trends?country=${country}&period=${period}`)
      .then((r) => setRows(r.period === period ? r.rows : [])).catch(() => setRows([]));
  }, [country, period]);
  useEffect(() => { load(); }, [load, refresh]);

  const upload = async (r: TrendRow, file: File) => {
    setBusy(r.id); setErr('');
    try {
      const fd = new FormData();
      fd.append('brand', r.brand); fd.append('model', r.model);
      fd.append('file', new File([await shrink(file)], 'photo', { type: file.type === 'image/png' ? 'image/png' : 'image/jpeg' }));
      await api.post('/api/admin/market/images', fd);
      load();
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };
  const act = async (r: TrendRow, fn: () => Promise<unknown>) => {
    setBusy(r.id); setErr('');
    try { await fn(); load(); } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-hairline p-3">
      <h3 className="text-base">{t('madm.photos')}</h3>
      <p className="text-xs text-muted">{t('madm.photosHelp')}</p>
      {rows && rows.length === 0 && <p className="text-xs text-muted">{t('madm.photosNone')}</p>}
      <ul className="divide-y divide-hairline">
        {rows?.map((r) => {
          const src = modelImageUrl(r);
          return (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-hairline"
                style={{ background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 12px 12px' }}>
                {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted">—</span>}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate"><span className="font-mono text-xs text-muted">#{r.rank}</span> <b>{r.brand}</b> · {r.model}</div>
                {busy === r.id ? <div className="text-xs text-review">{t('madm.uploading')}</div>
                  : r.image_id && <div className={`text-xs ${r.image_cutout ? 'text-verified' : 'text-review'}`}>{r.image_cutout ? `✓ ${t('madm.cutOk')}` : t('madm.cutNo')}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <label className={`btn-ghost cursor-pointer !px-2 !py-0.5 text-xs ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                  {r.image_id ? t('madm.replace') : t('madm.upload')}
                  <input type="file" accept="image/jpeg,image/png" className="hidden" disabled={!!busy}
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(r, f); }} />
                </label>
                {r.image_id && !r.image_cutout && (
                  <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" disabled={!!busy}
                    onClick={() => act(r, () => api.post(`/api/admin/market/images/${r.image_id}/cutout`))}>{t('madm.retry')}</button>
                )}
                {r.image_id && (
                  <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs text-counterfeit" disabled={!!busy}
                    onClick={() => { if (confirm(`${t('madm.delete')}?`)) act(r, () => api.del(`/api/admin/market/images/${r.image_id}`)); }}>{t('madm.delete')}</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  );
}
