import React, { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Field, Notice, errText } from './ui.tsx';
import ColorScanner from './ColorScanner.tsx';
import { RecipeCard, productPhoto, type PaintProduct, type PaintRecipe } from './pages/Paint.tsx';
import type { Issue, Measurement } from '../shared/color.ts';
import { STEP_ICONS, UI_VOICE_KEYS, type StepIcon } from '../shared/voiceKeys.ts';
import { StepArt } from './StepArt.tsx';
import VoiceRecorder from './VoiceRecorder.tsx';
import { mixSentence } from './StepPlayer.tsx';
import { playUrl } from './voice.ts';

const KINDS = ['leather_paint', 'edge_paint', 'dye', 'finisher', 'preparer', 'cleaner', 'other'] as const;
const SURFACES = ['smooth_leather', 'grained_leather', 'vachetta', 'coated_canvas', 'suede', 'edge', 'other'] as const;
const FINISHES = ['matte', 'satin', 'gloss'] as const;

/** Admin: the paints we use (AI can research each online), colour recipes measured from photos, and colour requests. */
export default function PaintAdmin() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'recipes' | 'products' | 'requests'>('recipes');
  const [products, setProducts] = useState<PaintProduct[]>([]);
  const loadProducts = useCallback(() => api.get<{ products: PaintProduct[] }>('/api/paint/products?all=1').then((r) => setProducts(r.products)).catch(() => setProducts([])), []);
  useEffect(() => { loadProducts(); }, [loadProducts]);
  return (
    <div className="card space-y-3">
      <h2 className="text-xl">{t('padm.title')}</h2>
      <div className="flex gap-1 rounded-full bg-surface-low p-1 text-sm">
        {(['recipes', 'products', 'requests'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-full px-3 py-1 ${tab === k ? 'bg-gold text-charcoal' : ''}`}>{t(`padm.${k}`)}</button>
        ))}
      </div>
      {tab === 'products' && <Products products={products} reload={loadProducts} />}
      {tab === 'recipes' && <Recipes products={products} />}
      {tab === 'requests' && <Requests />}
      <VoiceTools />
    </div>
  );
}

/** Azure voice status, and generating the spoken app phrases (scanner guidance) in the current language. */
function VoiceTools() {
  const { t, locale } = useI18n();
  const [st, setSt] = useState<{ tts: boolean } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<{ tts: boolean }>('/api/admin/voice/status').then(setSt).catch(() => setSt(null)); }, []);
  const gen = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ made: number; kept: number; failed: number }>('/api/admin/voice/ui', { lang: locale, items: UI_VOICE_KEYS.map((key) => ({ key, text: t(key) })) });
      setMsg({ tone: r.failed ? 'bad' : 'ok', text: `${t('padm.voiceMade')}: ${r.made} · ${r.kept} · ✕ ${r.failed}` });
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 border-t border-hairline pt-3 text-sm">
      {st && !st.tts && <Notice tone="warn">{t('padm.ttsOff')}</Notice>}
      <button type="button" className="btn-ghost text-sm" disabled={busy || !st?.tts} onClick={gen}>🔊 {t('padm.uiVoice')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

type PForm = { brand: string; name: string; kind: string; color_hex: string; info: string; sources: { title: string; url: string }[]; active: boolean; code: string; volume_ml: string; base: string };
const emptyP: PForm = { brand: '', name: '', kind: 'leather_paint', color_hex: '', info: '', sources: [], active: true, code: '', volume_ml: '', base: '' };
const BASES = ['acrylic', 'leather_acrylic', 'water_dye', 'solvent_dye', 'oil', 'wax', 'other'];
const toFd = (f: PForm, photo: File | null) => {
  const fd = new FormData();
  fd.append('brand', f.brand); fd.append('name', f.name); fd.append('kind', f.kind); fd.append('color_hex', f.color_hex);
  fd.append('info', f.info); fd.append('sources', JSON.stringify(f.sources)); fd.append('active', f.active ? '1' : '0');
  fd.append('code', f.code); fd.append('volume_ml', f.volume_ml); fd.append('base', f.base);
  if (photo) fd.append('file', photo);
  return fd;
};

function Products({ products, reload }: { products: PaintProduct[]; reload: () => void }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [f, setF] = useState<PForm>(emptyP);
  const [photo, setPhoto] = useState<File | null>(null);
  const [draft, setDraft] = useState<{ info: string; sources: { title: string; url: string }[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const open = (p: PaintProduct | null) => {
    setMsg(null); setDraft(null); setPhoto(null);
    if (!p) { setEdit('new'); setF(emptyP); return; }
    setEdit(p.id); setF({ brand: p.brand, name: p.name, kind: p.kind, color_hex: p.color_hex ?? '', info: p.info ?? '', sources: p.sources, active: !!p.active, code: p.code ?? '', volume_ml: p.volume_ml ? String(p.volume_ml) : '', base: p.base ?? '' });
  };
  const save = async () => {
    setBusy('save'); setMsg(null);
    try {
      if (edit === 'new') { const r = await api.post<{ id: string }>('/api/admin/paint/products', toFd(f, photo)); setEdit(r.id); }
      else await api.put(`/api/admin/paint/products/${edit}`, toFd(f, photo));
      setPhoto(null); reload(); setMsg({ tone: 'ok', text: t('madm.saved') });
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  /** Photo of the tube → the AI reads brand / code / name / volume / base; the photo becomes the product photo. */
  const scanTube = async (file: File) => {
    setBusy('scan'); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await api.post<{ brand: string | null; code: string | null; name: string | null; volume_ml: number | null; base: string | null; kind: string | null; hex: string | null; colour: string; uses: string[]; leather_tip: string }>('/api/paint/tube', fd);
      setF((x) => ({ ...x, brand: r.brand ?? x.brand, code: r.code ?? x.code, name: r.name ?? x.name, volume_ml: r.volume_ml ? String(r.volume_ml) : x.volume_ml,
        base: r.base ?? x.base, kind: r.kind ?? x.kind, color_hex: r.hex ?? x.color_hex,
        info: x.info || [r.colour, ...r.uses, r.leather_tip].filter(Boolean).join('\n') }));
      setPhoto(file); setMsg({ tone: 'ok', text: t('padm.scanned') });
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  const research = async () => {
    setBusy('ai'); setMsg(null); setDraft(null);
    try { const r = await api.post<{ draft: { info: string; sources: { title: string; url: string }[] } }>(`/api/admin/paint/products/${edit}/research`); setDraft(r.draft); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'ai_web_not_configured' ? t('padm.aiWebOff') : errText(e) }); }
    finally { setBusy(''); }
  };
  const del = async (id: string) => {
    if (!confirm(`${t('madm.delete')}?`)) return;
    try { await api.del(`/api/admin/paint/products/${id}`); setEdit(null); reload(); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'in_use' ? t('padm.inUse') : errText(e) }); }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary !px-3 !py-1 text-sm" onClick={() => open(null)}>{t('padm.addProduct')}</button>
      <ul className="divide-y divide-hairline">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
            {p.has_photo ? <img src={productPhoto(p)} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded border border-hairline" style={{ background: p.color_hex ?? 'transparent' }} />}
            <span className={`min-w-0 flex-1 truncate ${p.active ? '' : 'text-muted line-through'}`}><b>{p.brand}</b> {p.code && <span className="font-mono text-xs text-gold">{p.code}</span>} {p.name} <span className="text-xs text-muted">· {t(`paint.kind.${p.kind}`)}</span></span>
            <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => (edit === p.id ? setEdit(null) : open(p))}>{edit === p.id ? t('cadm.close') : t('cadm.edit')}</button>
          </li>
        ))}
      </ul>
      {edit && (
        <div className="space-y-2 rounded-lg border border-hairline p-3">
          <label className={`btn-ghost w-full cursor-pointer text-sm ${busy === 'scan' ? 'pointer-events-none opacity-60' : ''}`}>
            {busy === 'scan' ? '…' : t('padm.scanTube')}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) scanTube(x); }} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('padm.brand')}><input className="input" maxLength={80} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Field>
            <Field label={t('padm.name')}><input className="input" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label={t('padm.code')}><input className="input font-mono" maxLength={40} placeholder="#107 / 100-1" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('padm.volume')}><input className="input" type="number" min={1} max={20000} value={f.volume_ml} onChange={(e) => setF({ ...f, volume_ml: e.target.value })} /></Field>
              <Field label={t('padm.base')}><select className="input" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })}><option value="">—</option>{BASES.map((b) => <option key={b} value={b}>{t(`tube.base.${b}`)}</option>)}</select></Field>
            </div>
            <Field label={t('padm.kind')}><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{t(`paint.kind.${k}`)}</option>)}</select></Field>
            <Field label={t('padm.color')}>
              <div className="flex items-center gap-2">
                <input type="color" className="h-9 w-12 rounded border border-hairline" value={f.color_hex || '#888888'} onChange={(e) => setF({ ...f, color_hex: e.target.value })} />
                {f.color_hex && <button type="button" className="text-xs text-muted" onClick={() => setF({ ...f, color_hex: '' })}>✕</button>}
              </div>
            </Field>
          </div>
          <Field label={t('padm.photo')}><input type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></Field>
          <Field label={t('padm.info')}><textarea className="input min-h-[120px]" maxLength={3000} value={f.info} onChange={(e) => setF({ ...f, info: e.target.value })} /></Field>
          {f.sources.length > 0 && (
            <ul className="space-y-0.5 text-xs">{f.sources.map((s, i) => (
              <li key={s.url} className="flex gap-2"><a href={s.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-gold underline">{s.title || s.url}</a>
                <button type="button" className="text-muted" onClick={() => setF({ ...f, sources: f.sources.filter((_, j) => j !== i) })}>✕</button></li>
            ))}</ul>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t('cadm.published')}</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!!busy || !f.brand.trim() || !f.name.trim()} onClick={save}>{t('save')}</button>
            {edit !== 'new' && <button type="button" className="btn-ghost" disabled={!!busy} onClick={research}>{busy === 'ai' ? t('padm.researching') : t('padm.research')}</button>}
            {edit !== 'new' && <button type="button" className="btn-ghost text-counterfeit" disabled={!!busy} onClick={() => del(edit)}>{t('madm.delete')}</button>}
          </div>
          {draft && (
            <div className="space-y-2 rounded-lg border border-review bg-review-bg p-3 text-sm">
              <p className="font-semibold">{t('padm.draft')}</p>
              <p className="whitespace-pre-line">{draft.info}</p>
              <ul className="space-y-0.5 text-xs">{draft.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{s.title || s.url}</a></li>)}</ul>
              <button type="button" className="btn-ghost text-sm" onClick={() => { setF({ ...f, info: draft.info, sources: draft.sources }); setDraft(null); }}>{t('padm.useDraft')}</button>
            </div>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        </div>
      )}
    </div>
  );
}

function Recipes({ products }: { products: PaintProduct[] }) {
  const { t } = useI18n();
  const [list, setList] = useState<PaintRecipe[]>([]);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState<{ m: Measurement | null; issues: Issue[]; file: File | null }>({ m: null, issues: [], file: null });
  const [nf, setNf] = useState({ name_km: '', name_en: '', surface: 'smooth_leather', finish: 'satin' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = useCallback(() => api.get<{ recipes: PaintRecipe[] }>('/api/paint/recipes?all=1').then((r) => setList(r.recipes)).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setMsg(null);
    const fd = new FormData();
    Object.entries(nf).forEach(([k, v]) => fd.append(k, v));
    fd.append('measurement', JSON.stringify(scan.m));
    if (scan.file) fd.append('file', scan.file);
    try { const r = await api.post<{ id: string }>('/api/admin/paint/recipes', fd); setCreating(false); setNf({ name_km: '', name_en: '', surface: 'smooth_leather', finish: 'satin' }); await load(); setOpen(r.id); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.issues ? e.body.issues.map((i: string) => t(`paint.issue.${i}`)).join(' · ') : errText(e) }); }
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-primary !px-3 !py-1 text-sm" onClick={() => { setCreating(!creating); setOpen(null); }}>{creating ? t('cadm.close') : t('padm.newRecipe')}</button>
      {creating && (
        <div className="space-y-2 rounded-lg border border-hairline p-3">
          <p className="text-xs text-muted">{t('padm.measureFirst')}</p>
          <ColorScanner onChange={(m, issues, file) => setScan({ m, issues, file })} />
          <Field label={t('padm.recipeName')}><input className="input" maxLength={120} value={nf.name_km} onChange={(e) => setNf({ ...nf, name_km: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t('padm.recipeNameEn')}><input className="input" maxLength={120} value={nf.name_en} onChange={(e) => setNf({ ...nf, name_en: e.target.value })} /></Field>
            <Field label={t('padm.surface')}><select className="input" value={nf.surface} onChange={(e) => setNf({ ...nf, surface: e.target.value })}>{SURFACES.map((s) => <option key={s} value={s}>{t(`paint.surface.${s}`)}</option>)}</select></Field>
            <Field label={t('padm.finish')}><select className="input" value={nf.finish} onChange={(e) => setNf({ ...nf, finish: e.target.value })}>{FINISHES.map((s) => <option key={s} value={s}>{t(`paint.finish.${s}`)}</option>)}</select></Field>
          </div>
          <button type="button" className="btn-primary" disabled={!scan.m || scan.issues.length > 0 || nf.name_km.trim().length < 2} onClick={create}>{t('create')}</button>
        </div>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <ul className="divide-y divide-hairline">
        {list.map((r) => (
          <li key={r.id} className="py-1.5">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-8 w-8 shrink-0 rounded border border-hairline" style={{ background: r.hex }} />
              <span className={`h-2 w-2 shrink-0 rounded-full ${r.status === 'published' ? 'bg-verified' : 'bg-review'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{r.name_km} <span className="text-xs text-muted">· {r.parts.length} {t('padm.products')}</span></span>
              <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? t('cadm.close') : t('cadm.edit')}</button>
            </div>
            {open === r.id && <RecipeEditor r={r} products={products} onChanged={load} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecipeEditor({ r, products, onChanged }: { r: PaintRecipe; products: PaintProduct[]; onChanged: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name_km: r.name_km, name_en: r.name_en ?? '', surface: r.surface, finish: r.finish, method: r.method ?? '' });
  const [parts, setParts] = useState(r.parts.map((p) => ({ product_id: p.id, parts: p.parts })));
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); onChanged(); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'bad', text: e instanceof ApiError && e.body?.error === 'no_parts' ? t('padm.noParts') : errText(e) }); }
    finally { setBusy(false); }
  };
  const mixText = () => {
    const ps = parts.filter((p) => p.product_id && p.parts > 0).map((p) => { const pr = products.find((x) => x.id === p.product_id)!; return { id: pr.id, brand: pr.brand, name: pr.name, color_hex: pr.color_hex, parts: p.parts, kind: pr.kind, has_photo: false, updated_at: '' }; });
    return ps.length ? mixSentence({ ...r, parts: ps }, t) : null;
  };
  const save = () => run(() => api.put(`/api/admin/paint/recipes/${r.id}`, { ...f, name_en: f.name_en || null, method: f.method || null, parts: parts.filter((p) => p.product_id && p.parts > 0), mix_text: mixText() }), t('madm.saved'));

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-hairline p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('padm.recipeName')}><input className="input" value={f.name_km} onChange={(e) => setF({ ...f, name_km: e.target.value })} /></Field>
        <Field label={t('padm.recipeNameEn')}><input className="input" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
        <Field label={t('padm.surface')}><select className="input" value={f.surface} onChange={(e) => setF({ ...f, surface: e.target.value })}>{SURFACES.map((s) => <option key={s} value={s}>{t(`paint.surface.${s}`)}</option>)}</select></Field>
        <Field label={t('padm.finish')}><select className="input" value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })}>{FINISHES.map((s) => <option key={s} value={s}>{t(`paint.finish.${s}`)}</option>)}</select></Field>
      </div>
      <div>
        <div className="label">{t('padm.parts')}</div>
        {parts.map((p, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <select className="input flex-1" value={p.product_id} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}>
              <option value="">—</option>
              {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.brand} {pr.name}</option>)}
            </select>
            <input className="input !w-20" type="number" min={0.1} max={100} step={0.5} value={p.parts} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, parts: Number(e.target.value) } : x)))} />
            <button type="button" className="btn-ghost !px-2 text-xs" onClick={() => setParts(parts.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setParts([...parts, { product_id: '', parts: 1 }])}>{t('padm.addPart')}</button>
      </div>
      <StepsEditor r={r} onChanged={onChanged} />
      {r.steps.length === 0 && <Field label={t('padm.method')}><textarea className="input min-h-[100px]" maxLength={3000} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} /></Field>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy || f.name_km.trim().length < 2} onClick={save}>{t('save')}</button>
        {r.status === 'published'
          ? <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => api.post(`/api/admin/paint/recipes/${r.id}/status`, { status: 'draft' }))}>{t('cadm.unpublish')}</button>
          : <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => api.post(`/api/admin/paint/recipes/${r.id}/status`, { status: 'published' }), t('cadm.published'))}>{t('cadm.publish')}</button>}
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(async () => {
          const v = await api.post<{ steps: number; failed: number; mix: boolean }>(`/api/admin/paint/recipes/${r.id}/voice`);
          setMsg({ tone: v.failed ? 'bad' : 'ok', text: `${t('padm.voiceMade')}: ${v.steps}${v.mix ? ' + ' + t('steps.mix') : ''}${v.failed ? ` · ✕ ${v.failed}` : ''}` });
        })}>{t('padm.genVoice')}</button>
        <button type="button" className="btn-ghost text-counterfeit" disabled={busy} onClick={() => { if (confirm(`${t('madm.delete')}?`)) run(() => api.del(`/api/admin/paint/recipes/${r.id}`)); }}>{t('madm.delete')}</button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <RecipeCard r={r} />
    </div>
  );
}

