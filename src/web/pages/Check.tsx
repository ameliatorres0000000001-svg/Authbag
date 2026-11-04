import React, { useContext, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useI18n } from '../i18n.tsx';
import { MeContext } from '../App.tsx';
import { Field, Notice, errText } from '../ui.tsx';
import DateCodeDecoder from '../DateCodeDecoder.tsx';
import { STAFF_ROLES } from '../studio.ts';

type Mode = 'photo' | 'upload' | 'code' | null;

const ICON: Record<string, string> = {
  photo: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  nfc: 'M6 18a8 8 0 0 1 0-12M9.5 15a4 4 0 0 1 0-6M18 6a8 8 0 0 1 0 12M14.5 9a4 4 0 0 1 0 6',
  code: 'M4 7h16M4 12h10M4 17h7',
  official: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4',
};

/** Entry point for checking a bag: big actions, each leading into the existing flows. */
export default function Check() {
  const { t } = useI18n();
  const me = useContext(MeContext)!;
  const staff = STAFF_ROLES.includes(me.role);
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 pb-10 pt-5 md:px-8">
      <header>
        <h1 className="text-[28px] leading-tight">{t('check.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('check.subtitle')}</p>
      </header>

      <Link to="/verify" className="flex items-center gap-4 rounded-2xl border border-charcoal bg-charcoal p-4 text-white shadow-sm transition hover:ring-2 hover:ring-gold">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-charcoal"><Svg d={ICON.official} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-xl leading-tight">{t('vr.title')}</span>
          <span className="block text-sm text-white/70">{t('vr.hubHelp')}</span>
        </span>
        <span className="text-gold">→</span>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Tile id="photo" title={t('check.photo')} help={t('check.photoHelp')} active={mode === 'photo'} onClick={() => setMode(mode === 'photo' ? null : 'photo')} primary />
        <Tile id="upload" title={t('check.upload')} help={t('check.uploadHelp')} active={mode === 'upload'} onClick={() => setMode(mode === 'upload' ? null : 'upload')} />
        <Tile id="nfc" title={t('check.nfc')} help={t('check.nfcHelp')} to="/check/nfc" />
        <Tile id="code" title={t('check.code')} help={t('check.codeHelp')} active={mode === 'code'} onClick={() => setMode(mode === 'code' ? null : 'code')} />
      </div>

      {(mode === 'photo' || mode === 'upload') && (staff ? <StartForm upload={mode === 'upload'} /> : <Notice>{t('check.staffOnly')}</Notice>)}
      {mode === 'code' && <DateCodeDecoder />}

      <Link to="/verify/entrupy" className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface-card p-4 transition hover:border-gold">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold text-gold"><Svg d={ICON.official} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-lg leading-tight">{t('check.official')}</span>
          <span className="block text-sm text-muted">{t('check.officialHelp')}</span>
        </span>
        <span className="text-muted">→</span>
      </Link>
    </div>
  );
}

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);

function Tile({ id, title, help, to, onClick, active, primary }: { id: string; title: string; help: string; to?: string; onClick?: () => void; active?: boolean; primary?: boolean }) {
  const cls = `flex min-h-[9.5rem] flex-col justify-between rounded-2xl border p-4 text-left transition ${
    primary ? 'border-charcoal bg-charcoal text-white' : active ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'} ${active && primary ? 'ring-2 ring-gold' : ''}`;
  const body = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${primary ? 'bg-gold text-charcoal' : 'bg-charcoal text-gold'}`}><Svg d={ICON[id]} /></span>
      <span>
        <span className="block font-serif text-xl leading-tight">{title}</span>
        <span className={`mt-0.5 block text-xs leading-snug ${primary ? 'text-white/70' : 'text-muted'}`}>{help}</span>
      </span>
    </>
  );
  return to ? <Link to={to} className={cls}>{body}</Link> : <button type="button" onClick={onClick} aria-expanded={active} className={cls}>{body}</button>;
}

function StartForm({ upload }: { upload: boolean }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const [tax, setTax] = useState<any>(null);
  const [brandId, setBrandId] = useState(''); const [modelId, setModelId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.get('/api/taxonomy').then(setTax).catch((e) => setErr(errText(e))); }, []);
  const models = (tax?.models ?? []).filter((m: any) => m.brand_id === brandId);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.post('/api/inspections', { brandId, modelId, claimedYear: null }); nav(`/inspections/${r.id}/scan`); }
    catch (e2) { setErr(errText(e2)); setBusy(false); }
  }
  return (
    <form onSubmit={go} className="space-y-3 rounded-2xl border border-gold bg-surface-card p-4">
      <div className="font-serif text-lg">{t('check.which')}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t('brand')}>
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setModelId(''); }} required>
            <option value="">—</option>{tax?.brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label={t('model')}>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} required disabled={!brandId}>
            <option value="">—</option>{models.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
      </div>
      {upload && <p className="text-xs text-muted">{t('check.uploadNote')}</p>}
      {err && <Notice tone="bad">{err}</Notice>}
      <button className="btn-primary w-full !py-3" disabled={!modelId || busy}>{busy ? '…' : `${t('check.start')} →`}</button>
    </form>
  );
}
