import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { COUNTRIES, FLAG, TrendTable, type Overview } from '../Market.tsx';
import { useI18n } from '../i18n.tsx';
import { FolderCard, LooseFolderCard, type Folder } from '../FeedFolders.tsx';
import Timeline from '../Timeline.tsx';

export interface StudioModel {
  id: string; name: string; brand: string; brand_id: string;
  set: { id: string; slot: number; status: string; teaching_title: string | null; has_note: number; points: number }[];
  study: { genuine: number; counterfeit: number };
}
export interface Studio { setSize: number; models: StudioModel[]; recentStudy: any[]; aiConfigured: boolean }

interface Folders { folders: Folder[]; loose: number; looseCover: string | null; looseLatest: string | null; brands: { id: string; name: string }[] }

// [route, title key, subtitle key, 24×24 icon path, "coming soon"]
const HUB: [string, string, string, string, boolean][] = [
  ['/trends', 'home.trends', 'home.trendsSub', 'M3 17l6-6 4 4 8-8M14 7h7v7', false],
  ['/restore', 'home.restore', 'home.restoreSub', 'M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9 15.6l.8-3zM7 13c-2 0-3 1.5-3 3 0 1.3-.7 2.4-2 3 3.5 1.5 8 .5 8-3a3 3 0 0 0-3-3z', true],
  ['/authenticity', 'home.authentic', 'home.authenticSub', 'M9 12l2 2 4-4M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6z', false],
  ['/chat', 'home.chat', 'home.chatSub', 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01', false],
];

/**
 * Home (Anajak Secondhand): four big buttons — trending models, bag painting lessons, learn & verify originals,
 * AI assistant chat — then the latest market data (TH / ID / MY) and market updates, then the latest posts.
 */
export default function Dashboard() {
  const { t, locale } = useI18n();
  const [market, setMarket] = useState<Overview | null>(null);
  useEffect(() => {
    let on = true;
    api.get<Overview>('/api/market/overview?top=5').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    return () => { on = false; };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-8 pt-4 md:px-8">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-gold">Anajak Secondhand</div>
        <h1 className="text-2xl leading-tight md:text-3xl">{t('home.headline')}</h1>
      </header>

      <nav className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={t('dashboard')}>
        {HUB.map(([to, title, sub, icon, soon], i) => (
          <Link key={to} to={to} className={`group relative flex min-h-[132px] flex-col justify-between rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${i === 3 ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>
            <div className="flex items-start justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${i === 3 ? 'bg-gold text-charcoal' : 'bg-gold-light text-charcoal'}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={icon} /></svg>
              </span>
              {soon ? <span className="rounded-full bg-review-bg px-2 py-0.5 text-[10px] font-semibold text-review">{t('home.soon')}</span>
                : <span className={`font-mono text-xs ${i === 3 ? 'text-gold' : 'text-muted'}`}>0{i + 1}</span>}
            </div>
            <div>
              <div className="mt-3 font-semibold leading-snug">{t(title)}</div>
              <div className={`mt-0.5 text-xs ${i === 3 ? 'text-white/70' : 'text-muted'}`}>{t(sub)}</div>
            </div>
          </Link>
        ))}
      </nav>

      {/* market data, updated every month by the team */}
      <section aria-labelledby="market-h">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="market-h" className="text-lg leading-tight">{t('home.market')}</h2>
          <Link to="/trends" className="text-xs font-semibold text-gold">{t('market.seeAll')} →</Link>
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COUNTRIES.map((cc) => {
            const m = market?.countries.find((x) => x.country === cc);
            return (
              <Link key={cc} to={`/trends?country=${cc}`} className="block w-[85%] shrink-0 snap-center md:w-auto">
                {market ? <TrendTable compact country={cc} period={m?.period ?? null} rows={m?.rows ?? []} />
                  : <div className="h-56 animate-pulse rounded-2xl bg-surface-low" />}
              </Link>
            );
          })}
        </div>

        <h3 className="mb-2 mt-4 text-base">{t('market.updates')}</h3>
        {market && market.updates.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
        <ul className="space-y-2">
          {market?.updates.map((u) => (
            <li key={u.id} className="rounded-xl border border-hairline bg-surface-card p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {u.country && <span aria-hidden>{FLAG[u.country]}</span>}
                <span>{u.country ? t(`market.country.${u.country}`) : t('madm.allCountries')}</span>
                <span>·</span>
                <time dateTime={u.created_at}>{new Date(u.created_at).toLocaleDateString(locale === 'km' ? 'km-KH' : locale)}</time>
              </div>
              <div className="mt-1 font-semibold leading-snug">{u.title}</div>
              {u.body && <p className="mt-1 whitespace-pre-line text-sm text-charcoal/80">{u.body}</p>}
              <div className="mt-1 text-[10px] text-muted">{t('market.source')}: {u.source}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">{t('market.info')}</p>
      </section>

      <Posts />
    </div>
  );
}

/** The latest posts, grouped into one folder per model, with a brand filter (was the old home screen). */
export function Posts() {
  const { t } = useI18n();
  const [brand, setBrand] = useState('');
  const [d, setD] = useState<Folders | null>(null);

  useEffect(() => {
    let on = true;
    setD(null);
    api.get<Folders>(`/api/feed/folders${brand ? `?brandId=${brand}` : ''}`)
      .then((r) => on && setD(r))
      .catch(() => on && setD({ folders: [], loose: 0, looseCover: null, looseLatest: null, brands: [] }));
    return () => { on = false; };
  }, [brand]);
  const [brands, setBrands] = useState<Folders['brands']>([]);
  useEffect(() => { if (d?.brands.length) setBrands(d.brands); }, [d]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl leading-tight md:text-2xl">{t('feed.title')}</h2>
      {brands.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ id: '', name: t('home.all') }, ...brands].map((b) => (
            <button key={b.id || 'all'} type="button" onClick={() => setBrand(b.id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${brand === b.id ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* folders: one per model, small, scroll sideways */}
      {d && (d.folders.length > 0 || d.loose > 0) && (
        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-lg leading-tight">{t('folder.title')}</h3>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{d.folders.length + (d.loose > 0 ? 1 : 0)} {t('folder.folders')}</span>
          </div>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {d.folders.map((f) => <FolderCard key={f.id} f={f} small />)}
            {d.loose > 0 && <LooseFolderCard small n={d.loose} cover={d.looseCover} latest={d.looseLatest} brandId={brand || undefined} />}
          </div>
        </section>
      )}
      {!d && <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] w-[104px] shrink-0 animate-pulse rounded-lg bg-surface-low" />)}</div>}

      {/* albums, single photos and genuine-vs-counterfeit comparisons */}
      <div className="mx-auto max-w-xl md:mx-0"><Timeline brandId={brand || undefined} /></div>
    </div>
  );
}
