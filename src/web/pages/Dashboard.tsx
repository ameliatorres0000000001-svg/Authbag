import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, OutcomeBadge, errText } from '../ui.tsx';
import DateCodeDecoder from '../DateCodeDecoder.tsx';
import { ADMIN_ROLES, BASES, LICENCES, STAFF_ROLES, assetImg, uploadReference } from '../studio.ts';

export interface StudioModel {
  id: string; name: string; brand: string; brand_id: string;
  set: { id: string; slot: number; status: string; teaching_title: string | null; has_note: number; points: number }[];
  study: { genuine: number; counterfeit: number };
}
export interface Studio { setSize: number; models: StudioModel[]; recentStudy: any[]; aiConfigured: boolean }

export default function Dashboard() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const [d, setD] = useState<any>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const loadStudio = useCallback(() => api.get<Studio>('/api/studio').then(setStudio), []);
  useEffect(() => {
    api.get('/api/dashboard').then(setD);
    api.get('/api/inspections').then((r) => setRecent(r.slice(0, 5)));
    loadStudio();
  }, [loadStudio]);

  const size = studio?.setSize ?? 5;
  const complete = studio?.models.filter((m) => m.set.length >= size).length;
  const setPhotos = studio?.models.reduce((n, m) => n + m.set.length, 0);
  const genuine = studio?.models.reduce((n, m) => n + m.study.genuine, 0);
  const counterfeit = studio?.models.reduce((n, m) => n + m.study.counterfeit, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
      {/* hero */}
      <section className="overflow-hidden rounded-xl bg-charcoal text-white">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-6 md:px-8">
          <div className="max-w-2xl">
            <div className="font-mono text-[10px] uppercase tracking-widest text-gold">HENGZ AUTHENTIC</div>
            <h1 className="mt-1 text-3xl leading-tight md:text-4xl">{t('home.title')}</h1>
            <p className="mt-2 text-sm text-white/70">{t('home.subtitle')}</p>
          </div>
          {STAFF_ROLES.includes(me.role) && (
            <Link to="/inspections/new" className="btn border border-gold bg-gold text-charcoal hover:bg-gold-light">{t('newInspection')}</Link>
          )}
        </div>
        <dl className="grid grid-cols-2 border-t border-white/10 md:grid-cols-4">
          <Stat k={t('home.statSets')} v={studio ? `${complete} / ${studio.models.length}` : '—'} />
          <Stat k={t('home.statSetPhotos')} v={setPhotos ?? '—'} />
          <Stat k={t('home.statStudy')} v={studio ? `${genuine} / ${counterfeit}` : '—'} />
          <Stat k={t('home.statInspections')} v={d?.total ?? '—'} extra={studio && <span className={`font-mono text-[10px] ${studio.aiConfigured ? 'text-gold' : 'text-white/50'}`}>● {studio.aiConfigured ? t('home.aiOn') : t('home.aiOffShort')}</span>} />
        </dl>
      </section>

      {/* date code + research */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2"><DateCodeDecoder /></div>
        <ResearchSources />
      </section>

      {/* model teaching sets */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl">{t('studio.title')}</h2>
            <p className="max-w-3xl text-sm text-muted">{t('studio.help')}</p>
          </div>
        </div>
        {!ADMIN_ROLES.includes(me.role) && <div className="mb-3"><Notice>{t('studio.adminOnly')}</Notice></div>}
        {studio && studio.models.length === 0 && <div className="card text-sm text-muted">{t('studio.noModels')}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studio?.models.map((m) => <ModelSetCard key={m.id} m={m} size={size} />)}
        </div>
      </section>

      {/* study photos */}
      <section>
        <h2 className="text-2xl">{t('study.title')}</h2>
        <p className="mb-3 max-w-3xl text-sm text-muted">{t('study.help')}</p>
        <div className="grid gap-4 md:grid-cols-5">
          <div className="md:col-span-2">
            {STAFF_ROLES.includes(me.role) ? <StudyUpload studio={studio} onDone={loadStudio} /> : <Notice>{t('studio.adminOnly')}</Notice>}
          </div>
          <div className="card md:col-span-3">
            <div className="label mb-2">{t('study.recent')}</div>
            {!studio || studio.recentStudy.length === 0 ? <p className="text-sm text-muted">{t('noData')}</p> : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {studio.recentStudy.map((a) => (
                  <figure key={a.id} className="overflow-hidden rounded-lg border border-hairline">
                    <img src={assetImg(a.id)} alt="" loading="lazy" className="aspect-square w-full bg-surface-high object-cover" />
                    <figcaption className="space-y-1 p-1.5">
                      <Badge tone={a.label === 'authentic' ? 'ok' : 'bad'}>{a.label === 'authentic' ? t('study.knownGenuine') : t('study.knownCounterfeit')}</Badge>
                      <div className="truncate text-[11px] text-muted">{a.model ?? t('study.anyModel')}</div>
                      {a.status === 'quarantine' && <div className="text-[10px] text-review">{t('study.quarantine')}</div>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* recent inspections */}
      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-2xl">{t('home.recent')}</h2>
          <Link to="/inspections" className="text-sm underline">{t('home.viewAll')}</Link>
        </div>
        <div className="card divide-y divide-hairline p-0">
          {recent.length === 0 && <div className="p-6 text-sm text-muted">{t('noData')}</div>}
          {recent.map((i) => (
            <Link key={i.id} to={`/inspections/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-low">
              <div><div className="font-mono text-xs text-muted">{i.ref_code}</div><div className="font-semibold">{i.brand} · {i.model}</div></div>
              <OutcomeBadge outcome={i.outcome} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v, extra }: { k: string; v: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="border-white/10 px-5 py-4 [&:not(:last-child)]:border-r md:px-8">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-white/60">{k}</dt>
      <dd className="font-serif text-3xl">{v}</dd>
      {extra}
    </div>
  );
}

function ModelSetCard({ m, size }: { m: StudioModel; size: number }) {
  const { t } = useI18n();
  const bySlot = new Map(m.set.map((a) => [a.slot, a]));
  const pct = Math.min(100, Math.round((m.set.length / size) * 100));
  return (
    <Link to={`/studio/${m.id}`} className="card group block transition hover:border-gold">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">{m.brand}</div>
          <div className="truncate font-serif text-lg">{m.name}</div>
        </div>
        <span className="font-mono text-xs text-muted">{m.set.length}/{size}</span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: size }, (_, i) => i + 1).map((slot) => {
          const a = bySlot.get(slot);
          return a ? (
            <div key={slot} className="relative aspect-square overflow-hidden rounded border border-hairline bg-surface-high">
              <img src={assetImg(a.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
              {a.points > 0 && <span className="absolute bottom-0.5 right-0.5 rounded bg-charcoal/80 px-1 font-mono text-[9px] text-white">{a.points}</span>}
            </div>
          ) : (
            <div key={slot} className="flex aspect-square items-center justify-center rounded border border-dashed border-strong font-mono text-[10px] text-muted">{slot}</div>
          );
        })}
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded bg-surface-high"><div className="h-full bg-gold" style={{ width: `${pct}%` }} /></div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{t('study.genuineShort')} {m.study.genuine} · {t('study.counterfeitShort')} {m.study.counterfeit}</span>
        <span className="font-semibold text-charcoal group-hover:text-gold">{t('studio.open')} →</span>
      </div>
    </Link>
  );
}

function StudyUpload({ studio, onDone }: { studio: Studio | null; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ modelId: '', label: 'authentic', labelBasis: 'purchase_receipt', license: 'own', sourceUrl: '', teachingNote: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  const model = studio?.models.find((m) => m.id === f.modelId);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!model || files.length === 0) return;
    setBusy(true);
    try {
      let approved = 0;
      for (const file of files) {
        const r = await uploadReference(file, { ...f, brandId: model.brand_id, modelId: model.id, purpose: 'study' });
        if (r.status === 'approved') approved++;
      }
      setMsg({ tone: 'ok', text: `${t('study.uploaded')} ${files.length} · ${t('study.approved')} ${approved} · ${t('study.quarantine')} ${files.length - approved}` });
      setFiles([]); onDone();
    } catch (err) { setMsg({ tone: 'bad', text: errText(err) }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <Field label={t('model')}>
        <select className="input" value={f.modelId} onChange={(e) => set('modelId', e.target.value)} required>
          <option value="">—</option>
          {studio?.models.map((m) => <option key={m.id} value={m.id}>{m.brand} · {m.name}</option>)}
        </select>
      </Field>
      <Field label={t('study.labelAs')}>
        <div className="grid grid-cols-2 gap-2">
          {(['authentic', 'counterfeit'] as const).map((l) => (
            <button type="button" key={l} onClick={() => set('label', l)}
              className={`rounded border px-3 py-2 text-left text-xs font-semibold ${f.label === l ? (l === 'authentic' ? 'border-verified bg-verified-bg text-verified' : 'border-counterfeit bg-counterfeit-bg text-counterfeit') : 'border-strong bg-white'}`}>
              {l === 'authentic' ? t('study.knownGenuine') : t('study.knownCounterfeit')}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('studio.basis')}><select className="input" value={f.labelBasis} onChange={(e) => set('labelBasis', e.target.value)}>{BASES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('studio.licence')}><select className="input" value={f.license} onChange={(e) => set('license', e.target.value)}>{LICENCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label={t('study.whatDiffers')}><textarea className="input" rows={2} maxLength={4000} value={f.teachingNote} onChange={(e) => set('teachingNote', e.target.value)} /></Field>
      <Field label={t('studio.source')}><input className="input" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} /></Field>
      <Field label={t('study.files')}><input className="input" type="file" accept="image/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn-primary w-full" disabled={busy || !model || files.length === 0}>{busy ? t('studio.uploading') : `${t('studio.upload')}${files.length ? ` (${files.length})` : ''}`}</button>
    </form>
  );
}

const SOURCES: { group: 'official' | 'resale'; name: string; url: string; what: string }[] = [
  { group: 'official', name: 'Louis Vuitton', url: 'https://www.louisvuitton.com', what: 'research.lvSite' },
  { group: 'official', name: 'Entrupy', url: 'https://www.entrupy.com', what: 'research.entrupy' },
  { group: 'resale', name: 'Fashionphile', url: 'https://www.fashionphile.com/blogs/academy/louis-vuitton-date-codes', what: 'research.fashionphile' },
  { group: 'resale', name: 'Rebag', url: 'https://www.rebag.com/thevault/', what: 'research.rebag' },
  { group: 'resale', name: 'The RealReal', url: 'https://www.therealreal.com', what: 'research.trr' },
  { group: 'resale', name: 'Vestiaire Collective', url: 'https://us.vestiairecollective.com/journal/how-to-authenticate-a-bag/', what: 'research.vestiaire' },
];

function ResearchSources() {
  const { t } = useI18n();
  return (
    <div className="card h-full">
      <h2 className="text-2xl">{t('research.title')}</h2>
      <p className="mb-3 text-xs text-muted">{t('research.help')}</p>
      {(['official', 'resale'] as const).map((g) => (
        <div key={g} className="mb-3">
          <div className="label">{t(`research.${g}`)}</div>
          <ul className="space-y-1.5">
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
  );
}
