// "What data does each model × year still need?" — answers the owner's question with a computed, honest checklist.

export type ReadinessLevel =
  | 'L0_no_approved_era'
  | 'L1_checklist_only'
  | 'L2_rules_ready'
  | 'L3_retrieval_ready'
  | 'L4_finetune_ready';

export interface CoverageThresholds {
  minApprovedRules: number;          // default 3
  retrievalMinAuthentic: number;     // default 5
  finetuneMinAuthentic: number;      // default 30
  finetuneMinCounterfeit: number;    // default 10
}

export interface CoverageEra {
  eraId: string; eraName: string; eraStatus: 'DRAFT' | 'APPROVED' | 'RETIRED';
  identifierType: 'NONE' | 'DATE_CODE' | 'RFID_MICROCHIP' | 'SERIAL' | 'BLIND_STAMP' | 'UNKNOWN';
  approvedRules: number;             // approved rules that apply (brand-wide + model + era)
  approvedAuthenticAssets: number;
  approvedCounterfeitAssets: number;
  approvedDateCodeFormats: number;   // only relevant when identifierType = DATE_CODE
}

export type Need =
  | { need: 'approved_era' }
  | { need: 'identifier_defined' }
  | { need: 'date_code_format_approved' }
  | { need: 'approved_rules'; have: number; want: number }
  | { need: 'authentic_assets'; have: number; want: number }
  | { need: 'counterfeit_assets'; have: number; want: number };

export interface CoverageRow {
  eraId: string | null; eraName: string | null; level: ReadinessLevel; needs: Need[];
}

export function coverageForModel(eras: CoverageEra[], t: CoverageThresholds): CoverageRow[] {
  const live = eras.filter((e) => e.eraStatus !== 'RETIRED');
  if (!live.some((e) => e.eraStatus === 'APPROVED')) {
    return [{ eraId: null, eraName: null, level: 'L0_no_approved_era', needs: [{ need: 'approved_era' }] }];
  }
  return live.filter((e) => e.eraStatus === 'APPROVED').map((e) => {
    const needs: Need[] = [];
    if (e.identifierType === 'UNKNOWN') needs.push({ need: 'identifier_defined' });
    if (e.identifierType === 'DATE_CODE' && e.approvedDateCodeFormats === 0) needs.push({ need: 'date_code_format_approved' });
    if (e.approvedRules < t.minApprovedRules) needs.push({ need: 'approved_rules', have: e.approvedRules, want: t.minApprovedRules });
    if (e.approvedAuthenticAssets < t.retrievalMinAuthentic) needs.push({ need: 'authentic_assets', have: e.approvedAuthenticAssets, want: t.retrievalMinAuthentic });
    let level: ReadinessLevel = 'L1_checklist_only';
    if (e.approvedRules >= t.minApprovedRules) level = 'L2_rules_ready';
    if (level === 'L2_rules_ready' && e.approvedAuthenticAssets >= t.retrievalMinAuthentic) level = 'L3_retrieval_ready';
    if (level === 'L3_retrieval_ready' && e.approvedAuthenticAssets >= t.finetuneMinAuthentic && e.approvedCounterfeitAssets >= t.finetuneMinCounterfeit) level = 'L4_finetune_ready';
    if (level === 'L3_retrieval_ready') {
      if (e.approvedAuthenticAssets < t.finetuneMinAuthentic) needs.push({ need: 'authentic_assets', have: e.approvedAuthenticAssets, want: t.finetuneMinAuthentic });
      if (e.approvedCounterfeitAssets < t.finetuneMinCounterfeit) needs.push({ need: 'counterfeit_assets', have: e.approvedCounterfeitAssets, want: t.finetuneMinCounterfeit });
    }
    return { eraId: e.eraId, eraName: e.eraName, level, needs };
  });
}
