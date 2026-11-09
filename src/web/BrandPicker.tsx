import React, { useMemo, useState } from 'react';
import { api } from './api.ts';
import { useI18n } from './i18n.tsx';
import { errText } from './ui.tsx';

export interface PickBrand { id: string; name: string; slug?: string }
export interface BrandChoice { brandId: string; brandText?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Searchable brand list. Typing filters the list; a brand that is not listed can be added:
 * admins add it to the brand list, customers send it with their request as a brand name (placeholder "Other").
 */
export default function BrandPicker({ brands, value, onChange, canAdd, onAdded }: {
  brands: PickBrand[]; value: BrandChoice | null; onChange: (v: BrandChoice | null) => void;
  /** admins: "+ add" creates the brand in the list */
  canAdd: boolean; onAdded?: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(!value);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const list = useMemo(() => brands.filter((b) => b.slug !== 'other').sort((a, b) => a.name.localeCompare(b.name)), [brands]);
  const other = brands.find((b) => b.slug === 'other');
  const shown = q ? list.filter((b) => norm(b.name).includes(norm(q))) : list;
  const exact = list.some((b) => norm(b.name) === norm(q));
  const selected = value ? (value.brandText ?? list.find((b) => b.id === value.brandId)?.name ?? '') : '';

  async function add() {
    const name = q.trim();
    if (!name) return;
    setErr(null);
    if (canAdd) {
      setBusy(true);
      try { const r = await api.post<{ id: string }>('/api/brands', { name }); onAdded?.(); onChange({ brandId: r.id }); setQ(''); setOpen(false); }
      catch (e) { setErr(errText(e)); }
      setBusy(false);
    } else if (other) {
      onChange({ brandId: other.id, brandText: name }); setQ(''); setOpen(false);
    }
  }

  if (value && selected && !open) return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-gold bg-gold-light px-3 py-2.5">
      <span className="min-w-0 truncate font-semibold">
        {selected}{value.brandText && <span className="ml-1.5 text-[11px] font-normal text-muted">({t('bp.notListed')})</span>}
      </span>
      <button type="button" className="shrink-0 text-xs underline" onClick={() => { setOpen(true); setQ(''); }}>{t('bp.change')}</button>
    </div>
  );

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>⌕</span>
        <input className="input !pl-8" value={q} placeholder={t('bp.search')} autoComplete="off"
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (shown.length === 1) { onChange({ brandId: shown[0].id }); setOpen(false); setQ(''); } else if (!exact && q.trim()) add(); } }} />
      </div>
      {open && (
        <ul className="max-h-60 overflow-y-auto rounded-xl border border-hairline bg-surface-card" role="listbox">
          {shown.map((b) => (
            <li key={b.id}>
              <button type="button" role="option" aria-selected={value?.brandId === b.id && !value.brandText}
                onClick={() => { onChange({ brandId: b.id }); setOpen(false); setQ(''); }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-[15px] hover:bg-surface-low ${value?.brandId === b.id && !value.brandText ? 'font-semibold' : ''}`}>
                {b.name}{value?.brandId === b.id && !value.brandText && <span className="text-gold">✓</span>}
              </button>
            </li>
          ))}
          {!shown.length && !q && <li className="px-3 py-2.5 text-sm text-muted">{t('noData')}</li>}
          {q.trim() && !exact && (canAdd || other) && (
            <li className="border-t border-hairline">
              <button type="button" disabled={busy} onClick={add} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[15px] font-semibold text-ink hover:bg-gold-light">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-charcoal">+</span>
                {busy ? '…' : `${canAdd ? t('bp.addList') : t('bp.add')} “${q.trim()}”`}
              </button>
            </li>
          )}
        </ul>
      )}
      {err && <p className="text-xs text-counterfeit">{err}</p>}
    </div>
  );
}
