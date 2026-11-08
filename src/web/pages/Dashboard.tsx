import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { COUNTRIES, FLAG, TrendTable, type Overview } from '../Market.tsx';
import { useI18n } from '../i18n.tsx';
import { FolderCard, LooseFolderCard, type Folder } from '../FeedFolders.tsx';
import Timeline from '../Timeline.tsx';
import { LeadsHome } from '../Leads.tsx';

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
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 12h8',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
};
const Svg = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
interface Stats { paintRecipes: number; careLessons: number; authLessons: number; referencePhotos: number; brands: number; marketMonths: number }

/**
 * Home (Anajak Secondhand): an AI work assistant for second-hand bag vendors. Skills first — 🎨 paint, 🔍 check,
 * 🧽 repair, 💬 ask — then (for staff) customers found on TikTok, then the monthly market ranking.
 */
export default function Dashboard() {
  const { t } = useI18n();
  const [market, setMarket] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    let on = true;
    api.get<Overview>('/api/market/overview?top=5').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    api.get<Stats>('/api/stats/public').then((r) => on && setStats(r)).catch(() => {});
    return () => { on = false; };
  }, []);
  const skills: [string, string, string, string][] = [
    ['/check', 'skill.check', 'skill.checkSub', ICON.scan],
    ['/repair', 'skill.repair', 'skill.repairSub', ICON.wrench],
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-8 pt-5 md:px-8">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-gold">Anajak · AI</div>
        <h1 className="mt-1 text-2xl leading-tight md:text-3xl">{t('home.headline')}</h1>
        <p className="mt-1 text-sm text-muted">{t('home.sub')}</p>
      </header>

      {/* the skills: what the assistant does for the vendor */}
      <section aria-labelledby="skills-h" className="space-y-3">
        <h2 id="skills-h" className="text-xs font-semibold uppercase tracking-widest text-gold">{t('skill.title')}</h2>
        <Link to="/paint" className="group relative block overflow-hidden rounded-3xl border border-gold/40 bg-surface-card p-5 transition hover:border-gold">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(212,175,95,0.35), transparent 70%)' }} />
          <div className="relative flex items-start justify-between gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-charcoal"><Svg d={ICON.brush} className="h-7 w-7" /></span>
            {stats?.paintRecipes ? <span className="text-right"><span className="block font-serif text-3xl leading-none text-gold">{stats.paintRecipes}</span><span className="text-[11px] text-muted">{t('skill.recipes')}</span></span> : null}
          </div>
          <div className="relative mt-4">
            <div className="text-xl font-semibold">{t('skill.paint')}</div>
            <div className="mt-1 text-sm text-muted">{t('skill.paintSub')}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['smooth_leather', 'grained_leather', 'vachetta', 'coated_canvas', 'suede', 'edge'].map((k) => <span key={k} className="rounded-full border border-hairline px-2.5 py-0.5 text-[11px] text-muted">{t(`paint.surface.${k}`)}</span>)}
            </div>
          </div>
        </Link>
        <div className="grid grid-cols-2 gap-3">
          {skills.map(([to, title, sub, icon]) => (
            <Link key={to} to={to} className="flex min-h-[150px] flex-col justify-between rounded-3xl border border-hairline bg-surface-card p-4 transition hover:border-gold">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-light text-gold"><Svg d={icon} className="h-6 w-6" /></span>
              <span className="mt-3 block">
                <span className="block font-semibold leading-snug">{t(title)}</span>
                <span className="mt-0.5 block text-xs text-muted">{t(sub)}</span>
              </span>
            </Link>
          ))}
        </div>
        <Link to="/chat" className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card p-4 transition hover:border-gold">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-light text-gold"><Svg d={ICON.chat} className="h-6 w-6" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{t('skill.chat')}</span><span className="block truncate text-xs text-muted">{t('skill.chatSub')}</span></span>
          <span className="text-gold" aria-hidden>→</span>
        </Link>
      </section>

      {/* staff: customers found on TikTok */}
      <LeadsHome />

      {/* market ranking, updated every month by the team */}
      <section aria-labelledby="market-h">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="market-h" className="text-lg leading-tight">🔥 {t('install.topTitle')}</h2>
          <Link to="/trends" className="text-xs font-semibold text-gold">{t('market.seeAll')} →</Link>
        </div>
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COUNTRIES.map((cc) => {
            const m = market?.countries.find((x) => x.country === cc);
            return (
              <Link key={cc} to={`/trends?country=${cc}`} className="block w-[85%] shrink-0 snap-center md:w-auto">
                {market ? <TrendTable country={cc} period={m?.period ?? null} rows={m?.rows ?? []} compact />
                  : <div className="h-56 animate-pulse rounded-2xl bg-surface-low" />}
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="tools-h">
        <h2 id="tools-h" className="mb-2 text-xs font-semibold text-muted">{t('home.more')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {([['/datecode', 'home.datecode', ICON.shield], ['/verify', 'nav.verify', ICON.trend]] as const).map(([to, title, icon]) => (
            <Link key={to} to={to} className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface-card p-3 text-sm font-semibold transition hover:border-gold">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-light text-gold"><Svg d={icon} /></span>{t(title)}
            </Link>
          ))}
        </div>
      </section>
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
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${brand === b.id ? 'border-gold bg-gold text-charcoal' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
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
