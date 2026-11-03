import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Badge, Field, Notice, Page, errText } from '../ui.tsx';
import DateCodeAppearanceCard, { DateCodeGuide } from '../DateCodeAppearance.tsx';
import { guessFromFilename, type UploadGuess } from '../../shared/uploadGuess.ts';
import { ADMIN_ROLES, BASES, LICENCES, STAFF_ROLES, annotateAfterUpload, assetImg, uploadReference } from '../studio.ts';

interface Tax { brands: { id: string; name: string }[]; models: { id: string; brand_id: string; name: string }[] }
interface Comp { code: string; name_en: string; name_km: string }

/** Hidden panel (tap the logo 5 times): multi-brand library of genuine / counterfeit photos by part. */
export default function AdminPanel() {
  const { t, locale } = useI18n();
  const me = useContext(MeContext)!;
  const [tax, setTax] = useState<Tax | null>(null);
  const [comps, setComps] = useState<Comp[]>([]);
  const [lib, setLib] = useState<{ items: any[]; matrix: any[]; aiConfigured: boolean } | null>(null);
  const [filter, setFilter] = useState({ brandId: '', component: '', label: '' });
  const [open, setOpen] = useState<any | null>(null);

  const loadTax = useCallback(() => api.get<Tax>('/api/taxonomy').then(setTax), []);
  const loadLib = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    return api.get(`/api/admin/library${q ? `?${q}` : ''}`).then(setLib);
  }, [filter]);
  useEffect(() => { loadTax(); api.get<Comp[]>('/api/components').then(setComps); }, [loadTax]);
  useEffect(() => { if (STAFF_ROLES.includes(me.role)) loadLib(); }, [loadLib, me.role]);

  const compName = (code: string | null) => {
    if (!code || code === 'none') return t('admin.noPart');
    const c = comps.find((x) => x.code === code);
    return c ? (locale === 'km' ? c.name_km : c.name_en) : code;
  };

  if (!STAFF_ROLES.includes(me.role)) return <Page title={t('admin.title')}><Notice tone="bad">{t('admin.forbidden')}</Notice></Page>;

  return (
    <Page title={t('admin.title')} subtitle={t('admin.subtitle')} actions={<Link to="/" className="btn-ghost">{t('admin.close')}</Link>}>
      <p className="-mt-4 mb-4 font-mono text-[10px] uppercase tracking-widest text-muted">{t('admin.hint')}</p>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <UploadForm tax={tax} comps={comps} compName={compName} canAddTaxonomy={ADMIN_ROLES.includes(me.role)} onTax={loadTax} onDone={loadLib} />
          <DateCodeGuide />
        </div>
        <div className="space-y-4 lg:col-span-3">
          <Matrix lib={lib} tax={tax} compName={compName} onPick={(brandId, component) => setFilter({ brandId, component, label: '' })} />
          <div className="card">
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <h2 className="mr-auto text-xl">{t('admin.library')}</h2>
              <select className="input !w-auto !py-1 text-xs" value={filter.brandId} onChange={(e) => setFilter({ ...filter, brandId: e.target.value })} aria-label={t('brand')}>
                <option value="">{t('brand')}: {t('admin.all')}</option>
                {tax?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <select className="input !w-auto !py-1 text-xs" value={filter.component} onChange={(e) => setFilter({ ...filter, component: e.target.value })} aria-label={t('admin.part')}>
                <option value="">{t('admin.part')}: {t('admin.all')}</option>
                {comps.map((c) => <option key={c.code} value={c.code}>{compName(c.code)}</option>)}
                <option value="none">{t('admin.noPart')}</option>
              </select>
              <select className="input !w-auto !py-1 text-xs" value={filter.label} onChange={(e) => setFilter({ ...filter, label: e.target.value })} aria-label={t('study.labelAs')}>
                <option value="">{t('study.labelAs')}: {t('admin.all')}</option>
                <option value="authentic">{t('study.genuineShort')}</option>
                <option value="counterfeit">{t('study.counterfeitShort')}</option>
              </select>
            </div>
            {!lib || lib.items.length === 0 ? <p className="text-sm text-muted">{t('noData')}</p> : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {lib.items.map((a) => (
                  <button key={a.id} type="button" onClick={() => setOpen(a)} className={`overflow-hidden rounded-lg border text-left ${open?.id === a.id ? 'border-gold ring-2 ring-gold' : 'border-hairline'}`}>
                    <img src={assetImg(a.id)} alt="" loading="lazy" className="aspect-square w-full bg-surface-high object-cover" />
                    <div className="space-y-0.5 p-1.5">
                      <Badge tone={a.label === 'authentic' ? 'ok' : a.label === 'counterfeit' ? 'bad' : 'muted'}>{a.label === 'authentic' ? t('study.genuineShort') : a.label === 'counterfeit' ? t('study.counterfeitShort') : a.label}</Badge>
                      <div className="truncate text-[11px] font-semibold">{a.brand}{a.model ? ` · ${a.model}` : ''}</div>
                      <div className="truncate text-[10px] text-muted">{compName(a.component_code)}{a.status === 'quarantine' ? ` · ${t('study.quarantine')}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {open && (
            <div className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-serif text-lg">{open.brand}{open.model ? ` · ${open.model}` : ''}</div>
                  <div className="font-mono text-[11px] text-muted">{compName(open.component_code)} · {open.label_basis} · {open.license} · {open.status}</div>
                </div>
                <button className="btn-ghost !px-3 !py-1" onClick={() => setOpen(null)}>{t('admin.close')}</button>
              </div>
              <img src={assetImg(open.id)} alt="" className="max-h-[28rem] w-full rounded-lg bg-charcoal object-contain" />
              {open.teaching_note && <p className="whitespace-pre-wrap text-sm">{open.teaching_note}</p>}
              {open.source_url && <p className="break-all text-xs text-muted">{open.source_url}</p>}
              {open.component_code === 'date_code' && <DateCodeAppearanceCard base={`/api/assets/${open.id}`} canRun askTyped />}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function Matrix({ lib, tax, compName, onPick }: { lib: { matrix: any[] } | null; tax: Tax | null; compName: (c: string | null) => string; onPick: (brandId: string, component: string) => void }) {
  const { t } = useI18n();
  const brands = useMemo(() => (tax?.brands ?? []).filter((b) => lib?.matrix.some((m) => m.brand_id === b.id)), [tax, lib]);
  const parts = useMemo(() => [...new Set((lib?.matrix ?? []).map((m) => m.component as string))], [lib]);
  const n = (b: string, p: string, l: string) => lib?.matrix.find((m) => m.brand_id === b && m.component === p && m.label === l)?.n ?? 0;
  return (
    <div className="card">
      <h2 className="mb-2 text-xl">{t('admin.matrix')}</h2>
      {brands.length === 0 ? <p className="text-sm text-muted">{t('noData')}</p> : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-max text-sm">
            <thead><tr><th className="py-1 pr-3 text-left font-mono text-[10px] font-normal uppercase tracking-widest text-muted">{t('brand')}</th>{parts.map((p) => <th key={p} className="px-2 py-1 text-center font-mono text-[10px] font-normal uppercase tracking-wider text-muted">{compName(p)}</th>)}</tr></thead>
            <tbody className="divide-y divide-hairline">
              {brands.map((b) => (
                <tr key={b.id}>
                  <td className="py-1.5 pr-3 font-semibold">{b.name}</td>
                  {parts.map((p) => {
                    const g = n(b.id, p, 'authentic'), c = n(b.id, p, 'counterfeit');
                    return (
                      <td key={p} className="px-2 py-1.5 text-center">
                        {g + c === 0 ? <span className="text-muted">·</span> : (
                          <button type="button" className="rounded px-1.5 py-0.5 font-mono text-xs hover:bg-surface-high" onClick={() => onPick(b.id, p)}>
                            <span className="text-verified">{g}</span> / <span className="text-counterfeit">{c}</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UploadForm({ tax, comps, compName, canAddTaxonomy, onTax, onDone }: {
  tax: Tax | null; comps: Comp[]; compName: (c: string | null) => string; canAddTaxonomy: boolean; onTax: () => Promise<unknown>; onDone: () => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState({ brandId: '', modelId: '', componentCode: 'date_code', label: 'authentic', labelBasis: 'purchase_receipt', license: 'own', sourceUrl: '', teachingNote: '' });
  // one row per photo; `pick` holds what was read from the file name or changed in the list, the form fills the rest
  const [rows, setRows] = useState<{ file: File; pick: UploadGuess }[]>([]);
  const files = rows.map((r) => r.file);
  const [previews, setPreviews] = useState<string[]>([]);
  const [adding, setAdding] = useState<'brand' | 'model' | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v, ...(k === 'brandId' ? { modelId: '' } : {}) }));

  useEffect(() => {
    const urls = rows.map((x) => URL.createObjectURL(x.file));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [rows]);

  const eff = (r: { pick: UploadGuess }) => {
    const brandId = r.pick.brandId ?? f.brandId;
    const modelId = r.pick.modelId ?? (brandId === f.brandId ? f.modelId : '');
    return { brandId, modelId, componentCode: r.pick.componentCode ?? f.componentCode, label: r.pick.label ?? f.label };
  };
  const setPick = (i: number, k: keyof UploadGuess, v: string) => setRows((all) => all.map((r, j) => j !== i ? r
    : { ...r, pick: { ...r.pick, [k]: v, ...(k === 'brandId' ? { modelId: '' } : {}) } as UploadGuess }));
  const missingBrand = rows.some((r) => !eff(r).brandId);
  function choose(list: File[]) {
    const imgs = list.filter((x) => x.type.startsWith('image/'));
    const codes = comps.map((c) => c.code);
    setRows(imgs.map((file) => ({ file, pick: guessFromFilename(file.name, tax?.brands ?? [], tax?.models ?? [], codes) })));
    setMsg(imgs.length < list.length ? { tone: 'warn', text: t('study.onlyImages') } : null);
  }

  async function addTaxonomy() {
    if (!newName.trim()) return;
    setMsg(null);
    // an existing brand/model with the same name is simply selected instead of duplicated
    const same = (x: { name: string }) => x.name.trim().toLowerCase() === newName.trim().toLowerCase();
    const existing = adding === 'brand' ? tax?.brands.find(same) : tax?.models.find((m) => m.brand_id === f.brandId && same(m));
    if (existing) { set(adding === 'brand' ? 'brandId' : 'modelId', existing.id); setAdding(null); setNewName(''); return; }
    try {
      const r = adding === 'brand'
        ? await api.post('/api/brands', { name: newName.trim() })
        : await api.post('/api/models', { brandId: f.brandId, name: newName.trim() });
      await onTax();
      set(adding === 'brand' ? 'brandId' : 'modelId', r.id);
      setAdding(null); setNewName('');
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (rows.length === 0 || missingBrand) return;
    setBusy(true);
    try {
      let approved = 0;
      for (const row of rows) {
        const e = eff(row);
        const r = await uploadReference(row.file, { ...f, ...e, purpose: 'study' });
        await annotateAfterUpload(r.id, e.componentCode);
        if (r.status === 'approved') approved++;
      }
      setMsg({ tone: 'ok', text: `${t('study.uploaded')} ${files.length} · ${t('study.approved')} ${approved} · ${t('study.quarantine')} ${files.length - approved}` });
      setRows([]); onDone();
    } catch (err) { setMsg({ tone: 'bad', text: errText(err) }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="text-xl">{t('admin.upload')}</h2>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('brand')}>
          <select className="input" value={f.brandId} onChange={(e) => set('brandId', e.target.value)}>
            <option value="">—</option>
            {tax?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label={`${t('model')} (${t('optional')})`}>
          <select className="input" value={f.modelId} onChange={(e) => set('modelId', e.target.value)} disabled={!f.brandId}>
            <option value="">—</option>
            {tax?.models.filter((m) => m.brand_id === f.brandId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
      {canAddTaxonomy && (
        adding ? (
          <div className="flex gap-2">
            <input className="input" autoFocus maxLength={80} placeholder={t('admin.newName')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button type="button" className="btn-primary shrink-0" onClick={addTaxonomy}>{t('create')}</button>
            <button type="button" className="btn-ghost shrink-0" onClick={() => { setAdding(null); setNewName(''); }}>{t('cancel')}</button>
          </div>
        ) : (
          <div className="flex gap-3 text-xs">
            <button type="button" className="underline" onClick={() => setAdding('brand')}>{t('admin.addBrand')}</button>
            {f.brandId && <button type="button" className="underline" onClick={() => setAdding('model')}>{t('admin.addModel')}</button>}
          </div>
        )
      )}
      <Field label={t('admin.part')}>
        <div className="flex flex-wrap gap-1.5">
          {comps.map((c) => (
            <button type="button" key={c.code} onClick={() => set('componentCode', c.code)}
              className={`rounded-full border px-3 py-1 text-xs ${f.componentCode === c.code ? 'border-charcoal bg-charcoal text-white' : 'border-strong bg-white'}`}>{compName(c.code)}</button>
          ))}
        </div>
      </Field>
      <Field label={t('study.labelAs')}>
        <div className="grid grid-cols-3 gap-2">
          {(['authentic', 'counterfeit', 'unknown'] as const).map((l) => (
            <button type="button" key={l} onClick={() => set('label', l)}
              className={`rounded border px-2 py-2 text-left text-xs font-semibold ${f.label === l ? (l === 'authentic' ? 'border-verified bg-verified-bg text-verified' : l === 'counterfeit' ? 'border-counterfeit bg-counterfeit-bg text-counterfeit' : 'border-charcoal bg-surface-high text-charcoal') : 'border-strong bg-white'}`}>
              {l === 'authentic' ? t('study.knownGenuine') : l === 'counterfeit' ? t('study.knownCounterfeit') : t('study.unlabelled')}
            </button>
          ))}
        </div>
        {f.label === 'unknown' && <p className="text-xs text-muted">{t('study.unlabelledHelp')}</p>}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('studio.basis')}><select className="input" value={f.labelBasis} onChange={(e) => set('labelBasis', e.target.value)}>{BASES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('studio.licence')}><select className="input" value={f.license} onChange={(e) => set('license', e.target.value)}>{LICENCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <Field label={t('study.whatDiffers')}><textarea className="input" rows={2} maxLength={4000} value={f.teachingNote} onChange={(e) => set('teachingNote', e.target.value)} /></Field>
      <Field label={t('studio.source')}><input className="input" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} /></Field>
      <Field label={t('study.files')}><input className="input" type="file" accept="image/*" multiple onChange={(e) => choose([...(e.target.files ?? [])])} /></Field>
      {rows.length > 0 && (
        <div>
          <div className="label">{t('admin.preview')} ({rows.length}) · {t('admin.autoList')}</div>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline">
            {rows.map((r, i) => {
              const e = eff(r);
              return (
                <li key={i} className="flex gap-2 p-2">
                  <img src={previews[i]} alt="" className="h-16 w-16 shrink-0 rounded object-cover" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate font-mono text-[10px] text-muted">{r.file.name}</div>
                    <div className="grid grid-cols-2 gap-1">
                      <select className={`input !py-1 text-xs ${!e.brandId ? '!border-counterfeit' : ''}`} value={e.brandId} onChange={(x) => setPick(i, 'brandId', x.target.value)}>
                        <option value="">{t('brand')} —</option>
                        {tax?.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <select className="input !py-1 text-xs" value={e.modelId} onChange={(x) => setPick(i, 'modelId', x.target.value)} disabled={!e.brandId}>
                        <option value="">{t('model')} —</option>
                        {tax?.models.filter((m) => m.brand_id === e.brandId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <select className="input !py-1 text-xs" value={e.componentCode} onChange={(x) => setPick(i, 'componentCode', x.target.value)}>
                        {comps.map((c) => <option key={c.code} value={c.code}>{compName(c.code)}</option>)}
                      </select>
                      <select className={`input !py-1 text-xs ${e.label === 'authentic' ? 'text-verified' : e.label === 'counterfeit' ? 'text-counterfeit' : ''}`} value={e.label} onChange={(x) => setPick(i, 'label', x.target.value)}>
                        <option value="authentic">{t('study.knownGenuine')}</option>
                        <option value="counterfeit">{t('study.knownCounterfeit')}</option>
                        <option value="unknown">{t('study.unlabelled')}</option>
                      </select>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {missingBrand && <p className="mt-1 text-xs text-counterfeit">{t('admin.needBrand')}</p>}
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn-primary w-full" disabled={busy || missingBrand || rows.length === 0}>{busy ? t('studio.uploading') : `${t('studio.upload')}${files.length ? ` (${files.length})` : ''}`}</button>
    </form>
  );
}
