import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, OutcomeBadge } from '../ui.tsx';
import DateCodeDecoder from '../DateCodeDecoder.tsx';
import LessonCard, { type LessonSummary } from '../LessonCard.tsx';
import { STAFF_ROLES, assetImg } from '../studio.ts';

export interface StudioModel {
  id: string; name: string; brand: string; brand_id: string;
  set: { id: string; slot: number; status: string; teaching_title: string | null; has_note: number; points: number }[];
  study: { genuine: number; counterfeit: number };
}
export interface Studio { setSize: number; models: StudioModel[]; recentStudy: any[]; aiConfigured: boolean }

/** Mobile-first home: lessons first, then tools, model sets, study photos and recent inspections. */
export default function Dashboard() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [d, setD] = useState<any>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [brand, setBrand] = useState('');
  const [showDate, setShowDate] = useState(false);
  useEffect(() => {
    api.get('/api/dashboard').then(setD).catch(() => {});
    api.get('/api/inspections').then((r) => setRecent(r.slice(0, 5))).catch(() => {});
    api.get<Studio>('/api/studio').then(setStudio).catch(() => {});
    api.get<LessonSummary[]>('/api/lessons').then(setLessons).catch(() => setLessons([]));
  }, []);

  const brands = useMemo(() => {
    const m = new Map<string, string>();
    lessons?.forEach((l) => m.set(l.brand_id, l.brand));
    studio?.models.forEach((x) => m.set(x.brand_id, x.brand));
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [lessons, studio]);
  const shownLessons = lessons?.filter((l) => !brand || l.brand_id === brand) ?? [];
  const shownSets = studio?.models.filter((m) => !brand || m.brand_id === brand) ?? [];
  const size = studio?.setSize ?? 5;
  const genuine = studio?.models.reduce((n, m) => n + m.study.genuine, 0);
  const counterfeit = studio?.models.reduce((n, m) => n + m.study.counterfeit, 0);
  const lessonPhotos = lessons?.reduce((n, l) => n + l.photos, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 pb-8 pt-5 md:px-8">
      {/* greeting */}
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('home.hello')}, {me.name}</div>
        <h1 className="mt-0.5 text-[28px] leading-tight md:text-4xl">{t('home.tagline')}</h1>
      </header>

      {/* brand chips */}
      {brands.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {[{ id: '', name: t('home.all') }, ...brands].map((b) => (
            <button key={b.id || 'all'} type="button" onClick={() => setBrand(b.id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${brand === b.id ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{b.name}</button>
          ))}
        </div>
      )}

      {/* lessons */}
      <section>
        <SectionHead title={t('lesson.continue')} to="/learn" more={t('home.viewAll')} />
        {lessons && shownLessons.length === 0 ? <p className="text-sm text-muted">{t('lesson.none')}</p> : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {shownLessons.map((l) => <LessonCard key={l.id} l={l} />)}
          </div>
        )}
      </section>

      {/* tools */}
      <section>
        <SectionHead title={t('home.tools')} />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Tool icon="◎" label={t('home.toolDate')} onClick={() => setShowDate((v) => !v)} active={showDate} />
          {STAFF_ROLES.includes(me.role) && <Tool icon="＋" label={t('newInspection')} to="/inspections/new" />}
          <Tool icon="▦" label={t('inspections')} to="/inspections" />
          <Tool icon="◇" label={t('knowledge')} to="/knowledge" />
        </div>
        {showDate && <div className="mt-3"><DateCodeDecoder /></div>}
      </section>

      {/* stats */}
      <section className="grid grid-cols-2 overflow-hidden rounded-2xl bg-charcoal text-white md:grid-cols-4">
        <Stat k={t('lesson.photos')} v={lessonPhotos ?? '—'} />
        <Stat k={t('home.statStudy')} v={studio ? `${genuine} / ${counterfeit}` : '—'} />
        <Stat k={t('home.statInspections')} v={d?.total ?? '—'} />
        <Stat k="AI" v={studio ? (studio.aiConfigured ? '●' : '○') : '—'} sub={studio ? (studio.aiConfigured ? t('home.aiOn') : t('home.aiOffShort')) : ''} />
      </section>

      {/* model sets */}
      <section>
        <SectionHead title={t('home.toolSets')} />
        <p className="-mt-1 mb-2 text-xs text-muted">{t('studio.help')}</p>
        {studio && shownSets.length === 0 ? <p className="text-sm text-muted">{t('studio.noModels')}</p> : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {shownSets.map((m) => <ModelSetCard key={m.id} m={m} size={size} />)}
          </div>
        )}
      </section>

      {/* study photos */}
      <section>
        <SectionHead title={t('study.recent')} />
        {!studio || studio.recentStudy.length === 0 ? <p className="text-sm text-muted">{t('noData')}</p> : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {studio.recentStudy.filter((a) => !brand || studio.models.find((m) => m.id === a.model_id)?.brand_id === brand).map((a) => (
              <figure key={a.id} className="w-28 shrink-0 overflow-hidden rounded-xl border border-hairline bg-surface-card">
                <img src={assetImg(a.id)} alt="" loading="lazy" className="aspect-square w-full bg-surface-high object-cover" />
                <figcaption className="space-y-0.5 p-1.5">
                  <Badge tone={a.label === 'authentic' ? 'ok' : 'bad'}>{a.label === 'authentic' ? t('study.genuineShort') : t('study.counterfeitShort')}</Badge>
                  <div className="truncate text-[11px] text-muted">{a.model ?? t('study.anyModel')}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* recent inspections */}
      <section>
        <SectionHead title={t('home.recent')} to="/inspections" more={t('home.viewAll')} />
        <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          {recent.length === 0 && <div className="p-5 text-sm text-muted">{t('noData')}</div>}
          {recent.map((i) => (
            <Link key={i.id} to={`/inspections/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-surface-low">
              <div className="min-w-0"><div className="font-mono text-[10px] text-muted">{i.ref_code}</div><div className="truncate font-semibold">{i.brand} · {i.model}</div></div>
              <OutcomeBadge outcome={i.outcome} />
            </Link>
          ))}
        </div>
      </section>

      <ResearchSources />
    </div>
  );
}

function SectionHead({ title, to, more }: { title: string; to?: string; more?: string }) {
  return (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-xl md:text-2xl">{title}</h2>
      {to && <Link to={to} className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-charcoal">{more} →</Link>}
    </div>
  );
}

function Tool({ icon, label, to, onClick, active }: { icon: string; label: string; to?: string; onClick?: () => void; active?: boolean }) {
  const cls = `flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition ${active ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'}`;
  const inner = <><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-charcoal text-base text-gold">{icon}</span><span className="leading-tight">{label}</span></>;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function Stat({ k, v, sub }: { k: string; v: React.ReactNode; sub?: string }) {
  return (
    <div className="border-white/10 px-4 py-3 [&:nth-child(odd)]:border-r md:border-r">
      <dt className="truncate font-mono text-[9px] uppercase tracking-widest text-white/55">{k}</dt>
      <dd className="font-serif text-2xl">{v}</dd>
      {sub && <div className="font-mono text-[9px] text-white/50">{sub}</div>}
    </div>
  );
}

function ModelSetCard({ m, size }: { m: StudioModel; size: number }) {
  const { t } = useI18n();
  const bySlot = new Map(m.set.map((a) => [a.slot, a]));
  return (
    <Link to={`/studio/${m.id}`} className="block w-64 shrink-0 snap-start rounded-2xl border border-hairline bg-surface-card p-3 transition hover:border-gold md:w-auto">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{m.brand}</div>
          <div className="truncate font-serif text-lg">{m.name}</div>
        </div>
        <span className="font-mono text-xs text-muted">{m.set.length}/{size}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {Array.from({ length: size }, (_, i) => i + 1).map((slot) => {
          const a = bySlot.get(slot);
          return a
            ? <img key={slot} src={assetImg(a.id)} alt="" loading="lazy" className="aspect-square w-full rounded border border-hairline bg-surface-high object-cover" />
            : <div key={slot} className="flex aspect-square items-center justify-center rounded border border-dashed border-strong font-mono text-[10px] text-muted">{slot}</div>;
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{t('study.genuineShort')} {m.study.genuine} · {t('study.counterfeitShort')} {m.study.counterfeit}</span>
        <span className="font-semibold text-charcoal">{t('studio.open')} →</span>
      </div>
    </Link>
  );
}

const SOURCES: { group: 'official' | 'resale'; name: string; url: string; what: string }[] = [
  { group: 'official', name: 'Louis Vuitton', url: 'https://www.louisvuitton.com', what: 'research.lvSite' },
  { group: 'official', name: 'Chanel', url: 'https://www.chanel.com', what: 'research.lvSite' },
  { group: 'official', name: 'Entrupy', url: 'https://www.entrupy.com', what: 'research.entrupy' },
  { group: 'resale', name: 'Fashionphile', url: 'https://www.fashionphile.com/blogs/academy/louis-vuitton-date-codes', what: 'research.fashionphile' },
  { group: 'resale', name: 'Fashionphile · Chanel', url: 'https://www.fashionphile.com/blogs/academy/authenticating-your-new-chanel-bag-metal-plate-edition', what: 'research.chanelPlate' },
  { group: 'resale', name: 'Rebag', url: 'https://www.rebag.com/thevault/', what: 'research.rebag' },
  { group: 'resale', name: 'The RealReal', url: 'https://www.therealreal.com', what: 'research.trr' },
  { group: 'resale', name: 'Vestiaire Collective', url: 'https://us.vestiairecollective.com/journal/how-to-authenticate-a-bag/', what: 'research.vestiaire' },
];

function ResearchSources() {
  const { t } = useI18n();
  return (
    <details className="rounded-2xl border border-hairline bg-surface-card">
      <summary className="cursor-pointer select-none px-4 py-3 font-serif text-lg">{t('home.research')}</summary>
      <div className="px-4 pb-4">
        <p className="mb-3 text-xs text-muted">{t('research.help')}</p>
        {(['official', 'resale'] as const).map((g) => (
          <div key={g} className="mb-3">
            <div className="label">{t(`research.${g}`)}</div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {SOURCES.filter((s) => s.group === g).map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="block rounded px-2 py-1 hover:bg-surface-low">
                    <div className="text-sm font-semibold">{s.name} ↗</div>
                    <div className="text-xs text-muted">{t(s.what)}</div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="label">{t('research.uploaded')}</div>
        <p className="px-2 text-xs text-muted">{t('research.uploadedHelp')}</p>
      </div>
    </details>
  );
}
