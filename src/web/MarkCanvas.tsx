import React, { useRef, useState } from 'react';
import { useI18n } from './i18n.tsx';
import { cropBox, rectFromDrag, type Rect } from '../shared/marks.ts';
import { Badge, Notice } from './ui.tsx';
import LensViewer from './LensViewer.tsx';

export interface Mark extends Rect { id: string; label: string; note?: string | null; source: 'appraiser' | 'ai_suggested' }

interface Props {
  src: string;
  marks: Mark[];
  locked: boolean;
  aiConfigured: boolean;
  busy: boolean;
  onAdd: (r: Rect, label: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSuggest: () => Promise<void>;
}

/**
 * One photo with numbered analysis boxes drawn on it, plus a zoomed crop of each box below.
 * Boxes are annotations only; they never feed the rules engine.
 */
export default function MarkCanvas({ src, marks, locked, aiConfigured, busy, onAdd, onDelete, onSuggest }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [label, setLabel] = useState('');
  const [open, setOpen] = useState<string | null>(null); // mark shown in the lens viewer
  const [size, setSize] = useState<{ w: number; h: number } | null>(null); // natural size, for undistorted crops

  const at = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
  };
  const down = (e: React.PointerEvent) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = at(e); setDraft(null);
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = at(e);
    setDraft(rectFromDrag(start.current.x, start.current.y, p.x, p.y));
  };
  const up = () => { start.current = null; };

  async function save() {
    if (!draft || !label.trim()) return;
    await onAdd(draft, label.trim());
    setDraft(null); setLabel('');
  }

  const pct = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{t('scan.analysisHelp')}</p>
      <div ref={box} className="relative touch-none select-none overflow-hidden rounded-lg border border-hairline bg-charcoal"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img src={src} alt="" draggable={false} className="block h-auto w-full" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
        {marks.map((m, i) => (
          <div key={m.id} className={`pointer-events-none absolute border-2 ${m.source === 'ai_suggested' ? 'border-dashed border-white' : 'border-gold'}`} style={pct(m)}>
            <span className="absolute -left-0.5 -top-5 rounded bg-charcoal px-1.5 font-mono text-[10px] text-white">{i + 1}</span>
          </div>
        ))}
        {draft && <div className="pointer-events-none absolute border-2 border-gold bg-gold/20" style={pct(draft)} />}
      </div>

      {draft && !locked && (
        <div className="flex gap-2">
          <input className="input" autoFocus value={label} maxLength={80} placeholder={t('scan.pointLabel')} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={busy || !label.trim()} onClick={save}>{t('scan.addPoint')}</button>
        </div>
      )}

      {!locked && (aiConfigured
        ? <div className="space-y-1"><button className="btn-ghost w-full" disabled={busy} onClick={onSuggest}>{busy ? '…' : t('scan.aiPoints')}</button><p className="text-[11px] text-muted">{t('scan.aiNote')}</p></div>
        : <Notice>{t('scan.aiOff')}</Notice>)}

      {marks.length === 0 ? <p className="text-sm text-muted">{t('scan.noPoints')}</p> : (
        <div className="grid grid-cols-2 gap-3">
          {marks.map((m, i) => {
            const c = size ? cropBox(m, size.w, size.h) : null;
            return (
            <figure key={m.id} className={`overflow-hidden rounded-lg border bg-surface-card ${open === m.id ? 'border-gold ring-1 ring-gold' : 'border-hairline'}`}>
              <button type="button" className="flex w-full items-center justify-center bg-charcoal" style={{ aspectRatio: '1 / 1' }} onClick={() => setOpen(open === m.id ? null : m.id)}>
                {c && <div className={`relative overflow-hidden ${m.w * size!.w >= m.h * size!.h ? 'w-full' : 'h-full'}`} style={{ aspectRatio: c.aspectRatio }}>
                  <img src={src} alt="" draggable={false} className="absolute max-w-none" style={c.img} />
                </div>}
              </button>
              <figcaption className="space-y-1 p-2">
                <div className="flex items-start gap-1 text-xs font-semibold"><span className="font-mono text-muted">{i + 1}.</span><span className="flex-1">{m.label}</span></div>
                <div className="flex items-center justify-between gap-1">
                  {m.source === 'ai_suggested' ? <Badge tone="info">{t('scan.aiPointBadge')}</Badge> : <span />}
                  {!locked && <button className="text-[11px] text-counterfeit underline" disabled={busy} onClick={() => onDelete(m.id)}>{t('scan.delete')}</button>}
                </div>
              </figcaption>
            </figure>
            );
          })}
        </div>
      )}
      {marks.length > 0 && (() => {
        const i = marks.findIndex((m) => m.id === open);
        return i < 0 ? <p className="text-xs text-muted">{t('lens.tap')}</p> : <LensViewer src={src} rect={marks[i]} title={`${i + 1}. ${marks[i].label}`} />;
      })()}
    </div>
  );
}
