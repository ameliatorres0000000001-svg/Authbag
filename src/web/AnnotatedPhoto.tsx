import React from 'react';
import { useI18n } from './i18n.tsx';
import { guideFor } from '../shared/pointGuide.ts';

export interface Point { id: string; x: number; y: number; w: number; h: number; label: string; note?: string | null; source?: string; i18n_json?: string | null; guide_json?: string | null }

/** The point's label and note in the viewer's language: Khmer for KH, English otherwise; the original text if no translation. */
export function localizePoint(p: Point, locale: string): { label: string; note: string | null } {
  try {
    const all = p.i18n_json ? JSON.parse(p.i18n_json) : null;
    const v = all?.[locale === 'km' ? 'km' : 'en'];
    if (v?.label) return { label: v.label, note: v.note ?? null };
  } catch { /* fall through */ }
  return { label: p.label, note: p.note ?? null };
}

/**
 * A photo with numbered "look here" boxes, framed like a lab viewer: a dark caption bar on top,
 * an optional footer bar. Tapping a number calls onPick. Teaching only.
 */
export default function AnnotatedPhoto({ src, points, active, onPick, tone = 'neutral', caption, sub, footer, className = '', fit }: {
  src: string; points: Point[]; active?: number | null; onPick?: (i: number) => void;
  tone?: 'genuine' | 'counterfeit' | 'neutral'; caption?: React.ReactNode; sub?: React.ReactNode; footer?: React.ReactNode; className?: string;
  /** limit the photo to ~56% of the screen height (feed) instead of full width */
  fit?: boolean;
}) {
  const { locale, t } = useI18n();
  const act = active != null && points[active] ? points[active] : null;
  // the tooltip: the AI guide when there is one, else the point's own label and first line
  const guide = act ? guideFor(act.guide_json, locale) ?? (() => { const l = localizePoint(act, locale); const n = splitNote(l.note);
    return { title: l.label, popup: n.check || n.photo || '', look_at: '', match: '', differs: '' }; })() : null;
  const dot = { genuine: 'bg-verified', counterfeit: 'bg-counterfeit', neutral: 'bg-gold' }[tone];
  return (
    <figure className={`overflow-hidden rounded-xl border border-hairline bg-surface-card ${className}`}>
{caption != null && (<figcaption className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-serif text-base leading-tight"><span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />{caption}</div>
          {sub && <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted">{sub}</div>}
        </div>
      </figcaption>)}
      <div className="flex justify-center overflow-hidden bg-charcoal">
        {/* wrapper is exactly the image size, so % boxes line up; the photo stays a readable size on phones */}
        <div className={fit ? 'relative inline-block max-w-full' : 'relative w-full'} onClick={onPick ? () => onPick(-1) : undefined}>
        <img src={src} alt="" draggable={false} className={`block h-auto max-w-full select-none ${fit ? 'max-h-[56vh] w-auto' : 'w-full'}`} />
        {points.map((p, i) => {
          const on = active === i;
          return (
            // without onPick the boxes are only drawn (e.g. inside a link that opens the album)
            React.createElement(onPick ? 'button' : 'span', {
              key: p.id, ...(onPick ? { type: 'button', onClick: (e: React.MouseEvent) => { e.stopPropagation(); onPick(i); }, 'aria-label': `${i + 1}. ${localizePoint(p, locale).label}` } : { 'aria-hidden': true }),
              className: `absolute rounded-sm border-2 transition ${onPick ? '' : 'pointer-events-none'} ${p.source === 'ai_suggested' ? 'border-dashed' : ''} ${on ? 'border-gold bg-gold/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' : 'border-white/85 hover:border-gold'}`,
              style: { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%`, zIndex: on ? 2 : 1 },
            }, <span className={`absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${on ? 'border-gold bg-gold text-charcoal' : 'border-white bg-gold text-charcoal'}`}>{i + 1}</span>)
          );
        })}
        {/* tapped box with an AI guide: a short dark tooltip with a gold frame, right above (or below) the box */}
        {act && guide && onPick && (() => {
          const cx = act.x + act.w / 2, above = act.y > 0.22;
          const pos: React.CSSProperties = cx < 0.3 ? { left: `${Math.max(1, act.x * 100)}%` } : cx > 0.7 ? { right: `${Math.max(1, (1 - act.x - act.w) * 100)}%` } : { left: `${cx * 100}%`, transform: 'translateX(-50%)' };
          return (
            <div role="tooltip" className="pointer-events-none absolute z-10 w-max max-w-[72%] rounded-xl border border-gold/80 bg-black/80 px-3 py-2 text-[13px] leading-snug text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm"
              style={{ ...pos, ...(above ? { bottom: `${(1 - act.y) * 100 + 1.5}%` } : { top: `${(act.y + act.h) * 100 + 1.5}%` }) }}>
              <span className={`block text-[12px] font-semibold text-gold ${guide.popup ? 'mb-0.5' : ''}`}>{(active ?? 0) + 1}. {guide.title}</span>{guide.popup}
            </div>
          );
        })()}
        </div>
      </div>
      {footer && <div className="flex items-center justify-between gap-2 bg-charcoal px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/80">{footer}</div>}
    </figure>
  );
}

const PHOTO_LINE = /^(in this photo|ក្នុងរូបនេះ|trong ảnh này|ในภาพนี้|di foto ini)\s*[:៖]\s*/i;

/** Split a teaching note into "what to check" and "in this photo" (the AI writes them on two lines). */
export function splitNote(note: string | null): { check: string; photo: string | null } {
  if (!note) return { check: '', photo: null };
  const lines = note.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const i = lines.findIndex((l) => PHOTO_LINE.test(l));
  if (i < 0) return { check: lines.join(' '), photo: null };
  return { check: lines.filter((_, j) => j !== i).join(' '), photo: lines[i].replace(PHOTO_LINE, '') };
}

/**
 * Numbered point cards matching the boxes: the detail's name, then 🔍 where to look, ✅ what the original shows and
 * ⚠️ the common red flag (from the AI guide); before a guide exists, the point's own "what to check" line.
 */
export function PointCards({ points, active, onPick, empty }: { points: Point[]; active?: number | null; onPick?: (i: number) => void; empty: string }) {
  const { locale, t } = useI18n();
  if (points.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ol className="space-y-2">
      {points.map((p, i) => {
        const tx = localizePoint(p, locale);
        const n = splitNote(tx.note);
        const g = guideFor(p.guide_json, locale);
        const on = active === i;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onPick?.(i)}
              className={`flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'}`}>
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${on ? 'bg-gold text-charcoal' : 'bg-gold text-charcoal'}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">{g?.title || tx.label}</span>
                {g ? (
                  <span className="mt-1 block space-y-1 text-[13.5px] leading-snug">
                    {g.look_at && <span className="flex gap-1.5"><span aria-hidden>🔍</span><span><b>{t('pg.look')}</b> {g.look_at}</span></span>}
                    {g.match && <span className="flex gap-1.5"><span aria-hidden>✅</span><span><b className="text-verified">{t('pg.match')}</b> {g.match}</span></span>}
                    {g.differs && <span className="flex gap-1.5"><span aria-hidden>⚠️</span><span><b className="text-review">{t('pg.differs')}</b> {g.differs}</span></span>}
                  </span>
                ) : n.check ? (
                  <span className="mt-1 flex gap-1.5 text-[13.5px] leading-snug">
                    <span aria-hidden>🔍</span><span><span className="sr-only">{t('pt.check')}: </span>{n.check}</span>
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
