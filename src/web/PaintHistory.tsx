import React, { useState } from 'react';
import { useI18n } from './i18n.tsx';
import { clearHistory, deleteHistory, readHistory, type PaintHistoryEntry } from './paintHistory.ts';

/** Past colour scans on this phone: swatch, leather / finish, the recipe it matched and the mix. Tap one to open its mix. */
export default function PaintHistory({ onUseRecipe, onPickRecipe }: { onUseRecipe: (recipeId: string) => void; onPickRecipe: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<PaintHistoryEntry[]>(readHistory);
  const remove = (id: string) => { deleteHistory(id); setList(readHistory()); };
  const clear = () => { if (window.confirm(t('ph.clearAsk'))) { clearHistory(); setList([]); } };
  const when = (s: string) => new Date(s).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-lg leading-tight">{t('ph.title')}</h2>
        <span className="text-[11px] text-muted">{t('ph.device')}</span>
      </div>

      {list.length === 0 && <p className="rounded-2xl border border-hairline bg-surface-card p-4 text-sm text-muted">{t('ph.empty')}</p>}

      <ul className="space-y-2">
        {list.map((e) => {
          const total = e.paints.reduce((a, p) => a + p.parts, 0) || 1;
          return (
            <li key={e.id}>
              <details className="group rounded-2xl border border-hairline bg-surface-card">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                  <span className="h-14 w-14 shrink-0 rounded-xl border border-hairline" style={{ background: e.hex }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.recipeName || e.name}</span>
                    <span className="block font-mono text-[11px] text-muted">{e.hex.toUpperCase()}{e.approx ? ` · ${t('pn.approx')}` : ''}</span>
                    <span className="block text-[11px] text-muted">
                      {when(e.at)}{e.leather ? ` · ${t(`paint.surface.${e.leather}`)}` : ''}{e.finish ? ` · ${t(`paint.finish.${e.finish}`)}` : ''}
                    </span>
                  </span>
                  <span aria-hidden className="text-muted transition group-open:rotate-90">›</span>
                </summary>
                <div className="space-y-3 border-t border-hairline p-3">
                  {e.paints.length > 0 ? (
                    <>
                      <div className="flex h-10 overflow-hidden rounded-lg border border-hairline" role="img" aria-label={t('pn.mixTitle')}>
                        {e.paints.map((p, i) => <span key={i} style={{ flexGrow: p.parts, flexBasis: 0, background: p.hex ?? '#888888' }} />)}
                      </div>
                      <ul className="space-y-1.5">
                        {e.paints.map((p, i) => (
                          <li key={i} className="flex items-center gap-2.5 text-sm">
                            <span className="h-5 w-5 shrink-0 rounded-full border border-hairline" style={{ background: p.hex ?? 'transparent' }} />
                            <span className="min-w-0 flex-1 truncate">{p.name}{p.code && <span className="ml-1.5 font-mono text-gold">{p.code}</span>}</span>
                            <span className="font-mono font-bold text-gold">{p.parts}</span>
                            <span className="w-10 text-right text-[11px] text-muted">{Math.round((p.parts / total) * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : <p className="text-xs text-muted">{t('ph.noMix')}</p>}
                  <div className="flex gap-2">
                    {e.recipeId && <button type="button" className="btn-primary flex-1 !py-2" onClick={() => onUseRecipe(e.recipeId!)}>{t('ph.useRecipe')}</button>}
                    <button type="button" className="btn-ghost !py-2" onClick={() => remove(e.id)}>{t('ph.delete')}</button>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <button type="button" className="font-semibold text-gold" onClick={onPickRecipe}>{t('pw.recipe')} ›</button>
        {list.length > 0 && <button type="button" className="text-muted underline" onClick={clear}>{t('ph.clear')}</button>}
      </div>
    </div>
  );
}