function Requests() {
  const { t } = useI18n();
  const [rows, setRows] = useState<{ id: string; hex: string; note: string | null; by_name: string; created_at: string }[] | null>(null);
  const load = useCallback(() => api.get<{ requests: any[] }>('/api/admin/paint/requests').then((r) => setRows(r.requests)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [load]);
  if (rows && !rows.length) return <p className="text-sm text-muted">{t('noData')}</p>;
  return (
    <ul className="divide-y divide-hairline">
      {rows?.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
          <span className="h-8 w-8 shrink-0 rounded border border-hairline" style={{ background: r.hex }} />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.hex} <span className="font-sans text-muted">· {r.by_name} · {r.created_at.slice(0, 10)}</span>{r.note ? ` · ${r.note}` : ''}</span>
          <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={async () => { await api.del(`/api/admin/paint/requests/${r.id}`).catch(() => {}); load(); }}>✕</button>
        </li>
      ))}
    </ul>
  );
}

/** The painting steps of a recipe: short sentence, picture (illustration or photo), timer, and voice. */
function StepsEditor({ r, onChanged }: { r: PaintRecipe; onChanged: () => void }) {
  const { t } = useI18n();
  const blank = { text: '', icon: 'thin_coat' as StepIcon | '', minutes: '' };
  const [add, setAdd] = useState(blank);
  const [edit, setEdit] = useState<{ id: string; text: string; icon: StepIcon | ''; minutes: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setMsg(null);
    try {
      const res = (await fn()) as { voiced?: boolean } | undefined;
      if (res && res.voiced === false) setMsg({ tone: 'warn', text: t('padm.ttsOff') });
      onChanged();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  const body = (x: { text: string; icon: StepIcon | ''; minutes: string }) => ({ text: x.text, icon: x.icon || null, minutes: x.minutes ? Number(x.minutes) : null });
  const file = (f: File) => { const fd = new FormData(); fd.append('file', f); return fd; };
  const audioLabel = (a: 'voice' | 'tts' | null) => (a === 'voice' ? t('padm.audioVoice') : a === 'tts' ? t('padm.audioTts') : t('padm.audioNone'));

  const IconPick = ({ value, onPick }: { value: StepIcon | ''; onPick: (v: StepIcon | '') => void }) => (
    <div className="flex flex-wrap gap-1">
      {STEP_ICONS.map((ic) => (
        <button key={ic} type="button" title={t(`art.${ic}`)} onClick={() => onPick(value === ic ? '' : ic)}
          className={`h-12 w-14 rounded-lg border p-0.5 ${value === ic ? 'border-gold ring-2 ring-gold' : 'border-hairline'}`}><StepArt icon={ic} /></button>
      ))}
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="label">{t('padm.steps')}</div>
      <ol className="space-y-2">
        {r.steps.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-hairline p-2 text-sm">
            {edit?.id === s.id ? (
              <div className="space-y-1.5">
                <textarea className="input min-h-[56px]" maxLength={500} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                <IconPick value={edit.icon} onPick={(v) => setEdit({ ...edit, icon: v })} />
                <input className="input !w-40" type="number" min={1} max={1440} placeholder={t('padm.minutes')} value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: e.target.value })} />
                <div className="flex gap-2">
                  <button type="button" className="btn-primary !px-2 !py-0.5 text-xs" disabled={!!busy || edit.text.trim().length < 2}
                    onClick={() => run('e', () => api.put(`/api/admin/paint/steps/${s.id}`, body(edit))).then(() => setEdit(null))}>{t('save')}</button>
                  <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setEdit(null)}>{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-low">
                  {s.has_photo ? <img src={`/api/paint/steps/${s.id}/photo?v=${encodeURIComponent(s.updated_at)}`} alt="" className="h-full w-full object-cover" /> : <StepArt icon={s.icon} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p><span className="font-mono text-xs text-muted">{i + 1}.</span> {s.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {s.minutes && <span>⏱ {s.minutes} {t('care.minutes')}</span>}
                    <span>{audioLabel(s.audio)}</span>
                    {s.audio && <button type="button" className="text-gold" onClick={() => playUrl(`/api/paint/steps/${s.id}/audio?v=${encodeURIComponent(s.updated_at)}`)}>▶</button>}
                  </div>
                </div>
              </div>
            )}
            {edit?.id !== s.id && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <button type="button" className="btn-ghost !px-2 !py-0 text-xs" disabled={!!busy || i === 0} onClick={() => run('m', () => api.post(`/api/admin/paint/steps/${s.id}/move`, { dir: 'up' }))}>↑</button>
                <button type="button" className="btn-ghost !px-2 !py-0 text-xs" disabled={!!busy || i === r.steps.length - 1} onClick={() => run('m', () => api.post(`/api/admin/paint/steps/${s.id}/move`, { dir: 'down' }))}>↓</button>
                <button type="button" className="btn-ghost !px-2 !py-0 text-xs" onClick={() => setEdit({ id: s.id, text: s.text, icon: s.icon ?? '', minutes: s.minutes ? String(s.minutes) : '' })}>{t('cadm.edit')}</button>
                <label className={`btn-ghost cursor-pointer !px-2 !py-0 text-xs ${busy ? 'pointer-events-none opacity-50' : ''}`}>📷
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('p', () => api.post(`/api/admin/paint/steps/${s.id}/photo`, file(f))); }} />
                </label>
                {s.has_photo && <button type="button" className="btn-ghost !px-2 !py-0 text-xs" onClick={() => run('p', () => api.del(`/api/admin/paint/steps/${s.id}/photo`))}>📷✕</button>}
                <VoiceRecorder disabled={!!busy} onDone={(f) => run('v', () => api.post(`/api/admin/paint/steps/${s.id}/voice`, file(f)))} />
                {s.audio === 'voice' && <button type="button" className="btn-ghost !px-2 !py-0 text-xs" onClick={() => run('v', () => api.del(`/api/admin/paint/steps/${s.id}/voice`))}>{t('padm.delRec')}</button>}
                <button type="button" className="btn-ghost !px-2 !py-0 text-xs text-counterfeit" disabled={!!busy} onClick={() => { if (confirm(`${t('madm.delete')}?`)) run('d', () => api.del(`/api/admin/paint/steps/${s.id}`)); }}>✕</button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="space-y-1.5 rounded-lg bg-surface-low p-2">
        <textarea className="input min-h-[56px]" maxLength={500} placeholder={t('padm.stepText')} value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
        <IconPick value={add.icon} onPick={(v) => setAdd({ ...add, icon: v })} />
        <input className="input !w-40" type="number" min={1} max={1440} placeholder={t('padm.minutes')} value={add.minutes} onChange={(e) => setAdd({ ...add, minutes: e.target.value })} />
        <button type="button" className="btn-ghost text-sm" disabled={!!busy || add.text.trim().length < 2}
          onClick={() => run('a', () => api.post(`/api/admin/paint/recipes/${r.id}/steps`, body(add))).then(() => setAdd(blank))}>{t('padm.addStep')}</button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
