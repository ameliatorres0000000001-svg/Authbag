import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from './api.ts';
import { useI18n } from './i18n.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { CARE_TOPICS, carePhoto, type CareLesson } from './pages/Restore.tsx';
import type { CareStep } from './pages/RestoreLesson.tsx';

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
type Form = { topic: string; level: string; title_km: string; title_en: string; summary: string; materials: string; safety: string; minutes: string };
const empty: Form = { topic: 'cleaning', level: 'beginner', title_km: '', title_en: '', summary: '', materials: '', safety: '', minutes: '' };
const body = (f: Form) => ({ ...f, title_en: f.title_en || null, summary: f.summary || null, materials: f.materials || null, safety: f.safety || null, minutes: f.minutes ? Number(f.minutes) : null });

/** Admin: write bag painting / repair lessons (before/after photos, steps with photos), let AI draft steps, publish. */
export default function CareAdmin() {
  const { t } = useI18n();
  const [list, setList] = useState<CareLesson[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get<{ lessons: CareLesson[] }>('/api/care/lessons?all=1').then((r) => setList(r.lessons)).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setErr('');
    try { const r = await api.post<{ id: string }>('/api/admin/care/lessons', body(form)); setForm(empty); setCreating(false); await load(); setOpen(r.id); }
    catch (e) { setErr(errText(e)); }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl">{t('cadm.title')}</h2>
        <button type="button" className="btn-primary !px-3 !py-1 text-sm" onClick={() => { setCreating(!creating); setOpen(null); }}>{creating ? t('cadm.close') : t('cadm.new')}</button>
      </div>
      {creating && (
        <div className="space-y-2 rounded-lg border border-hairline p-3">
          <LessonFields form={form} setForm={setForm} short />
          <button type="button" className="btn-primary" disabled={form.title_km.trim().length < 3} onClick={create}>{t('create')}</button>
        </div>
      )}
      {list.length === 0 && !creating && <p className="text-sm text-muted">{t('noData')}</p>}
      <ul className="divide-y divide-hairline">
        {list.map((l) => (
          <li key={l.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${l.status === 'published' ? 'bg-verified' : 'bg-review'}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{l.title_km} <span className="text-xs text-muted">· {t(`care.topic.${l.topic}`)} · {l.steps ?? 0} {t('care.steps')}</span></span>
              <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => { setOpen(open === l.id ? null : l.id); setCreating(false); }}>{open === l.id ? t('cadm.close') : t('cadm.edit')}</button>
            </div>
            {open === l.id && <LessonEditor id={l.id} onChanged={load} onDeleted={() => { setOpen(null); load(); }} />}
          </li>
        ))}
      </ul>
      {err && <Notice tone="bad">{err}</Notice>}
    </div>
  );
}

function LessonFields({ form, setForm, short }: { form: Form; setForm: (f: Form) => void; short?: boolean }) {
  const { t } = useI18n();
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <>
      <Field label={t('cadm.titleKm')}><input className="input" maxLength={160} value={form.title_km} onChange={set('title_km')} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('cadm.topic')}><select className="input" value={form.topic} onChange={set('topic')}>{CARE_TOPICS.map((x) => <option key={x} value={x}>{t(`care.topic.${x}`)}</option>)}</select></Field>
        <Field label={t('cadm.level')}><select className="input" value={form.level} onChange={set('level')}>{LEVELS.map((x) => <option key={x} value={x}>{t(`care.level.${x}`)}</option>)}</select></Field>
      </div>
      {!short && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('cadm.titleEn')}><input className="input" maxLength={160} value={form.title_en} onChange={set('title_en')} /></Field>
            <Field label={t('cadm.minutes')}><input className="input" type="number" min={1} max={1440} value={form.minutes} onChange={set('minutes')} /></Field>
          </div>
          <Field label={t('cadm.summary')}><textarea className="input min-h-[60px]" maxLength={800} value={form.summary} onChange={set('summary')} /></Field>
          <Field label={t('cadm.materials')}><textarea className="input min-h-[80px]" maxLength={1500} value={form.materials} onChange={set('materials')} /></Field>
          <Field label={t('cadm.safety')}><textarea className="input min-h-[60px]" maxLength={1000} value={form.safety} onChange={set('safety')} /></Field>
        </>
      )}
    </>
  );
}

