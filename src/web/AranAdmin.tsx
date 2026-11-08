import React, { useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { MeContext } from './App.tsx';
import { Field, Notice, errText } from './ui.tsx';
import { ADMIN_ROLES } from './studio.ts';
import type { AranPrice } from './pages/Aran.tsx';
import { PriceTable } from './pages/Aran.tsx';

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { category: 'bale' as AranPrice['category'], item: '', grade: '', priceMin: '', priceMax: '', currency: 'THB', unit: 'bale', observedOn: today(), source: '', note: '' };

/** Staff record prices they saw at the Aran market (or read in a source), with the date. */
export default function AranAdmin() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const admin = ADMIN_ROLES.includes(me.role);
  const [rows, setRows] = useState<AranPrice[] | null>(null);
  const [f, setF] = useState({ ...EMPTY, source: t('aran.seenMyself') });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const load = useCallback(() => api.get<{ prices: AranPrice[] }>('/api/admin/aran/prices').then((r) => setRows(r.prices)).catch((e) => setMsg({ tone: 'bad', text: errText(e) })), []);
  useEffect(() => { load(); }, [load]);
  const num = (v: string) => (v.trim() === '' ? null : Math.round(Number(v)));
  const save = async () => {
    setMsg(null);
    try {
      await api.post('/api/admin/aran/prices', { category: f.category, item: f.item, grade: f.grade || null, priceMin: num(f.priceMin), priceMax: num(f.priceMax), currency: f.currency, unit: f.unit, observedOn: f.observedOn, source: f.source, note: f.note || null });
      setF({ ...f, item: '', grade: '', priceMin: '', priceMax: '', note: '' }); setMsg({ tone: 'ok', text: t('madm.saved') }); load();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const del = async (id: string) => { if (!window.confirm(t('aran.confirmDelete'))) return; try { await api.del(`/api/admin/aran/prices/${id}`); load(); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } };
  const ok = f.item.trim().length >= 2 && (f.priceMin !== '' || f.priceMax !== '') && f.source.trim().length >= 2;

  return (
    <div className="card space-y-3">
      <div className="font-semibold">🏷️ {t('aran.boardAdmin')}</div>
      <p className="text-sm text-muted">{t('aran.boardHelp')}</p>
      <div className="grid grid-cols-3 gap-1 rounded-full bg-surface-low p-1 text-xs">
        {(['bale', 'bag', 'service'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setF({ ...f, category: k, unit: k === 'bale' ? 'bale' : k === 'bag' ? 'piece' : 'job' })}
            className={`rounded-full px-2 py-1.5 ${f.category === k ? 'bg-charcoal text-white' : ''}`}>{t(`aran.c.${k}`)}</button>
        ))}
      </div>
      <Field label={t('aran.item')}><input className="input" maxLength={120} placeholder={t(`aran.itemPh.${f.category}`)} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('aran.grade')}><input className="input" maxLength={20} placeholder="A / B / C" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} /></Field>
        <Field label={t('aran.date')}><input className="input" type="date" max={today()} value={f.observedOn} onChange={(e) => setF({ ...f, observedOn: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label={t('aran.min')}><input className="input" type="number" min={0} inputMode="numeric" value={f.priceMin} onChange={(e) => setF({ ...f, priceMin: e.target.value })} /></Field>
        <Field label={t('aran.max')}><input className="input" type="number" min={0} inputMode="numeric" value={f.priceMax} onChange={(e) => setF({ ...f, priceMax: e.target.value })} /></Field>
        <Field label={t('aran.currency')}><select className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>{['THB', 'USD', 'KHR'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('aran.unit')}><select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{['bale', 'kg', 'piece', 'job'].map((x) => <option key={x} value={x}>{t(`aran.u.${x}`)}</option>)}</select></Field>
      </div>
      <Field label={t('aran.source')}><input className="input" maxLength={300} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field>
      <Field label={t('aran.note')}><input className="input" maxLength={300} placeholder={t('aran.notePh')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button type="button" className="btn-primary" disabled={!ok} onClick={save}>{t('save')}</button>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {rows && rows.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      {rows && rows.length > 0 && <PriceTable rows={rows} onDelete={admin ? del : undefined} />}
    </div>
  );
}
