import React, { createContext, useContext, useMemo, useState } from 'react';

export type Locale = 'km' | 'en';

const D: Record<string, { km: string; en: string }> = {
  appName: { km: 'HENGZ AUTHENTIC', en: 'HENGZ AUTHENTIC' },
  dashboard: { km: 'ផ្ទាំងដើម', en: 'Dashboard' },
  newInspection: { km: 'ការត្រួតពិនិត្យថ្មី', en: 'New inspection' },
  inspections: { km: 'ការត្រួតពិនិត្យ', en: 'Inspections' },
  knowledge: { km: 'ចំណេះដឹង និងច្បាប់', en: 'Knowledge & rules' },
  coverage: { km: 'ភាពគ្រប់គ្រាន់នៃទិន្នន័យ', en: 'Data coverage' },
  library: { km: 'បណ្ណាល័យ reference', en: 'Reference library' },
  providers: { km: 'អ្នកផ្តល់សេវាផ្ទៀងផ្ទាត់', en: 'Verification providers' },
  certificates: { km: 'វិញ្ញាបនបត្រ', en: 'Certificates' },
  audit: { km: 'កំណត់ហេតុសវនកម្ម', en: 'Audit log' },
  settings: { km: 'ការកំណត់', en: 'Settings' },
  signIn: { km: 'ចូលប្រើ', en: 'Sign in' },
  signOut: { km: 'ចាកចេញ', en: 'Sign out' },
  email: { km: 'អ៊ីមែល', en: 'Email' },
  password: { km: 'ពាក្យសម្ងាត់ (យ៉ាងតិច 12 តួ)', en: 'Password (min 12 characters)' },
  name: { km: 'ឈ្មោះ', en: 'Name' },
  createOwner: { km: 'បង្កើតគណនីម្ចាស់ (ដំបូង)', en: 'Create owner account (first run)' },
  save: { km: 'រក្សាទុក', en: 'Save' },
  create: { km: 'បង្កើត', en: 'Create' },
  cancel: { km: 'បោះបង់', en: 'Cancel' },
  approve: { km: 'អនុម័ត', en: 'Approve' },
  reject: { km: 'បដិសេធ', en: 'Reject' },
  submitReview: { km: 'ដាក់ស្នើពិនិត្យ', en: 'Submit for review' },
  brand: { km: 'ម៉ាក', en: 'Brand' },
  model: { km: 'ម៉ូដែល', en: 'Model' },
  claimedYear: { km: 'ឆ្នាំដែលអះអាង', en: 'Claimed year' },
  itemRef: { km: 'លេខយោងទំនិញ', en: 'Item reference' },
  status: { km: 'ស្ថានភាព', en: 'Status' },
  outcome: { km: 'លទ្ធផល', en: 'Outcome' },
  evaluate: { km: 'វាយតម្លៃតាមច្បាប់', en: 'Evaluate against rules' },
  signoff: { km: 'ចុះហត្ថលេខាអ្នកជំនាញ', en: 'Expert sign-off' },
  signoffNote: { km: 'កំណត់ចំណាំអ្នកជំនាញ (យ៉ាងតិច 10 តួ)', en: 'Expert note (min 10 chars)' },
  capture: { km: 'ថតរូប', en: 'Capture' },
  required: { km: 'ចាំបាច់', en: 'required' },
  optional: { km: 'ស្រេចចិត្ត', en: 'optional' },
  uploaded: { km: 'បានផ្ទុកឡើង', en: 'uploaded' },
  observations: { km: 'ការសង្កេត', en: 'Observations' },
  aiSuggest: { km: 'ឲ្យ AI ស្នើការសង្កេត', en: 'Ask AI for observation suggestions' },
  aiPending: { km: 'ការស្នើរបស់ AI (មិនទាន់រាប់ជាភស្តុតាង)', en: 'AI suggestions (not counted until confirmed)' },
  confirm: { km: 'បញ្ជាក់', en: 'Confirm' },
  hints: { km: 'ព័ត៌មានណែនាំ (ច្បាប់ draft — មិនបានអនុម័ត មិនប៉ះពាល់លទ្ធផល)', en: 'Hints (draft rules — unapproved, do not affect the outcome)' },
  countedRules: { km: 'ច្បាប់ដែលបានអនុម័ត (ប៉ះពាល់លទ្ធផល)', en: 'Approved rules (affect the outcome)' },
  notCertificate: { km: 'លទ្ធផលនេះមិនមែនជាវិញ្ញាបនបត្រទេ។ ត្រូវការការចុះហត្ថលេខាពីអ្នកជំនាញដែលមានឈ្មោះ។ AI មិនសម្រេចថា ពិត ឬ ក្លែង។', en: 'This result is not a certificate. A named expert must sign off. AI never decides authentic vs counterfeit.' },
  missingCaptures: { km: 'រូបភាពចាំបាច់ដែលខ្វះ', en: 'Missing required photos' },
  qualityWarn: { km: 'ព្រមានគុណភាពរូបភាព', en: 'Image quality warning' },
  noData: { km: 'មិនទាន់មានទិន្នន័យ', en: 'No data yet' },
  language: { km: 'ភាសា', en: 'Language' },
  secretPresent: { km: 'secret មាន', en: 'secret present' },
  secretMissing: { km: 'secret មិនទាន់កំណត់', en: 'secret not set' },
  testConnection: { km: 'សាកល្បងការតភ្ជាប់ (ពិតប្រាកដ)', en: 'Test connection (real call)' },
  verifyChain: { km: 'ផ្ទៀងផ្ទាត់ខ្សែសង្វាក់', en: 'Verify chain' },
  // outcomes
  'outcome.insufficient_evidence': { km: 'ភស្តុតាងមិនគ្រប់គ្រាន់', en: 'Insufficient evidence' },
  'outcome.requires_expert_review': { km: 'ត្រូវការអ្នកជំនាញពិនិត្យ', en: 'Requires expert review' },
  'outcome.concerns_found': { km: 'រកឃើញចំណុចគួរឱ្យកត់សម្គាល់', en: 'Concerns found' },
  'outcome.consistent_with_references': { km: 'ស្របនឹង reference', en: 'Consistent with references' },
  // reasons
  'reason.NO_APPROVED_RULES': { km: 'មិនទាន់មានច្បាប់ដែលបានអនុម័តសម្រាប់ម៉ាក/ម៉ូដែល/ឆ្នាំនេះ', en: 'No approved rule applies to this brand/model/era yet' },
  'reason.MAJOR_CONCERN': { km: 'ច្បាប់ធ្ងន់ធ្ងរមួយត្រូវបានបំពេញ', en: 'A major concern rule was triggered' },
  'reason.CONFLICTING_SIGNALS': { km: 'សញ្ញាផ្ទុយគ្នា', en: 'Conflicting signals' },
  'reason.DATECODE_MISMATCH': { km: 'កូដកាលបរិច្ឆេទមិនត្រូវនឹងឆ្នាំ/សម័យ', en: 'Date code does not match the year/era' },
  'reason.MISSING_REQUIRED_CAPTURES': { km: 'ខ្វះរូបភាពចាំបាច់', en: 'Required photos are missing' },
  'reason.MISSING_REQUIRED_OBSERVATIONS': { km: 'ខ្វះការសង្កេតចាំបាច់', en: 'Required observations are missing' },
  'reason.MINOR_CONCERN': { km: 'ចំណុចតូចមួយត្រូវបានរកឃើញ', en: 'A minor concern was found' },
  'reason.UNSUPPORTED_REQUIRED_FEATURE': { km: 'លក្ខណៈចាំបាច់មិនត្រូវ reference', en: 'A required feature does not match references' },
  'reason.INSUFFICIENT_SUPPORT': { km: 'ចំនួនការត្រួតពិនិត្យគាំទ្រមិនគ្រប់', en: 'Not enough supporting checks' },
  'reason.SUFFICIENT_SUPPORT': { km: 'មានការត្រួតពិនិត្យគាំទ្រគ្រប់គ្រាន់', en: 'Enough supporting checks' },
  // coverage levels & needs
  'level.L0_no_approved_era': { km: 'L0 · មិនទាន់មានសម័យផលិតដែលអនុម័ត', en: 'L0 · no approved era' },
  'level.L1_checklist_only': { km: 'L1 · មាន checklist តែប៉ុណ្ណោះ', en: 'L1 · checklist only' },
  'level.L2_rules_ready': { km: 'L2 · ច្បាប់រួចរាល់', en: 'L2 · rules ready' },
  'level.L3_retrieval_ready': { km: 'L3 · ស្វែងរកប្រៀបធៀបបាន', en: 'L3 · retrieval ready' },
  'level.L4_finetune_ready': { km: 'L4 · ត្រៀម fine-tune', en: 'L4 · fine-tune ready' },
  'need.approved_era': { km: 'ត្រូវអនុម័តសម័យផលិត (ឆ្នាំចាប់ផ្តើម/បញ្ចប់ និងប្រភេទអត្តសញ្ញាណ)', en: 'Approve a production era (start/end year + identifier type)' },
  'need.identifier_defined': { km: 'ត្រូវកំណត់ប្រភេទអត្តសញ្ញាណ (date code / RFID / ...)', en: 'Define the identifier type (date code / RFID / ...)' },
  'need.date_code_format_approved': { km: 'ត្រូវអនុម័តទ្រង់ទ្រាយ date code', en: 'Approve a date-code format' },
  'need.approved_rules': { km: 'ច្បាប់ដែលបានអនុម័ត', en: 'Approved rules' },
  'need.authentic_assets': { km: 'រូបភាព reference ពិតដែលបានអនុម័ត', en: 'Approved authentic reference photos' },
  'need.counterfeit_assets': { km: 'រូបភាព reference ក្លែងដែលបានអនុម័ត', en: 'Approved counterfeit reference photos' },
};

interface Ctx { locale: Locale; setLocale: (l: Locale) => void; t: (k: string) => string }
const I18n = createContext<Ctx>({ locale: 'km', setLocale: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLoc] = useState<Locale>(() => {
    try { return (localStorage.getItem('hz_locale') as Locale) || 'km'; } catch { return 'km'; }
  });
  const value = useMemo<Ctx>(() => ({
    locale,
    setLocale: (l) => { setLoc(l); try { localStorage.setItem('hz_locale', l); } catch { /* ignore */ } document.documentElement.lang = l; },
    t: (k) => D[k]?.[locale] ?? D[k]?.en ?? k,
  }), [locale]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
