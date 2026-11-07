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

const ICON = {
  brush: 'M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9 15.6l.8-3zM7 13c-2 0-3 1.5-3 3 0 1.3-.7 2.4-2 3 3.5 1.5 8 .5 8-3a3 3 0 0 0-3-3z',
  shield: 'M9 12l2 2 4-4M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6z',
  trend: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01',
};
const Svg = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
interface Stats { careLessons: number; authLessons: number; referencePhotos: number; brands: number; marketMonths: number }

/**
 * Home (Anajak Secondhand). The app's focus first — ① bag painting & repair lessons, ② learning to check
 * bags — then the AI chat and market trends, real counts of what the app teaches, market data, latest posts.
 */
export default function Dashboard() {
  const { t, locale } = useI18n();
  const [market, setMarket] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let on = true;
    api.get<Overview>('/api/market/overview?top=5').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    api.get<Stats>('/api/stats/public').then((r) => on && setStats(r)).catch(() => {});
    return () => { on = false; };
  }, []);
  const focus: [string, string, string, string, number | undefined][] = [
    ['/restore', 'home.restore', 'home.restoreSub2', ICON.brush, stats?.careLessons],
    ['/authenticity', 'home.authentic', 'home.authenticSub2', ICON.shield, stats?.authLessons],
  ];
  const more: [string, string, string, string][] = [
    ['/chat', 'home.chat', 'home.chatSub', ICON.chat],
    ['/trends', 'home.trends', 'home.trendsSub', ICON.trend],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-8 pt-4 md:px-8">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-gold">Anajak Secondhand</div>
        <h1 className="text-2xl leading-tight md:text-3xl">{t('home.headline')}</h1>
      </header>

      {/* the app's focus: two big lessons cards */}
      <section aria-labelledby="focus-h">
        <h2 id="focus-h" className="mb-2 text-xs font-semibold text-gold">{t('home.focus')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {focus.map(([to, title, sub, icon, n], i) => (
            <Link key={to} to={to} className={`group relative flex min-h-[150px] flex-col justify-between overflow-hidden rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${i === 0 ? 'bg-charcoal text-white' : 'border border-hairline bg-surface-card'}`}>
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full" style={{ background: 'radial-gradient(circle, rgba(197,160,89,0.35), transparent 70%)' }} />
              <div className="relative flex items-start justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${i === 0 ? 'bg-gold text-charcoal' : 'bg-gold-light text-charcoal'}`}><Svg d={icon} className="h-6 w-6" /></span>
                {n !== undefined && <span className={`font-serif text-3xl ${i === 0 ? 'text-gold' : 'text-charcoal'}`}>{n}</span>}
              </div>
              <div className="relative">
                <div className="mt-4 text-lg font-semibold leading-snug">{t(title)}</div>
                <div className={`mt-0.5 text-sm ${i === 0 ? 'text-white/70' : 'text-muted'}`}>{t(sub)} →</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="more-h">
        <h2 id="more-h" className="mb-2 text-xs font-semibold text-muted">{t('home.more')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {more.map(([to, title, sub, icon]) => (
            <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-3 transition hover:shadow-md">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-light"><Svg d={icon} /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{t(title)}</span>
                <span className="block truncate text-xs text-muted">{t(sub)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* real counts, read from the database */}
      {stats && (
        <section aria-labelledby="stats-h" className="rounded-2xl border border-hairline bg-surface-card p-4">
          <h2 id="stats-h" className="mb-3 text-base">{t('stats.title')}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([['careLessons', 'stats.careLessons'], ['authLessons', 'stats.authLessons'], ['referencePhotos', 'stats.photos'], ['brands', 'stats.brands'], ['marketMonths', 'stats.market']] as const).map(([k, label]) => (
              <div key={k} className="rounded-xl bg-surface-low px-3 py-2">
                <dd className="font-serif text-2xl leading-none">{stats[k].toLocaleString(locale === 'km' ? 'km-KH' : locale)}</dd>
                <dt className="mt-1 text-[11px] text-muted">{t(label)}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

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
