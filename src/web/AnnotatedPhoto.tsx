import React from 'react';

export interface Point { id: string; x: number; y: number; w: number; h: number; label: string; note?: string | null; source?: string }

/**
 * A photo with numbered "look here" boxes, framed like a lab viewer: a dark caption bar on top,
 * an optional footer bar. Tapping a number calls onPick. Teaching only.
 */
export default function AnnotatedPhoto({ src, points, active, onPick, tone = 'neutral', caption, sub, footer, className = '' }: {
  src: string; points: Point[]; active?: number | null; onPick?: (i: number) => void;
  tone?: 'genuine' | 'counterfeit' | 'neutral'; caption?: React.ReactNode; sub?: React.ReactNode; footer?: React.ReactNode; className?: string;
}) {
  const dot = { genuine: 'bg-verified', counterfeit: 'bg-counterfeit', neutral: 'bg-gold' }[tone];
  return (
    <figure className={`overflow-hidden rounded-xl border border-hairline bg-surface-card ${className}`}>
{caption != null && (<figcaption className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-serif text-base leading-tight"><span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />{caption}</div>
          {sub && <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted">{sub}</div>}
        </div>
      </figcaption>)}
      <div className="relative overflow-hidden bg-charcoal">
        <img src={src} alt="" draggable={false} className="block h-auto w-full select-none" />
        {points.map((p, i) => {
          const on = active === i;
          return (
            <button key={p.id} type="button" onClick={() => onPick?.(i)} aria-label={`${i + 1}. ${p.label}`}
              className={`absolute rounded-sm border-2 transition ${p.source === 'ai_suggested' ? 'border-dashed' : ''} ${on ? 'border-gold bg-gold/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]' : 'border-white/85 hover:border-gold'}`}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%`, zIndex: on ? 2 : 1 }}>
              <span className={`absolute -left-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${on ? 'border-gold bg-gold text-charcoal' : 'border-white bg-charcoal text-white'}`}>{i + 1}</span>
            </button>
          );
        })}
      </div>
      {footer && <div className="flex items-center justify-between gap-2 bg-charcoal px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/80">{footer}</div>}
    </figure>
  );
}

/** Numbered cards matching the boxes on an AnnotatedPhoto. */
export function PointCards({ points, active, onPick, empty }: { points: Point[]; active?: number | null; onPick?: (i: number) => void; empty: string }) {
  if (points.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {points.map((p, i) => (
        <button key={p.id} type="button" onClick={() => onPick?.(i)}
          className={`rounded-lg border px-3 py-2 text-left transition ${active === i ? 'border-gold bg-gold-light' : 'border-hairline bg-surface-card hover:border-strong'}`}>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-semibold text-gold">{String(i + 1).padStart(2, '0')}</span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider">{p.label}</span>
          </div>
          {p.note && <p className="mt-1 text-sm leading-snug">{p.note}</p>}
        </button>
      ))}
    </div>
  );
}
