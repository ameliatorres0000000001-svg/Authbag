// Pure auto-capture gate. The camera loop feeds per-frame metrics measured INSIDE the guide frame;
// the gate says "ready" only after N consecutive frames that are sharp, well exposed and steady.
// It does not recognise objects: it only decides when a photo is good enough to keep.
export interface FrameMetrics { sharpness: number; brightness: number; motion: number }
export interface GateOptions { needFrames: number; minSharpness: number; minBrightness: number; maxBrightness: number; maxMotion: number }
export type GateHint = 'ok' | 'blurry' | 'too_dark' | 'too_bright' | 'hold_still';
export interface GateState { ready: boolean; progress: number; hint: GateHint }

export const DEFAULT_GATE: GateOptions = { needFrames: 8, minSharpness: 60, minBrightness: 60, maxBrightness: 215, maxMotion: 6 };

export function createGate(opts: Partial<GateOptions> = {}) {
  const o = { ...DEFAULT_GATE, ...opts };
  let good = 0;
  return {
    push(m: FrameMetrics): GateState {
      let hint: GateHint = 'ok';
      if (m.brightness < o.minBrightness) hint = 'too_dark';
      else if (m.brightness > o.maxBrightness) hint = 'too_bright';
      else if (m.motion > o.maxMotion) hint = 'hold_still';
      else if (m.sharpness < o.minSharpness) hint = 'blurry';
      good = hint === 'ok' ? good + 1 : 0;
      return { ready: good >= o.needFrames, progress: Math.min(1, good / o.needFrames), hint };
    },
    reset() { good = 0; },
  };
}
