import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import type { Overview } from '../Market.tsx';
import { useI18n } from '../i18n.tsx';
import { FolderCard, LooseFolderCard, type Folder } from '../FeedFolders.tsx';
import Timeline from '../Timeline.tsx';
import { LeadsHome } from '../Leads.tsx';
import TrendShowcase from '../TrendShowcase.tsx';

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
 * Anajak Bag: an AI work assistant for second-hand bag vendors (Aran / Rong Kluea).
 * Home: this month's fast-selling models on top, then the skills (🎨 paint, 🔍 check, 🧽 repair, 💬 ask), then (for staff)
 * customers found on TikTok.
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

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-6 pt-3 md:px-8">
      <header className="flex items-center gap-2 text-sm text-muted">
        <span className="h-1.5 w-1.5 rotate-45 bg-gold" aria-hidden />
        <h1 className="font-sans text-sm font-normal">{t('home.headline')}</h1>
      </header>

      {/* this month's fast sellers first: what vendors look at every day */}
      <TrendShowcase market={market} />

      {/* the skills: four tiles in one row, paint first */}
      <section aria-labelledby="skills-h" className="space-y-2">
        <h2 id="skills-h" className="text-base leading-tight">✦ {t('skill.title')}</h2>
        <div className="grid grid-cols-4 gap-2">
          {([['/paint', 'skill.paint', ICON.brush], ['/check', 'skill.check', ICON.scan], ['/repair', 'skill.repair', ICON.wrench], ['/chat', 'skill.chat', ICON.chat]] as const).map(([to, title, icon], i) => (
            <Link key={to} to={to} className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-center transition ${i === 0 ? 'border-gold/50 bg-gold-light' : 'border-hairline bg-surface-card hover:border-gold/50'}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${i === 0 ? 'bg-gold text-charcoal' : 'bg-surface-low text-gold'}`}><Svg d={icon} className="h-5 w-5" /></span>
              <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{t(`${title}Short`)}</span>
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-muted">{t('skill.hint')}</p>
      </section>

      {/* staff: customers found on TikTok */}
      <LeadsHome />

      <section aria-labelledby="tools-h">
        <h2 id="tools-h" className="mb-1.5 text-xs font-semibold text-muted">{t('home.more')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {([['/datecode', 'home.datecode', ICON.shield], ['/verify', 'nav.verify', ICON.trend]] as const).map(([to, title, icon]) => (
            <Link key={to} to={to} className="flex items-center gap-2 rounded-xl border border-hairline bg-surface-card px-3 py-2 text-xs font-semibold transition hover:border-gold">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-light text-gold"><Svg d={icon} className="h-4 w-4" /></span>{t(title)}
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
