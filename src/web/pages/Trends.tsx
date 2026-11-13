import React, { useContext, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { Page, errText } from '../ui.tsx';
import { MeContext } from '../App.tsx';
import { shrink } from '../MarketAdmin.tsx';
import { COUNTRIES, FLAG, TrendTable, monthLabel, type Country, type TrendRow } from '../Market.tsx';
import { BADGE_ICON, BALE_CHECKS, CREAM_BRANDS, DEALER_ITEMS, EVEN_TON, SOURCE, searchDealer, searchNames, type DealerItem, type Tier } from '../../shared/dealerGuide.ts';

type Tab = 'market' | 'dealer' | 'bale';
const TIER_TONE: Record<Tier, string> = {
  luxury_vintage: 'bg-[#6b4a2b]', korean_original: 'bg-[#8a5a24]', bale_cream: 'bg-[#25594c]', even_ton: 'bg-[#34506e]',
};

interface Trends {
  country: Country; period: string | null; periods: string[]; rows: TrendRow[];
  year: { year: string; months: number; rows: { brand: string; model: string; months: number; best_rank: number; avg_rank: number }[] } | null;
}

/** Trending second-hand brand models: this month's ranking and this year's (built from the months on file), per country. */
export default function TrendsPage() {
  const { t, locale } = useI18n();
  const [sp, setSp] = useSearchParams();
  const country = (COUNTRIES as readonly string[]).includes(sp.get('country') ?? '') ? sp.get('country') as Country : 'TH';
  const period = sp.get('period') ?? '';
  const [d, setD] = useState<Trends | null>(null);
  const tab: Tab = (['market', 'dealer', 'bale'] as const).includes(sp.get('tab') as Tab) ? sp.get('tab') as Tab : 'market';
  const [q, setQ] = useState('');
  const setTab = (k: Tab) => setSp(k === 'market' ? { country } : { tab: k }, { replace: true });

  useEffect(() => {
    let on = true;
    setD(null);
    api.get<Trends>(`/api/market/trends?country=${country}${period ? `&period=${period}` : ''}`)
      .then((r) => on && setD(r))
      .catch(() => on && setD({ country, period: null, periods: [], rows: [], year: null }));
    return () => { on = false; };
  }, [country, period]);

  const pick = (c: Country) => setSp({ country: c });
  const searching = q.trim().length > 0;

  return (
    <Page title={t('market.title')} subtitle={t('market.sub')}>
      {/* search everything: dealer list, bale lists and this month's ranking */}
      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>🔍</span>
        <input type="search" className="input !pl-9" placeholder={t('dl.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('dl.search')} />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-surface-low p-1" role="tablist">
        {(['market', 'dealer', 'bale'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={!searching && tab === k} onClick={() => { setQ(''); setTab(k); }}
            className={`rounded-xl px-2 py-2 text-[13px] font-semibold ${!searching && tab === k ? 'bg-gold text-charcoal' : 'text-muted'}`}>{t(`dl.tab.${k}`)}</button>
        ))}
      </div>

      {(searching || tab === 'dealer') && <BestSellers q={q} searching={searching} />}
      {(searching || tab === 'bale') && <BaleLists q={q} searching={searching} />}

      {!searching && tab === 'market' && <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
        {COUNTRIES.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === country} onClick={() => pick(c)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm ${c === country ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>
            <span aria-hidden>{FLAG[c]}</span>{t(`market.country.${c}`)}
          </button>
        ))}
      </div>

      {!d && <div className="grid gap-4 md:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-surface-low" /><div className="h-80 animate-pulse rounded-2xl bg-surface-low" /></div>}
      {d && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
          <section aria-labelledby="month-h" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="month-h" className="text-lg">🔥 {t('market.month')}</h2>
              {d.periods.length > 1 && (
                <select className="input !w-auto !py-1 text-xs" aria-label={t('market.pickMonth')} value={d.period ?? ''}
                  onChange={(e) => setSp({ country, period: e.target.value })}>
                  {d.periods.map((p) => <option key={p} value={p}>{monthLabel(p, locale)}</option>)}
                </select>
              )}
            </div>
            <TrendTable country={country} period={d.period} rows={d.rows} />
          </section>

          <section aria-labelledby="year-h" className="min-w-0">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id="year-h" className="text-lg">⭐ {t('market.year')}{d.year ? ` ${d.year.year}` : ''}</h2>
              {d.year && <span className="text-[11px] text-muted">{t('market.yearNote')}: {d.year.months} {t('market.monthsOnFile')}</span>}
            </div>
            <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
              {!d.year || d.year.rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted">{t('noData')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-left text-[11px] text-muted">
                      <th className="px-4 py-2 font-normal">#</th>
                      <th className="py-2 font-normal">{t('market.model')}</th>
                      <th className="py-2 text-right font-normal">{t('market.inMonths')}</th>
                      <th className="px-4 py-2 text-right font-normal">{t('market.best')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.year.rows.map((r, i) => (
                      <tr key={`${r.brand}|${r.model}`} className="border-b border-hairline last:border-b-0">
                        <td className={`px-4 py-2 font-serif text-lg ${i < 3 ? 'text-gold' : 'text-muted'}`}>{i + 1}</td>
                        <td className="py-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{r.brand}</div>
                          <div className="leading-snug">{r.model}</div>
                        </td>
                        <td className="py-2 text-right font-mono text-xs">{r.months}</td>
                        <td className="px-4 py-2 text-right font-mono text-xs">#{r.best_rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted">{t('market.info')}</p>
      </>}
      <p className="mt-4 text-center text-[11px] text-muted">🔒 {t('dl.zeroPrice')}</p>
    </Page>
  );
}

interface BsRow { country: Country; period: string; rank: number; brand: string; model: string; note: string | null; source: string }
interface BsImage { id: string; brand_key: string; model_key: string; created_at: string }
interface BsModel { brand: string; model: string; places: { country: Country; rank: number }[]; notes: string[]; sources: string[]; guide: DealerItem | null; owner: boolean }
const key = (b: string, m: string) => `${b.trim().toLowerCase()}|${m.trim().toLowerCase()}`;

/**
 * 🏆 This month's best sellers: every model of every country's latest month, merged into one card each (photo, brand,
 * model, flags with ranks), then the owner's own Nov notes not already listed. Admins upload the photo on the card.
 */
function BestSellers({ q, searching }: { q: string; searching: boolean }) {
  const { t, locale } = useI18n();
  const me = useContext(MeContext);
  const admin = !!me && ['owner', 'lead_authenticator'].includes(me.role);
  const [data, setData] = useState<{ rows: BsRow[]; images: BsImage[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = () => api.get<{ rows: BsRow[]; images: BsImage[] }>('/api/market/best-sellers').then(setData).catch(() => setData({ rows: [], images: [] }));
  useEffect(() => { load(); }, []);
  if (!data) return <div className="mb-6 grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface-low" />)}</div>;

  const L = (x: { en: string; km: string }) => (locale === 'km' ? x.km : x.en);
  const guides = new Map(DEALER_ITEMS.map((g) => [key(g.brand, g.model), g]));
  const byKey = new Map<string, BsModel>();
  for (const r of data.rows) {
    const k = key(r.brand, r.model);
    const m = byKey.get(k) ?? { brand: r.brand, model: r.model, places: [], notes: [], sources: [], guide: guides.get(k) ?? null, owner: false };
    m.places.push({ country: r.country, rank: r.rank });
    if (r.note && !m.notes.includes(r.note)) m.notes.push(r.note);
    if (!m.sources.includes(r.source)) m.sources.push(r.source);
    byKey.set(k, m);
  }
  for (const g of DEALER_ITEMS) {
    const k = key(g.brand, g.model);
    if (!byKey.has(k)) byKey.set(k, { brand: g.brand, model: g.model, places: [], notes: [], sources: [SOURCE], guide: g, owner: true });
  }
  const best = (m: BsModel) => (m.places.length ? Math.min(...m.places.map((p) => p.rank)) : 99);
  let list = [...byKey.values()].sort((a, b) => Number(a.owner) - Number(b.owner) || best(a) - best(b) || b.places.length - a.places.length);
  if (searching) { const hits = new Set(searchDealer(q).map((g) => key(g.brand, g.model))); const lc = q.trim().toLowerCase();
    list = list.filter((m) => hits.has(key(m.brand, m.model)) || `${m.brand} ${m.model}`.toLowerCase().includes(lc)); }
  const img = new Map(data.images.map((i) => [`${i.brand_key}|${i.model_key}`, i]));
  if (searching && !list.length) return null;

  const upload = async (m: BsModel, f: File) => {
    const k = key(m.brand, m.model); setBusy(k); setErr('');
    try {
      const fd = new FormData(); fd.append('brand', m.brand); fd.append('model', m.model);
      fd.append('file', new File([await shrink(f)], 'photo', { type: f.type === 'image/png' ? 'image/png' : 'image/jpeg' }));
      await api.post('/api/admin/market/images', fd); await load();
    } catch (e) { setErr(errText(e)); } finally { setBusy(''); }
  };

  return (
    <section className="mb-6">
      <h2 className="mb-1 text-lg">🏆 {t('bs.title')}</h2>
      <p className="mb-3 text-[12px] text-muted">{t('bs.help')}{admin ? ` ${t('bs.adminHelp')}` : ''}</p>
      {err && <p className="mb-2 rounded-xl bg-counterfeit/15 px-3 py-2 text-sm">{err}</p>}
      {!list.length && <p className="rounded-2xl bg-surface-low px-4 py-6 text-center text-sm text-muted">{t('noData')}</p>}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {list.map((m) => {
          const k = key(m.brand, m.model); const pic = img.get(k); const on = open === k;
          return (
            <li key={k} className={`overflow-hidden rounded-2xl border bg-surface-card ${on ? 'col-span-2 border-gold md:col-span-3' : 'border-hairline'}`}>
              <button type="button" className="block w-full text-left" onClick={() => setOpen(on ? null : k)} aria-expanded={on}>
                <div className={`relative flex items-center justify-center bg-white ${on ? 'h-60' : 'aspect-square'}`}>
                  {pic ? <img src={`/api/market/images/${pic.id}?v=${encodeURIComponent(pic.created_at)}`} alt={`${m.brand} ${m.model}`} className="h-full w-full object-contain p-2" loading="lazy" />
                    : <span className="text-center text-[12px] text-[#8a8494]"><span className="block text-3xl" aria-hidden>📷</span>{t('bs.noPhoto')}</span>}
                  {m.places.length > 0 && <span className="absolute left-2 top-2 rounded-full bg-charcoal/85 px-2 py-0.5 font-serif text-sm text-gold">#{best(m)}</span>}
                </div>
                <div className="p-3">
                  <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{m.brand}</div>
                  <div className={`text-sm font-semibold leading-snug ${on ? '' : 'line-clamp-2'}`}>{m.model}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.places.map((p) => <span key={p.country} className="rounded-full bg-surface-low px-2 py-0.5 text-[11px]">{FLAG[p.country]} #{p.rank}</span>)}
                    {m.owner && <span className="rounded-full bg-surface-low px-2 py-0.5 text-[11px]">📝 {t('bs.ownerNotes')}</span>}
                    {m.guide?.badges.map((b) => <span key={b} className="rounded-full bg-surface-low px-2 py-0.5 text-[11px]" title={t(`dl.badge.${b}`)}>{BADGE_ICON[b]}{on ? ` ${t(`dl.badge.${b}`)}` : ''}</span>)}
                  </div>
                </div>
              </button>
              {on && (
                <div className="space-y-2 border-t border-hairline p-3 text-[13.5px] leading-snug">
                  {m.notes.map((n, i) => <p key={i}>💬 {n}</p>)}
                  {m.guide && <>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gold">{t('dl.checks')}</div>
                    <ul className="space-y-1">{m.guide.checks.map((c, i) => <li key={i} className="flex gap-2"><span className="text-gold" aria-hidden>›</span>{L(c)}</li>)}</ul>
                    <p>💡 <b>{t('dl.tip')}</b> {L(m.guide.tip)}</p>
                  </>}
                  <p className="text-[11px] text-muted">{t('market.source')}: {m.sources.join(' · ')}</p>
                </div>
              )}
              {admin && (
                <label className={`flex cursor-pointer items-center justify-center gap-1.5 border-t border-hairline px-3 py-2 text-[12px] font-semibold ${pic ? 'text-muted' : 'text-gold'}`}>
                  <input type="file" accept="image/*" className="sr-only" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(m, f); }} />
                  {busy === k ? `⏳ ${t('bs.uploading')}` : pic ? `🔄 ${t('bs.replace')}` : `⬆️ ${t('bs.upload')}`}
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "អីវ៉ាន់តោន": Korean cream-bale brands (Grade A) and even-ton casual items, with the bale checks. */
function BaleLists({ q, searching }: { q: string; searching: boolean }) {
  const { t, locale } = useI18n();
  const cream = searchNames(q, CREAM_BRANDS), even = searchNames(q, EVEN_TON);
  if (searching && !cream.length && !even.length) return null;
  const block = (title: string, sub: string, tone: string, list: string[]) => list.length > 0 && (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <div className={`${tone} px-4 py-3 text-white`}><h3 className="text-base font-semibold">{title}</h3><p className="text-[12px] opacity-90">{sub}</p></div>
      <ol className="divide-y divide-hairline">
        {list.map((n, i) => <li key={n} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="w-5 text-center font-serif text-muted">{i + 1}</span>{n}</li>)}
      </ol>
    </div>
  );
  return (
    <section className="mb-6 space-y-3">
      {block(`📦 ${t('dl.cream')}`, t('dl.creamSub'), TIER_TONE.bale_cream, cream)}
      {block(`🔥 ${t('dl.even')}`, t('dl.evenSub'), TIER_TONE.even_ton, even)}
      {!searching && (
        <div className="rounded-2xl border border-hairline bg-surface-card p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gold">{t('dl.baleChecks')}</div>
          <ul className="space-y-1.5">{BALE_CHECKS.map((c, i) => <li key={i} className="flex gap-2 text-[13.5px]"><span className="text-gold" aria-hidden>✓</span>{locale === 'km' ? c.km : c.en}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
