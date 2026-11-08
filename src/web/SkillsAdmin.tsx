import React, { useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { ADMIN_ROLES } from './studio.ts';

type Area = 'all' | 'chat' | 'identify' | 'check';
interface Skill { id: string; area: Area; title: string; body: string; brand: string | null; keywords: string | null; status: 'draft' | 'active'; ai_drafted: number; uses: number; last_used_at: string | null; updated_at: string; author: string | null }
interface Form { id: string | null; area: Area; title: string; body: string; brand: string; keywords: string; status: 'draft' | 'active'; aiDrafted: boolean }
const AREAS: Area[] = ['all', 'chat', 'identify', 'check'];
const EMPTY: Form = { id: null, area: 'chat', title: '', body: '', brand: '', keywords: '', status: 'draft', aiDrafted: false };
const IDEAS = ['sk.idea1', 'sk.idea2', 'sk.idea3', 'sk.idea4', 'sk.idea5'];

/**
 * AI skills: shop knowledge staff write for the in-app AI (assistant, brand recognition, bag check).
 * Rough notes → AI tidies them → staff edit → test with a question → an admin turns it on.
 */
export default function SkillsAdmin() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const admin = ADMIN_ROLES.includes(me.role);
  const [list, setList] = useState<Skill[] | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [notes, setNotes] = useState('');
  const [q, setQ] = useState('');
  const [test, setTest] = useState<{ reply: string; used: string[] } | null>(null);
  const [busy, setBusy] = useState<'' | 'draft' | 'test' | 'save'>('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(() => api.get<{ skills: Skill[] }>('/api/admin/skills').then((r) => setList(r.skills)).catch((e) => { setList([]); setMsg({ tone: 'bad', text: errText(e) }); }), []);
  useEffect(() => { load(); api.get<{ brands: { name: string; slug: string }[] }>('/api/taxonomy').then((r) => setBrands(r.brands.filter((b) => b.slug !== 'other').map((b) => b.name))).catch(() => {}); }, [load]);

  const open = (s: Skill | null) => {
    setF(s ? { id: s.id, area: s.area, title: s.title, body: s.body, brand: s.brand ?? '', keywords: s.keywords ?? '', status: s.status, aiDrafted: !!s.ai_drafted } : { ...EMPTY });
    setNotes(''); setQ(''); setTest(null); setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const payload = (x: Form) => ({ area: x.area, title: x.title, body: x.body, brand: x.brand.trim() || null, keywords: x.keywords.trim() || null });
  const ready = !!f && f.title.trim().length >= 3 && f.body.trim().length >= 10;

  const tidy = async () => {
    if (!f) return;
    setBusy('draft'); setMsg(null);
    try {
      const d = await api.post<{ title: string; body: string; keywords: string; brand: string | null }>('/api/admin/skills/draft', { notes, area: f.area });
      setF({ ...f, title: d.title, body: d.body, keywords: d.keywords, brand: d.brand ?? f.brand, aiDrafted: true });
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  const runTest = async () => {
    if (!f) return;
    setBusy('test'); setTest(null); setMsg(null);
    try { setTest(await api.post('/api/admin/skills/test', { question: q, skill: ready ? payload(f) : null })); }
    catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  const save = async (status: 'draft' | 'active') => {
    if (!f || !ready) return;
    setBusy('save'); setMsg(null);
    try {
      if (f.id) await api.put(`/api/admin/skills/${f.id}`, { ...payload(f), status });
      else {
        const r = await api.post<{ id: string }>('/api/admin/skills', { ...payload(f), aiDrafted: f.aiDrafted });
        if (status === 'active') await api.put(`/api/admin/skills/${r.id}`, { ...payload(f), status });
      }
      setF(null); setMsg({ tone: 'ok', text: status === 'active' ? t('sk.savedOn') : t('sk.saved') }); await load();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(''); }
  };
  const remove = async () => {
    if (!f?.id || !window.confirm(t('sk.confirmDelete'))) return;
    try { await api.del(`/api/admin/skills/${f.id}`); setF(null); await load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };

  const active = list?.filter((s) => s.status === 'active').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">🧠 {t('sk.title')}</div>
            <p className="mt-1 text-sm text-muted">{t('sk.help')}</p>
          </div>
          {!f && <button type="button" className="btn-primary shrink-0" onClick={() => open(null)}>＋ {t('sk.new')}</button>}
        </div>
        {list && <p className="text-xs text-muted">{active} {t('sk.on')} · {list.length - active} {t('sk.drafts')}</p>}
      </div>

      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {f && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{f.id ? t('sk.edit') : t('sk.new')}</div>
            <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => setF(null)}>{t('cancel')}</button>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted">{t('sk.area')}</div>
            <div className="flex flex-wrap gap-1.5">
              {AREAS.map((a) => (
                <button key={a} type="button" onClick={() => setF({ ...f, area: a })} aria-pressed={f.area === a}
                  className={`rounded-full border px-3 py-1.5 text-xs ${f.area === a ? 'border-charcoal bg-charcoal text-white' : 'border-hairline bg-surface-card'}`}>{t(`sk.a.${a}`)}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{t(`sk.ah.${f.area}`)}</p>
          </div>

          {/* step 1: rough notes → AI tidies them */}
          {!f.id && (
            <div className="space-y-2 rounded-xl bg-surface-low p-3">
              <div className="text-sm font-semibold">① {t('sk.notesTitle')}</div>
              <textarea className="input min-h-[96px]" maxLength={6000} placeholder={t('sk.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button type="button" className="btn-ghost text-sm" disabled={busy !== '' || notes.trim().length < 10} onClick={tidy}>{busy === 'draft' ? '…' : `✨ ${t('sk.tidy')}`}</button>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">{t('sk.ideas')}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{IDEAS.map((k) => <li key={k}>{t(k)}</li>)}</ul>
              </details>
            </div>
          )}

          <div className="space-y-3">
            {!f.id && <div className="text-sm font-semibold">② {t('sk.checkTitle')}</div>}
            <Field label={t('sk.fTitle')}><input className="input" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label={t('sk.fBody')}><textarea className="input min-h-[160px] font-mono text-[13px]" maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('sk.fBrand')}>
                <input className="input" list="sk-brands" maxLength={80} placeholder={t('sk.fBrandPh')} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
                <datalist id="sk-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </Field>
              <Field label={t('sk.fKeywords')}><input className="input" maxLength={300} placeholder={t('sk.fKeywordsPh')} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} /></Field>
            </div>
            {f.aiDrafted && <p className="text-xs text-review">✨ {t('sk.aiNote')}</p>}
          </div>

          {/* step 3: try it */}
          <div className="space-y-2 rounded-xl border border-hairline p-3">
            <div className="text-sm font-semibold">{!f.id && '③ '}{t('sk.testTitle')}</div>
            <div className="flex gap-2">
              <input className="input flex-1" maxLength={2000} placeholder={t('sk.testPh')} value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && q.trim().length >= 2 && !busy) runTest(); }} />
              <button type="button" className="btn-ghost shrink-0 text-sm" disabled={busy !== '' || q.trim().length < 2} onClick={runTest}>{busy === 'test' ? '…' : t('sk.test')}</button>
            </div>
            {test && (
              <div className="space-y-1">
                <div className="whitespace-pre-wrap rounded-xl bg-surface-low p-3 text-sm leading-relaxed">{test.reply}</div>
                <p className="text-xs text-muted">{t('sk.used')}: {test.used.length ? test.used.join(' · ') : t('noData')}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {admin && <button type="button" className="btn-primary" disabled={!ready || busy !== ''} onClick={() => save('active')}>✓ {f.status === 'active' ? t('save') : t('sk.turnOn')}</button>}
            {(f.status === 'draft' || admin) && <button type="button" className="btn-ghost" disabled={!ready || busy !== ''} onClick={() => save('draft')}>{f.status === 'active' ? t('sk.turnOff') : t('sk.saveDraft')}</button>}
            {admin && f.id && <button type="button" className="btn-ghost ml-auto text-counterfeit" onClick={remove}>{t('sk.delete')}</button>}
          </div>
          {!admin && <p className="text-xs text-muted">{t('sk.adminOnly')}</p>}
        </div>
      )}

      {list && list.length === 0 && !f && <div className="card text-sm text-muted">{t('noData')} — {t('sk.empty')}</div>}
      {list && list.length > 0 && (
        <ul className="card divide-y divide-hairline !py-1">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" className="flex w-full items-start gap-3 py-3 text-left" onClick={() => open(s)}>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.status === 'active' ? 'bg-verified-bg text-verified' : 'bg-surface-high text-muted'}`}>{s.status === 'active' ? t('sk.stOn') : t('sk.stDraft')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{s.title}</span>
                  <span className="block truncate text-xs text-muted">{t(`sk.a.${s.area}`)}{s.brand ? ` · ${s.brand}` : ''}{s.keywords ? ` · ${s.keywords}` : ''}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted">{s.uses}×<span className="block">{t('sk.uses')}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
