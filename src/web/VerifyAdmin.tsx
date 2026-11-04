import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { errText } from './ui.tsx';

interface PlanRow { id: string; name_en: string; name_km: string; brands_json: string; price_cents: number | null; entrupy_price_cents: number | null; currency: string; active: number }
interface TgStatus { botToken: boolean; chatId: boolean; webhookSecret: boolean; webhook: { url?: string; pending?: number; lastError?: string } | null }

const toCents = (s: string) => (s.trim() === '' ? null : Math.round(Number(s) * 100));
const fromCents = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));

/** Admin: expert-verification setup — Telegram connection and the price tiers (prices stay empty until set). */
export default function VerifyAdmin() {
  const { t } = useI18n();
  const [tg, setTg] = useState<TgStatus | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api.get<TgStatus>('/api/admin/telegram/status').then(setTg).catch((e) => setMsg(errText(e)));
    api.get<{ plans: PlanRow[] }>('/api/verify/plans').then((r) => setPlans(r.plans)).catch((e) => setMsg(errText(e)));
  }, []);
  useEffect(load, [load]);

  async function setup() {
    setMsg(null);
    try { const r = await api.post<{ url: string }>('/api/admin/telegram/setup'); setMsg(`✓ ${r.url}`); load(); } catch (e) { setMsg(errText(e)); }
  }
  const dot = (ok: boolean | undefined) => <span className={ok ? 'text-verified' : 'text-counterfeit'}>{ok ? '●' : '○'}</span>;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">🛡️ {t('vra.title')}</div>
        <Link to="/verify" className="text-xs underline">{t('vr.title')} →</Link>
      </div>
      <div className="space-y-1 rounded-lg bg-surface-low p-3 text-xs">
        <div className="font-semibold">Telegram</div>
        <div>{dot(tg?.botToken)} TELEGRAM_BOT_TOKEN · {dot(tg?.chatId)} TELEGRAM_CHAT_ID · {dot(tg?.webhookSecret)} TELEGRAM_WEBHOOK_SECRET</div>
        <div className="text-muted">{t('vra.secretsHelp')}</div>
        {tg?.webhook && <div className="break-all font-mono text-[10px]">webhook: {tg.webhook.url || '—'}{tg.webhook.lastError ? ` · ${tg.webhook.lastError}` : ''}</div>}
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={setup} disabled={!tg?.botToken || !tg?.chatId || !tg?.webhookSecret}>{t('vra.setup')}</button>
      </div>
      <div className="space-y-2">
        <div className="text-xs font-semibold">{t('vra.plans')}</div>
        {plans.map((p) => <PlanEditor key={p.id} p={p} onSaved={load} />)}
      </div>
      {msg && <p className="break-all text-xs">{msg}</p>}
    </div>
  );
}

function PlanEditor({ p, onSaved }: { p: PlanRow; onSaved: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ name_en: p.name_en, name_km: p.name_km, brands: (JSON.parse(p.brands_json) as string[]).join(', '), price: fromCents(p.price_cents), entrupy: fromCents(p.entrupy_price_cents), currency: p.currency, active: !!p.active });
  const [state, setState] = useState<string | null>(null);
  async function save() {
    setState('…');
    try {
      await api.put(`/api/admin/verify/plans/${p.id}`, {
        name_en: f.name_en, name_km: f.name_km, brands: f.brands.split(',').map((s) => s.trim()).filter(Boolean),
        price_cents: toCents(f.price), entrupy_price_cents: toCents(f.entrupy), currency: f.currency.toUpperCase(), active: f.active,
      });
      setState('✓'); onSaved();
    } catch (e) { setState(errText(e)); }
  }
  return (
    <details className="rounded-lg border border-hairline p-2 text-xs">
      <summary className="cursor-pointer">{f.name_en} · {f.price || t('vr.priceLater')}</summary>
      <div className="mt-2 grid gap-1.5">
        <input className="input !py-1 text-xs" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} aria-label="Name (EN)" />
        <input className="input !py-1 text-xs" value={f.name_km} onChange={(e) => setF({ ...f, name_km: e.target.value })} aria-label="Name (KM)" />
        <label className="text-muted">{t('vra.brands')}<input className="input !py-1 text-xs" value={f.brands} onChange={(e) => setF({ ...f, brands: e.target.value })} /></label>
        <div className="grid grid-cols-3 gap-1.5">
          <label className="text-muted">{t('vra.price')}<input className="input !py-1 text-xs" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="—" /></label>
          <label className="text-muted">Entrupy<input className="input !py-1 text-xs" inputMode="decimal" value={f.entrupy} onChange={(e) => setF({ ...f, entrupy: e.target.value })} placeholder="—" /></label>
          <label className="text-muted">{t('vra.currency')}<input className="input !py-1 text-xs" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} /></label>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t('vra.active')}</label>
        <div className="flex items-center gap-2"><button type="button" className="btn-primary !py-1 text-xs" onClick={save}>{t('vra.save')}</button>{state && <span>{state}</span>}</div>
      </div>
    </details>
  );
}
