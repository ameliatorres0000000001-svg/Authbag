import React from 'react';
import { useI18n } from './i18n.tsx';
import type { StepIcon } from '../shared/voiceKeys.ts';

// Simple line illustrations for painting steps (drawn here, so they always load and never show anything made up).
const INK = '#1A1A1A', GOLD = '#C5A059', SOFT = '#EFE6D2';
const Bag = ({ x = 20, y = 30, w = 56, h = 44 }: { x?: number; y?: number; w?: number; h?: number }) => (
  <g fill={SOFT} stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
    <path d={`M${x + w * 0.3} ${y} C${x + w * 0.3} ${y - 16} ${x + w * 0.7} ${y - 16} ${x + w * 0.7} ${y}`} fill="none" />
    <path d={`M${x + 4} ${y} H${x + w - 4} L${x + w} ${y + h} H${x} Z`} />
  </g>
);
const ART: Record<StepIcon, React.ReactNode> = {
  clean: (<><Bag /><g stroke={INK} strokeWidth="2.2" fill="#fff"><rect x="84" y="28" width="16" height="30" rx="3" /><path d="M86 28v-6h8l6 4" fill="none" /></g>
    <g stroke={GOLD} strokeWidth="2" strokeLinecap="round"><path d="M78 22l-6-3M78 27h-7M78 32l-6 3" /></g><path d="M30 60q8-6 16 0t16 0" stroke={GOLD} strokeWidth="2.5" fill="none" /></>),
  sand: (<><Bag /><rect x="62" y="56" width="34" height="16" rx="2" fill={GOLD} stroke={INK} strokeWidth="2" transform="rotate(-12 79 64)" />
    <g fill={INK}>{[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={68 + i * 6} cy={63 - i * 1.2} r="1" />)}</g><path d="M60 82h30M84 78l6 4-6 4M66 78l-6 4 6 4" stroke={INK} strokeWidth="2" fill="none" /></>),
  tape: (<><Bag /><rect x="40" y="38" width="16" height="10" rx="2" fill="#bbb" stroke={INK} strokeWidth="2" /><rect x="30" y="34" width="36" height="18" fill={GOLD} opacity="0.55" stroke={INK} strokeDasharray="3 2" /></>),
  prep: (<><Bag /><g stroke={INK} strokeWidth="2.2" fill="#fff"><path d="M86 30h12v32H86z" /><path d="M89 30v-6h6v6" /></g><circle cx="48" cy="52" r="9" fill="#fff" stroke={GOLD} strokeWidth="2.5" /><path d="M40 52a8 8 0 0 1 16 0" stroke={INK} strokeWidth="1.5" fill="none" /></>),
  thin_coat: (<><Bag /><rect x="64" y="40" width="24" height="16" rx="4" fill={GOLD} stroke={INK} strokeWidth="2.2" transform="rotate(-20 76 48)" />
    <g stroke="#8B5A2B" strokeWidth="2" strokeLinecap="round" opacity="0.8"><path d="M26 64h20M26 58h26M30 52h18" /></g></>),
  dry: (<><Bag x={8} /><g stroke={INK} strokeWidth="2.2" fill="#fff"><path d="M78 36h26a8 8 0 0 1 0 16H78z" /><path d="M92 52l-4 18h8l2-18" /></g>
    <g stroke={GOLD} strokeWidth="2" fill="none" strokeLinecap="round"><path d="M74 38q-4 3 0 6t0 6M68 36q-4 4 0 8t0 8" /></g></>),
  second_coat: (<><Bag /><rect x="64" y="40" width="24" height="16" rx="4" fill={GOLD} stroke={INK} strokeWidth="2.2" transform="rotate(-20 76 48)" />
    <circle cx="96" cy="22" r="11" fill={INK} /><text x="96" y="27" textAnchor="middle" fontSize="14" fontWeight="700" fill={GOLD}>2</text></>),
  edge: (<><path d="M14 40h70l6 30H8z" fill={SOFT} stroke={INK} strokeWidth="2.2" /><path d="M8 70h82" stroke="#8B5A2B" strokeWidth="5" />
    <g stroke={INK} strokeWidth="2.2"><path d="M96 30l-14 34" /><rect x="92" y="18" width="10" height="16" rx="2" fill={GOLD} transform="rotate(22 97 26)" /></g></>),
  finisher: (<><Bag /><g stroke={INK} strokeWidth="2.2" fill="#fff"><path d="M86 30h14v32H86z" /><path d="M90 30v-5h6v5" /></g>
    <g stroke={GOLD} strokeWidth="2" strokeLinecap="round"><path d="M34 44l6-6M42 50l8-8M52 54l6-6" /><path d="M100 14v8M96 18h8" /></g></>),
  wait: (<><circle cx="60" cy="45" r="30" fill="#fff" stroke={INK} strokeWidth="2.5" /><path d="M60 26v19l13 8" stroke={GOLD} strokeWidth="3.5" strokeLinecap="round" fill="none" />
    {[0, 90, 180, 270].map((a) => <path key={a} d="M60 17v5" stroke={INK} strokeWidth="2.5" transform={`rotate(${a} 60 45)`} />)}</>),
  test: (<><Bag /><circle cx="70" cy="66" r="13" fill="#fff" fillOpacity="0.6" stroke={INK} strokeWidth="2.5" /><path d="M80 75l12 10" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    <circle cx="68" cy="68" r="4" fill="#8B5A2B" /></>),
  polish: (<><Bag /><ellipse cx="74" cy="58" rx="14" ry="9" fill="#fff" stroke={INK} strokeWidth="2" /><path d="M58 48a18 14 0 1 1 4 22" stroke={GOLD} strokeWidth="2.5" fill="none" /><path d="M62 70l-6 1 3-5" stroke={GOLD} strokeWidth="2.5" fill="none" /></>),
};

