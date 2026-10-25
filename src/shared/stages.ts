// Guided verification stages: a VIEW over the engine's evaluation, grouped by component.
// It never decides authenticity. The engine outcome + a named human sign-off remain authoritative.
import type { RuleResult } from './types.ts';

export type StageStatus = 'pending' | 'insufficient' | 'concern' | 'consistent';

export interface StageTemplate { code: string; componentCode: string | null; required: boolean; labelEn?: string; labelKm?: string }
export interface Stage {
  component: string;               // component code, or 'general'
  templates: StageTemplate[];
  missingRequired: string[];       // template codes still without a photo
  status: StageStatus;
  triggered: RuleResult[];         // counted concern rules that fired
  supported: RuleResult[];         // counted authentic-indicator rules that matched
}

export function buildStages(templates: StageTemplate[], captured: Set<string> | string[], ruleResults: RuleResult[]): Stage[] {
  const have = captured instanceof Set ? captured : new Set(captured);
  const order: string[] = [];
  const byComp = new Map<string, StageTemplate[]>();
  for (const t of templates) {
    const k = t.componentCode ?? 'general';
    if (!byComp.has(k)) { byComp.set(k, []); order.push(k); }
    byComp.get(k)!.push(t);
  }
  return order.map((component) => {
    const ts = byComp.get(component)!;
    const missingRequired = ts.filter((t) => t.required && !have.has(t.code)).map((t) => t.code);
    const counted = ruleResults.filter((r) => r.counted && (r.componentCode ?? 'general') === component);
    const triggered = counted.filter((r) => r.state === 'triggered');
    const supported = counted.filter((r) => r.state === 'supported');
    const requiredUnassessed = counted.some((r) => r.required && r.state === 'unassessed');
    let status: StageStatus;
    if (missingRequired.length > 0) status = 'pending';
    else if (triggered.length > 0) status = 'concern';        // a concern never needs the other stages to finish first
    else if (supported.length > 0 && !requiredUnassessed) status = 'consistent';
    else status = 'insufficient';                              // photos taken but no approved rule could assess them
    return { component, templates: ts, missingRequired, status, triggered, supported };
  });
}

export interface StageSummary { readyForSignoff: boolean; concerns: string[]; pending: string[]; insufficient: string[] }

/** "Ready for sign-off" only when EVERY stage is consistent. This is still not a certificate. */
export function summarizeStages(stages: Stage[]): StageSummary {
  const pick = (s: StageStatus) => stages.filter((x) => x.status === s).map((x) => x.component);
  return {
    readyForSignoff: stages.length > 0 && stages.every((s) => s.status === 'consistent'),
    concerns: pick('concern'), pending: pick('pending'), insufficient: pick('insufficient'),
  };
}
