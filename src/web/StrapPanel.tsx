import { useMemo, useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { deltaE2000, matchLevel, rgbToLab, type Lab } from '../shared/color.ts';
import type { PaintRecipe } from './pages/Paint.tsx';

/**
 * Strap workflow (owner request, 2026-11-17), shown on the paint screen when "Bag strap" is chosen.
 * Colours come only from published recipes that staff tagged strap-safe (and fast-soak): the app shows those tags,
 * never a made-up percentage, and no stock status. A custom colour gets a recipe only when one is close (ΔE ≤ 6).
 */
const FLEX_PERCENT = 20; // flex softener share of the mix (owner's strap guideline)
// theme tokens (not fixed colours) so the panel follows light / dark
const OBSIDIAN = 'rgb(var(--c-surface))', CARD = 'rgb(var(--c-surface-card))', GOLD = 'rgb(var(--c-gold))', LINE = 'rgb(var(--c-hairline))', ON_GOLD = 'rgb(var(--c-on-gold))';
const tint = (pct: number) => `color-mix(in srgb, ${GOLD} ${pct}%, transparent)`;
const STEPS: [string, string][] = [['🧽', 'strap.s1'], ['🖌️', 'strap.s2'], ['⏱️', 'strap.s3'], ['🛡️', 'strap.s4']];

const hexLab = (hex: string): Lab => {
  const n = parseInt(hex.slice(1), 16);
  return rgbToLab([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
};

export default function StrapPanel({ recipes }: { recipes: PaintRecipe[] | null }) {
  const { t, locale } = useI18n();
  const [picked, setPicked] = useState<PaintRecipe | null>(null);
  const [custom, setCustom] = useState<{ hex: string; none: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  // staff-tagged recipes: soaks in fast and safe first, then safe only
  const list = useMemo(() => (recipes ?? []).filter((r) => r.status === 'published' && r.strap_safe)
    .sort((a, b) => Number(!!b.fast_soak) - Number(!!a.fast_soak)), [recipes]);
  const name = (r: PaintRecipe) => (locale !== 'km' && r.name_en ? r.name_en : r.name_km);

  const onCustom = (hex: string) => {
    const lab = hexLab(hex);
    const best = list.map((r) => ({ r, dE: deltaE2000(lab, [r.lab_l, r.lab_a, r.lab_b]) })).sort((x, y) => x.dE - y.dE)[0];
    if (best && matchLevel(best.dE) !== 'none') { setPicked(best.r); setCustom({ hex, none: false }); }
    else { setPicked(null); setCustom({ hex, none: true }); }
  };
  const play = () => {
    if (!picked) return;
    if (playing) { audio.current?.pause(); setPlaying(false); return; }
    const a = new Audio(`/api/paint/recipes/${picked.id}/mix-audio`);
    audio.current = a; a.onended = () => setPlaying(false); a.onerror = () => setPlaying(false);
    setPlaying(true); void a.play().catch(() => setPlaying(false));
  };

  const total = picked ? picked.parts.reduce((s, p) => s + p.parts, 0) || 1 : 1;
  return (
    <section className="space-y-3 rounded-3xl border p-4" style={{ background: CARD, borderColor: tint(40) }}>
      <h2 className="text-base font-semibold leading-snug" style={{ color: GOLD }}>🎨 {t('strap.recTitle')}</h2>
      {recipes && list.length === 0 && <p className="text-sm text-muted">{t('noData')}</p>}
      <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((r) => (
          <button key={r.id} type="button" onClick={() => { setPicked(r); setCustom(null); }} aria-pressed={picked?.id === r.id}
            className="w-32 shrink-0 snap-start rounded-2xl border p-2.5 text-left" style={{ background: OBSIDIAN, borderColor: picked?.id === r.id ? GOLD : LINE }}>
            <span className="block h-10 w-10 rounded-full border border-white/20" style={{ background: r.hex }} />
            <span className="mt-2 block text-[13px] font-semibold leading-snug">{name(r)}</span>
            <span className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              {!!r.fast_soak && <span className="rounded-full px-1.5 py-0.5" style={{ background: tint(13), color: GOLD }}>⚡ {t('strap.fast')}</span>}
              <span className="rounded-full px-1.5 py-0.5" style={{ background: 'rgb(var(--c-verified-bg))', color: 'rgb(var(--c-verified))' }}>🛡️ {t('strap.safe')}</span>
            </span>
          </button>
        ))}
        <label className="flex w-32 shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed p-2.5 text-center text-[12px]" style={{ borderColor: `${GOLD}88`, color: GOLD }}>
          <input type="color" className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent p-0" value={custom?.hex ?? '#3a2a1c'} onChange={(e) => onCustom(e.target.value)} aria-label={t('strap.custom')} />
          {t('strap.custom')}
        </label>
      </div>
      {custom?.none && <p className="rounded-xl px-3 py-2 text-sm" style={{ background: 'rgb(var(--c-review-bg))', color: 'rgb(var(--c-review))' }}>{t('strap.noRecipe')}</p>}
      {custom && !custom.none && picked && <p className="text-xs text-muted">{t('strap.closeNote')}</p>}

      {picked && (
        <article className="space-y-4 rounded-2xl border p-4" style={{ background: OBSIDIAN, borderColor: tint(33) }}>
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 shrink-0 rounded-full border border-white/20" style={{ background: picked.hex }} />
            <h3 className="min-w-0 flex-1 text-lg leading-snug">{name(picked)}</h3>
          </div>
          {picked.mix_audio && (
            <button type="button" onClick={play} className="flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold" style={{ borderColor: GOLD, color: GOLD }}>
              {playing ? '⏸' : '🔊'} {t('strap.listen')}
            </button>
          )}

          <div>
            <div className="mb-1.5 text-xs font-semibold" style={{ color: GOLD }}>{t('strap.mixTitle')}</div>
            <div className="mb-2 flex h-3.5 overflow-hidden rounded-full border border-white/10">
              {picked.parts.map((p) => <span key={p.id} style={{ width: `${(p.parts / total) * (100 - FLEX_PERCENT)}%`, background: p.color_hex ?? '#ccc' }} title={`${p.brand} ${p.name}`} />)}
              <span style={{ width: `${FLEX_PERCENT}%`, background: `repeating-linear-gradient(45deg, ${GOLD}, ${GOLD} 4px, ${tint(55)} 4px, ${tint(55)} 8px)` }} title={t('strap.flex')} />
            </div>
            <ul className="space-y-1.5 text-sm">
              {picked.parts.map((p) => (
                <li key={p.id} className="flex items-center gap-2.5">
                  <span className="h-4 w-4 shrink-0 rounded-full border border-white/20" style={{ background: p.color_hex ?? 'transparent' }} />
                  <span className="min-w-0 flex-1 truncate"><b>{p.brand}</b> {p.name}</span>
                  <span className="shrink-0 font-mono" style={{ color: GOLD }}>{p.parts} {t('paint.part')}</span>
                </li>
              ))}
              <li className="flex items-center gap-2.5">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: GOLD }} />
                <span className="min-w-0 flex-1">{t('strap.flex')}</span>
                <span className="shrink-0 font-mono" style={{ color: GOLD }}>{FLEX_PERCENT}%</span>
              </li>
            </ul>
            <p className="mt-1.5 text-[11px] text-muted">{t('strap.flexNote')}</p>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold" style={{ color: GOLD }}>{t('strap.stepsTitle')}</div>
            <ol className="space-y-2">
              {STEPS.map(([icon, k], i) => (
                <li key={k} className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm leading-snug" style={{ background: CARD, borderColor: LINE }}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold" style={{ background: GOLD, color: ON_GOLD }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">{icon} {t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="rounded-lg bg-review-bg px-3 py-2 text-xs text-review">⚠️ {t('paint.safety')}</p>
        </article>
      )}
    </section>
  );
}