/** Upload one photo through a hidden file input. */
function PhotoButton({ label, url, onFile, busy }: { label: string; url: string | null; onFile: (f: File) => void; busy: boolean }) {
  return (
    <label className={`flex cursor-pointer flex-col items-center gap-1 text-xs ${busy ? 'pointer-events-none opacity-50' : ''}`}>
      <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-strong bg-surface-low">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-xl text-muted">＋</span>}
      </span>
      {label}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
  );
}

function LessonEditor({ id, onChanged, onDeleted }: { id: string; onChanged: () => void; onDeleted: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<{ lesson: CareLesson; steps: CareStep[] } | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);
  const [step, setStep] = useState({ body: '', tip: '' });
  const [editing, setEditing] = useState<{ id: string; body: string; tip: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ lesson: CareLesson; steps: CareStep[] }>(`/api/care/lessons/${id}`);
    setD(r);
    const l = r.lesson;
    setForm({ topic: l.topic, level: l.level, title_km: l.title_km, title_en: l.title_en ?? '', summary: l.summary ?? '', materials: l.materials ?? '', safety: l.safety ?? '', minutes: l.minutes ? String(l.minutes) : '' });
  }, [id]);
  useEffect(() => { load().catch((e) => setMsg({ tone: 'bad', text: errText(e) })); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); await load(); onChanged(); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) {
      const code = e instanceof ApiError ? e.body?.error : '';
      setMsg({ tone: 'bad', text: code === 'no_steps' ? t('cadm.noSteps') : code === 'ai_not_configured' ? t('chat.notConfigured') : errText(e) });
    } finally { setBusy(''); }
  };
  const upload = (url: string, f: File) => { const fd = new FormData(); fd.append('file', f); return api.post(url, fd); };

  if (!d) return <div className="mt-2 h-24 animate-pulse rounded bg-surface-low" />;
  const l = d.lesson;
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-hairline p-3">
      {l.ai_drafted ? <Notice tone="warn">{t('care.aiDrafted')}</Notice> : null}
      <LessonFields form={form} setForm={setForm} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={!!busy || form.title_km.trim().length < 3} onClick={() => run('save', () => api.put(`/api/admin/care/lessons/${id}`, body(form)), t('madm.saved'))}>{t('save')}</button>
        {l.status === 'published'
          ? <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('st', () => api.post(`/api/admin/care/lessons/${id}/status`, { status: 'draft' }))}>{t('cadm.unpublish')}</button>
          : <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => run('st', () => api.post(`/api/admin/care/lessons/${id}/status`, { status: 'published' }), t('cadm.published'))}>{t('cadm.publish')}</button>}
        <Link to={`/restore/${id}`} className="btn-ghost">👁</Link>
      </div>

      <div className="flex gap-4">
        <PhotoButton label={t('cadm.beforePhoto')} url={l.has_before ? carePhoto(l, 'before') : null} busy={!!busy}
          onFile={(f) => run('before', () => upload(`/api/admin/care/lessons/${id}/photo/before`, f))} />
        <PhotoButton label={t('cadm.afterPhoto')} url={l.has_after ? carePhoto(l, 'after') : null} busy={!!busy}
          onFile={(f) => run('after', () => upload(`/api/admin/care/lessons/${id}/photo/after`, f))} />
      </div>

      <div>
        <h3 className="mb-1 text-base">{t('care.steps')}</h3>
        {d.steps.length === 0 && (
          <button type="button" className="btn-ghost mb-2 text-sm" disabled={!!busy} onClick={() => run('ai', () => api.post(`/api/admin/care/lessons/${id}/ai-draft`))}>
            {busy === 'ai' ? t('cadm.aiWorking') : `✨ ${t('cadm.aiDraft')}`}
          </button>
        )}
        <ol className="space-y-2">
          {d.steps.map((s, i) => (
            <li key={s.id} className="rounded-lg border border-hairline p-2 text-sm">
              {editing?.id === s.id ? (
                <div className="space-y-1">
                  <textarea className="input min-h-[60px]" maxLength={2000} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
                  <input className="input" maxLength={600} placeholder={t('cadm.stepTip')} value={editing.tip} onChange={(e) => setEditing({ ...editing, tip: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary !px-2 !py-0.5 text-xs" disabled={!!busy || editing.body.trim().length < 3}
                      onClick={() => run('edit', () => api.put(`/api/admin/care/steps/${s.id}`, { body: editing.body, tip: editing.tip || null })).then(() => setEditing(null))}>{t('save')}</button>
                    <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setEditing(null)}>{t('cancel')}</button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <span className="font-mono text-xs text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line">{s.body}</p>
                    {s.tip && <p className="text-xs text-muted">💡 {s.tip}</p>}
                  </div>
                  <PhotoButton label="" url={s.has_photo ? `/api/care/steps/${s.id}/photo?v=${encodeURIComponent(l.updated_at)}` : null} busy={!!busy}
                    onFile={(f) => run('sp', () => upload(`/api/admin/care/steps/${s.id}/photo`, f))} />
                </div>
              )}
              {editing?.id !== s.id && (
                <div className="mt-1 flex gap-1">
                  <button type="button" className="btn-ghost !px-2 !py-0 text-xs" disabled={!!busy || i === 0} onClick={() => run('mv', () => api.post(`/api/admin/care/steps/${s.id}/move`, { dir: 'up' }))} aria-label="up">↑</button>
                  <button type="button" className="btn-ghost !px-2 !py-0 text-xs" disabled={!!busy || i === d.steps.length - 1} onClick={() => run('mv', () => api.post(`/api/admin/care/steps/${s.id}/move`, { dir: 'down' }))} aria-label="down">↓</button>
                  <button type="button" className="btn-ghost !px-2 !py-0 text-xs" onClick={() => setEditing({ id: s.id, body: s.body, tip: s.tip ?? '' })}>{t('cadm.edit')}</button>
                  <button type="button" className="btn-ghost !px-2 !py-0 text-xs text-counterfeit" disabled={!!busy}
                    onClick={() => { if (confirm(`${t('madm.delete')}?`)) run('del', () => api.del(`/api/admin/care/steps/${s.id}`)); }}>{t('madm.delete')}</button>
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-2 space-y-1 rounded-lg bg-surface-low p-2">
          <textarea className="input min-h-[60px]" maxLength={2000} placeholder={t('cadm.stepBody')} value={step.body} onChange={(e) => setStep({ ...step, body: e.target.value })} />
          <input className="input" maxLength={600} placeholder={t('cadm.stepTip')} value={step.tip} onChange={(e) => setStep({ ...step, tip: e.target.value })} />
          <button type="button" className="btn-ghost text-sm" disabled={!!busy || step.body.trim().length < 3}
            onClick={() => run('add', () => api.post(`/api/admin/care/lessons/${id}/steps`, { body: step.body, tip: step.tip || null })).then(() => setStep({ body: '', tip: '' }))}>+ {t('cadm.addStep')}</button>
        </div>
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button type="button" className="btn-ghost text-sm text-counterfeit" disabled={!!busy}
        onClick={async () => { if (!confirm(t('cadm.confirmDelete'))) return; try { await api.del(`/api/admin/care/lessons/${id}`); onDeleted(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } }}>{t('cadm.deleteLesson')}</button>
    </div>
  );
}
