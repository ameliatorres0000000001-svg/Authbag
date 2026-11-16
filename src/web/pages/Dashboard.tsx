import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import type { Overview } from '../Market.tsx';
import { useI18n } from '../i18n.tsx';
import { FolderCard, LooseFolderCard, type Folder } from '../FeedFolders.tsx';
import Timeline from '../Timeline.tsx';
import { LeadsHome } from '../Leads.tsx';
import TrendShowcase from '../TrendShowcase.tsx';
import Galaxy from '../Galaxy.tsx';
import { SCENES, SCENE_PIC, useHomeScene, useHomeLayout } from '../homeTheme.ts';
import Icon from '../Icon.tsx';

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

/**
 * Anajak Bag: an AI work assistant for second-hand bag vendors (Aran / Rong Kluea).
 * Home, on the install screen's galaxy (calm): this month's fast-selling models, then (for staff) customers found on
 * TikTok, then the tools that have no tab of their own. The four skills are not repeated here: they are the bottom tabs.
 */
export default function Dashboard() {
  const { t } = useI18n();
  const [market, setMarket] = useState<Overview | null>(null);
  const [scene, setScene] = useHomeScene();
  const [pickOpen, setPickOpen] = useState(false);
  const [layout, setLayout] = useHomeLayout();
  const bento = layout === 'bento';
  useEffect(() => {
    let on = true;
    api.get<Overview>('/api/market/overview?top=5').then((r) => on && setMarket(r)).catch(() => on && setMarket({ countries: [], updates: [] }));
    return () => { on = false; };
  }, []);

  return (
    <>
      <Galaxy calm scene={scene} />
      <div className="home-glass relative mx-auto max-w-5xl space-y-6 px-4 pb-8 pt-4 md:px-8">
        {!bento && (<>
        {/* hero: the logo on a breathing gold halo and the line of what the app is (ink / muted, so it also reads on the ivory light theme) */}
        <header className="hz-rise-in relative overflow-hidden rounded-3xl border border-gold/25 p-3.5 pr-3"
          style={{ background: 'linear-gradient(135deg, rgba(242,202,80,0.14), rgba(255,255,255,0.04) 55%, rgba(108,64,170,0.12))', WebkitBackdropFilter: 'blur(10px)', backdropFilter: 'blur(10px)' }}>
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.28), transparent 68%)' }} />
          <div className="relative flex items-center gap-3.5">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              <span aria-hidden className="hz-anim absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, rgba(242,202,80,0.55), transparent 70%)', animation: 'hz-pulse 3.6s ease-in-out infinite' }} />
              <span aria-hidden className="hz-anim absolute inset-[3px] rounded-[1.1rem] border border-gold/50" style={{ animation: 'hz-float 5s ease-in-out infinite' }} />
              <img src="/icons/icon-192.png" alt="" width={46} height={46} className="relative rounded-2xl shadow-[0_6px_20px_-4px_rgba(242,202,80,0.6)]" />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-gold">Anajak Bag</div>
              <h1 className="mt-0.5 font-serif text-[21px] font-medium leading-snug text-ink">{t('home.headline')}</h1>
              <p className="mt-1 text-xs leading-snug text-muted">{t('home.sub')}</p>
            </div>
          </div>
          {/* quick actions: straight into the two things vendors do most */}
          <div className="relative mt-3 flex flex-wrap gap-2">
            <Link to="/verify" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#E8CA82] to-[#C29846] px-3.5 py-1.5 text-xs font-semibold text-charcoal shadow-[0_6px_16px_-8px_rgba(242,202,80,0.9)]">
              <Icon name="camera" size={14} />{t('home.pillScan')}
            </Link>
            <Link to="/paint" className="inline-flex items-center gap-1.5 rounded-full border border-gold/45 px-3.5 py-1.5 text-xs font-semibold text-gold">
              <Icon name="palette" size={14} />{t('home.pillPaint')}
            </Link>
          </div>
          {/* background picker: the choice is kept on this phone only */}
          <button type="button" aria-label={t('bg.title')} aria-expanded={pickOpen} onClick={() => setPickOpen((v) => !v)}
            className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 bg-black/25 text-gold backdrop-blur">
            <Icon name="palette" size={16} />
          </button>
          {pickOpen && (
            <div className="relative mt-3 border-t border-gold/20 pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('bg.title')}</div>
              <div className="grid grid-cols-5 gap-1.5">
                {SCENES.map((k) => (
                  <button key={k} type="button" onClick={() => { setScene(k); setPickOpen(false); }} aria-pressed={scene === k}
                    className={`overflow-hidden rounded-xl border-2 text-center ${scene === k ? 'border-gold' : 'border-transparent'}`}>
                    <span className="block h-16 bg-cover bg-center" style={{ backgroundImage: `url(${SCENE_PIC[k]})` }} />
                    <span className="block bg-black/40 py-1 text-[11px] text-white">{t(`bg.${k}`)}</span>
                  </button>
                ))}
              </div>
              <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('lay.title')}</div>
              <div className="grid grid-cols-2 gap-2">
                {(['classic', 'bento'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => { setLayout(k); setPickOpen(false); }} aria-pressed={layout === k}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${layout === k ? 'border-gold bg-gold text-charcoal' : 'border-gold/40 text-gold'}`}>{t(`lay.${k}`)}</button>
                ))}
              </div>
            </div>
          )}
        </header>
        </>)}
        {bento && (
          <>
            {/* bento: a slim title bar, then one big scan tile and small tiles */}
            <header className="hz-rise-in flex items-center gap-3 px-1">
              <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl shadow-[0_6px_20px_-4px_rgba(242,202,80,0.6)]" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-gold">Anajak Bag</div>
                <h1 className="truncate font-serif text-[18px] leading-snug text-ink">{t('home.headline')}</h1>
              </div>
              <button type="button" aria-label={t('bg.title')} aria-expanded={pickOpen} onClick={() => setPickOpen((v) => !v)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-black/25 text-gold backdrop-blur"><Icon name="palette" size={16} /></button>
            </header>
            {pickOpen && (
              <div className="rounded-2xl border border-gold/25 bg-surface-card p-3">
                <div className="grid grid-cols-5 gap-1.5">
                  {SCENES.map((k) => (
                    <button key={k} type="button" onClick={() => { setScene(k); setPickOpen(false); }} aria-pressed={scene === k}
                      className={`overflow-hidden rounded-xl border-2 text-center ${scene === k ? 'border-gold' : 'border-transparent'}`}>
                      <span className="block h-14 bg-cover bg-center" style={{ backgroundImage: `url(${SCENE_PIC[k]})` }} />
                      <span className="block bg-black/40 py-1 text-[10px] text-white">{t(`bg.${k}`)}</span>
                    </button>
                  ))}
                </div>
                <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{t('lay.title')}</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['classic', 'bento'] as const).map((k) => (
                    <button key={k} type="button" onClick={() => { setLayout(k); setPickOpen(false); }} aria-pressed={layout === k}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${layout === k ? 'border-gold bg-gold text-charcoal' : 'border-gold/40 text-gold'}`}>{t(`lay.${k}`)}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Link to="/verify" className="hz-rise-in col-span-2 flex items-center gap-4 rounded-3xl border border-gold/40 p-5 shadow-[0_14px_44px_-20px_rgba(242,202,80,0.55)]"
                style={{ background: 'linear-gradient(120deg, rgba(242,202,80,0.30), rgba(242,202,80,0.06) 70%)' }}>
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-[#E8CA82] to-[#C29846] text-charcoal"><Svg d={ICON.scan} className="h-8 w-8" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-[20px] leading-tight text-ink">{t('home.pillScan')}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t('home.tileScanSub')}</span>
                </span>
                <span aria-hidden className="text-xl text-gold">→</span>
              </Link>
              {([['/paint', 'home.pillPaint', ICON.brush], ['/datecode', 'home.datecode', ICON.shield], ['/chat', 'home.tileChat', ICON.chat], ['/repair', 'home.tileRepair', ICON.wrench]] as const).map(([to, title, icon], i) => (
                <Link key={to} to={to} style={{ animationDelay: `${(i + 1) * 80}ms` }} className="hz-rise-in flex min-h-[112px] flex-col justify-between rounded-2xl border border-gold/25 bg-surface-card p-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold"><Svg d={icon} className="h-5 w-5" /></span>
                  <span className="text-sm font-semibold leading-snug">{t(title)}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* this month's fast sellers first: what vendors look at every day */}
        <TrendShowcase market={market} carousel={bento} />

        {/* staff: customers found on TikTok */}
        <LeadsHome />

        {/* only what has no tab at the bottom */}
        {!bento && <section aria-labelledby="tools-h" className="space-y-2">
          <h2 id="tools-h" className="px-1 text-sm font-semibold text-muted">{t('home.more')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {([['/datecode', 'home.datecode', ICON.shield], ['/verify', 'nav.verify', ICON.trend]] as const).map(([to, title, icon], i) => (
              <Link key={to} to={to} style={{ animationDelay: `${i * 90}ms` }} className="hz-rise-in flex flex-col gap-3 rounded-2xl border border-gold/20 bg-surface-card p-4 transition hover:border-gold/60">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold shadow-[0_0_18px_-4px_rgba(242,202,80,0.55)]"><Svg d={icon} className="h-5 w-5" /></span>
                <span className="flex items-center justify-between text-sm font-semibold">{t(title)}<span aria-hidden className="text-gold">→</span></span>
              </Link>
            ))}
          </div>
        </section>}
      </div>
    </>
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