export function StepArt({ icon, className = 'h-full w-full' }: { icon: StepIcon | null; className?: string }) {
  const { t } = useI18n();
  if (!icon) return null;
  return <svg viewBox="0 0 120 90" className={className} role="img" aria-label={t(`art.${icon}`)}>{ART[icon]}</svg>;
}

/** The mixing picture, drawn from the recipe: one spoon per part in each paint's colour, poured into a bowl of the target colour. */
export function MixDiagram({ parts, hex }: { parts: { id: string; brand: string; name: string; color_hex: string | null; parts: number }[]; hex: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {parts.map((p, i) => {
        const whole = Math.floor(p.parts), half = p.parts - whole >= 0.5;
        return (
          <React.Fragment key={p.id}>
            {i > 0 && <span className="text-2xl font-bold text-muted">+</span>}
            <div className="flex flex-col items-center gap-1">
              <div className="flex max-w-[150px] flex-wrap justify-center gap-1">
                {Array.from({ length: Math.min(whole, 12) }, (_, k) => <Spoon key={k} color={p.color_hex ?? '#999'} />)}
                {half && <Spoon color={p.color_hex ?? '#999'} half />}
              </div>
              <span className="rounded-full bg-charcoal px-2.5 py-0.5 font-mono text-sm text-gold">× {p.parts}</span>
              <span className="max-w-[120px] truncate text-center text-[11px]"><b>{p.brand}</b> {p.name}</span>
            </div>
          </React.Fragment>
        );
      })}
      <span className="text-2xl text-muted" aria-hidden>→</span>
      <div className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 80 50" className="h-16 w-24" aria-hidden><path d="M4 14h72a36 30 0 0 1-72 0z" fill={hex} stroke={INK} strokeWidth="2.5" /><ellipse cx="40" cy="14" rx="36" ry="6" fill={hex} stroke={INK} strokeWidth="2" /></svg>
        <span className="text-[11px] font-semibold">{t('steps.mix')}</span>
      </div>
    </div>
  );
}

const Spoon = ({ color, half }: { color: string; half?: boolean }) => (
  <svg viewBox="0 0 24 40" className="h-9 w-5" aria-hidden>
    <ellipse cx="12" cy="10" rx="9" ry="9" fill="#fff" stroke={INK} strokeWidth="1.8" />
    <path d={half ? 'M3 10a9 9 0 0 0 18 0z' : 'M12 1a9 9 0 1 1 0 18a9 9 0 1 1 0-18z'} fill={color} />
    <path d="M12 19v19" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
