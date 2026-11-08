import React from 'react';
import { useI18n } from './i18n.tsx';

export interface Point { id: string; x: number; y: number; w: number; h: number; label: string; note?: string | null; source?: string; i18n_json?: string | null }

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
  const { locale } = useI18n();
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
        <div className={fit ? 'relative inline-block max-w-full' : 'relative w-full'}>
        <img src={src} alt="" draggable={false} className={`block h-auto max-w-full select-none ${fit ? 'max-h-[56vh] w-auto' : 'w-full'}`} />
        {points.map((p, i) => {
          const on = active === i;
          return (
            // without onPick the boxes are only drawn (e.g. inside a link that opens the album)
            React.createElement(onPick ? 'button' : 'span', {
              key: p.id, ...(onPick ? { type: 'button', onClick: () => onPick(i), 'aria-label': `${i + 1}. ${localizePoint(p, locale).label}` } : { 'aria-hidden': true }),
              className: `absolute rounded-sm border-2 transition ${onPick ? '' : 'pointer-events-none'} ${p.source === 'ai_suggested' ? 'border-dashed' : ''} ${on ? 'border-gold bg-gold/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' : 'border-white/85 hover:border-gold'}`,
              style: { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%`, zIndex: on ? 2 : 1 },
            }, <span className={`absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${on ? 'border-gold bg-gold text-charcoal' : 'border-white bg-gold text-charcoal'}`}>{i + 1}</span>)
          );
        })}
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
 * Numbered point cards matching the boxes: the detail's name, one line on what to check (🔍),
 * and one line on what this photo shows (📷) — short and easy to remember.
 */
export function PointCards({ points, active, onPick, empty }: { points: Point[]; active?: number | null; onPick?: (i: number) => void; empty: string }) {
  const { locale, t } = useI18n();
  if (points.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ol className="space-y-2">
      {points.map((p, i) => {
        const tx = localizePoint(p, locale);
        const n = splitNote(tx.note);
        const on = active === i;
        return (
          <li key={p.id}>
            <button type="button" onClick={() => onPick?.(i)}
              className={`flex w-full gap-3 rounded-xl border px-3 py-2.5 text-left transition ${on ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'}`}>
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold ${on ? 'bg-gold text-charcoal' : 'bg-gold text-charcoal'}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug">{tx.label}</span>
                {n.check && (
                  <span className="mt-1 flex gap-1.5 text-[13.5px] leading-snug">
                    <span aria-hidden>🔍</span><span><span className="sr-only">{t('pt.check')}: </span>{n.check}</span>
                  </span>
                )}
                {n.photo && (
                  <span className="mt-1 flex gap-1.5 rounded-md bg-surface-low px-2 py-1 text-[13px] leading-snug text-muted">
                    <span aria-hidden>📷</span><span><span className="font-semibold text-ink">{t('pt.photo')}</span> {n.photo}</span>
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
