// Shared domain types. Pure TypeScript, no runtime dependencies (runs in Worker, browser and Node tests).

export type Outcome =
  | 'insufficient_evidence'
  | 'requires_expert_review'
  | 'concerns_found'
  | 'consistent_with_references';

export type Polarity = 'authentic_indicator' | 'concern_indicator';
export type Severity = 'major' | 'minor' | 'info';
export type RuleStatus = 'draft' | 'pending_review' | 'approved' | 'retired';
/** 'ai_suggested' observations NEVER count toward an outcome until an appraiser confirms them ('ai_confirmed'). */
export type ObsSource = 'appraiser' | 'ai_suggested' | 'ai_confirmed' | 'system';

export type Primitive = string | number | boolean;
export type Check =
  | { type: 'in'; values: Primitive[] }
  | { type: 'equals'; value: Primitive }
  | { type: 'range'; min?: number; max?: number }
  | { type: 'regex'; pattern: string }
  | { type: 'present' };

export interface Rule {
  id: string;
  code: string;
  version: number;
  brandId: string;
  modelId: string | null;
  eraId: string | null;
  componentCode: string;
  observationKey: string;
  check: Check;
  polarity: Polarity;
  severity: Severity;
  required: boolean;
  status: RuleStatus;
  titleEn: string;
  titleKm: string;
}

export interface Observation {
  key: string;
  value: unknown;
  source: ObsSource;
  createdAt: string; // ISO
}

export interface CaptureTemplate { code: string; required: boolean }
export interface CaptureRef { templateCode: string }

export interface DateCodeExtraction {
  factoryGroup: number;
  periodGroups: [number, number];
  yearGroups: [number, number];
  periodUnit: 'week' | 'month' | 'unconfirmed';
  /** two-digit year >= pivot → 1900+yy, otherwise 2000+yy. Use 100 for "always 2000s". */
  yearPivot: number;
}
export interface DateCodeFormat {
  id: string; name: string; startYear: number | null; endYear: number | null;
  pattern: string; extraction: DateCodeExtraction; status: 'draft' | 'approved' | 'retired';
}
export interface FactoryCode { code: string; country: string | null; location: string | null; status: 'draft' | 'approved' | 'retired' }

export interface DateCodeCandidate {
  formatId: string; formatName: string; formatStatus: DateCodeFormat['status'];
  factory: string; factoryKnown: boolean; factoryStatus: FactoryCode['status'] | null; country: string | null;
  period: number; periodUnit: DateCodeExtraction['periodUnit']; year: number; yearInFormatRange: boolean;
}
export type DateCodeState = 'consistent' | 'inconsistent' | 'unknown';
export interface DateCodeResult {
  raw: string; normalized: string; candidates: DateCodeCandidate[];
  /** true only when an APPROVED format and APPROVED factory code were used. Draft tables are shown, never counted. */
  usable: boolean;
  state: DateCodeState;
  reason: string;
}

export type ReasonCode =
  | 'NO_APPROVED_RULES'
  | 'MAJOR_CONCERN'
  | 'CONFLICTING_SIGNALS'
  | 'DATECODE_MISMATCH'
  | 'MISSING_REQUIRED_CAPTURES'
  | 'MISSING_REQUIRED_OBSERVATIONS'
  | 'MINOR_CONCERN'
  | 'UNSUPPORTED_REQUIRED_FEATURE'
  | 'INSUFFICIENT_SUPPORT'
  | 'SUFFICIENT_SUPPORT';

export interface RuleResult {
  ruleId: string; code: string; titleEn: string; titleKm: string; componentCode?: string;
  polarity: Polarity; severity: Severity; required: boolean;
  state: 'triggered' | 'supported' | 'not_matched' | 'unassessed';
  observed?: unknown;
  /** false for draft / pending rules: shown as unverified hints, never used in the outcome. */
  counted: boolean;
}

export interface EvalInput {
  brandId: string; modelId: string; eraId: string | null;
  rules: Rule[]; observations: Observation[];
  captures: CaptureRef[]; templates: CaptureTemplate[];
  minAuthenticSupports: number;
  datecode?: DateCodeResult | null;
}

export interface EvalResult {
  engineVersion: string;
  outcome: Outcome;
  reasons: { code: ReasonCode; detail?: string }[];
  ruleResults: RuleResult[];      // counted (approved) rules
  hints: RuleResult[];            // draft/pending rules: informational only
  missingCaptures: string[];
  missingRequiredObservations: string[];
  pendingAiObservations: string[]; // keys with only ai_suggested values (need appraiser confirmation)
  datecode: DateCodeResult | null;
  /** Always true. The engine never issues a certificate; a named human must sign off. */
  humanSignoffRequired: true;
  isCertificate: false;
}
