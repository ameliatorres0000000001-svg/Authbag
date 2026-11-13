// Dealer stock guide (owner's market notes, Nov 2026 — "HENGZ AUTHENTIC & Bale Intelligence, Dealer Edition").
// Demand badges, stock tier and the code / tag checkpoints for the models dealers sort most. ZERO prices, by owner policy.
// It is general knowledge about a model, never a verdict on one bag.

export type Badge = 'fast' | 'rare' | 'thai' | 'cream' | 'mass';
export type Tier = 'luxury_vintage' | 'korean_original' | 'bale_cream' | 'even_ton';
export interface Line { en: string; km: string }
export interface DealerItem {
  rank: number; brand: string; model: string; era: Line; tier: Tier; badges: Badge[];
  checks: Line[]; tip: Line; /** extra words people search with */ keywords: string;
}

export const SOURCE = 'Owner’s dealer market notes — November 2026';
export const BADGE_ICON: Record<Badge, string> = { fast: '🔥', rare: '💎', thai: '🇹🇭', cream: '📦', mass: '🔥' };

export const DEALER_ITEMS: DealerItem[] = [
  { rank: 1, brand: 'Balenciaga', model: 'City Classic', tier: 'luxury_vintage', badges: ['fast', 'rare', 'thai'],
    era: { en: 'Y2K vintage · Chèvre goat / Agneau lamb leather', km: 'វីនថេជ Y2K · ស្បែកពពែ Chèvre / ស្បែកកូនចៀម Agneau' },
    checks: [
      { en: 'Leather tag inside: style number 115748 on the back (2005–2012 era)', km: 'ស្លាកស្បែកខាងក្នុង៖ លេខម៉ូដែល 115748 នៅខាងក្រោយ (ជំនាន់ 2005–2012)' },
      { en: 'Lampo zippers; notched metal rivets on the handles', km: 'រ៉ូត Lampo; គ្រាប់ដែកមានស្នាមរន្ធ នៅដៃកាន់' },
      { en: 'Distressed Chèvre / Agneau texture, soft and natural', km: 'សាច់ស្បែក Chèvre / Agneau ជ្រួញធម្មជាតិ ទន់' },
    ],
    tip: { en: '#1 Y2K demand in Bangkok & Jakarta; intact corners and tassels sell first', km: 'Y2K លេខ ១ នៅបាងកក និងចាកាតា; ជ្រុង និងរំយោលនៅល្អ លក់ចេញមុន' },
    keywords: 'balenciaga city motorcycle lampo 115748 chevre agneau y2k' },
  { rank: 2, brand: 'MCM', model: 'Stark Backpack (Small / Mini)', tier: 'korean_original', badges: ['fast', 'thai'],
    era: { en: 'Korean era (Sungjoo) · Cognac Visetos & Black', km: 'ជំនាន់កូរ៉េ (Sungjoo) · Visetos ពណ៌ Cognac និងខ្មៅ' },
    checks: [
      { en: 'Visetos laurel: 9 leaves left, 8 right (9L/8R), crisp diamonds', km: 'ស្លឹកឈើ Visetos៖ ឆ្វេង 9 ស្តាំ 8 (9L/8R) ពេជ្រមុតច្បាស់' },
      { en: 'Front brass plate: 1 letter + 4 digits (e.g. A1234), deep engraving, 4 flathead screws (not cross/Phillips)', km: 'ផ្លាកលោហៈខាងមុខ៖ អក្សរ 1 + លេខ 4 (ឧ. A1234) ឆ្លាក់ជ្រៅ វីសក្បាលសំប៉ែត 4 (មិនមែនវីសបូក)' },
      { en: 'Inner pocket seam: small white fabric tag with SKU (MMK…) + MADE IN KOREA', km: 'ថ្នេរហោប៉ៅខាងក្នុង៖ ស្លាកក្រណាត់ស តូច មាន SKU (MMK…) + MADE IN KOREA' },
    ],
    tip: { en: 'Highest daily live-stream turnover in Thailand & Cambodia', km: 'លក់ Live ចេញច្រើនបំផុតរាល់ថ្ងៃ នៅថៃ និងកម្ពុជា' },
    keywords: 'mcm stark backpack visetos cognac black korea sungjoo mmk' },
  { rank: 3, brand: 'MCM', model: 'Claus Reversible Belt (M buckle)', tier: 'korean_original', badges: ['rare', 'fast'],
    era: { en: 'Korean era · "M" metal buckle', km: 'ជំនាន់កូរ៉េ · ក្បាលខ្សែក្រវ៉ាត់ដែក "M"' },
    checks: [
      { en: 'Buckle back: crisp deep "MCM" + MADE IN KOREA (GERMANY on heritage), smooth plating, no casting bubbles', km: 'ខាងក្រោយក្បាល M៖ ឆ្លាក់ "MCM" + MADE IN KOREA (ឬ GERMANY ជំនាន់ចាស់) ជ្រៅច្បាស់ ស្រោបរលោង គ្មានពពុះ' },
      { en: 'Strap inside: printed model code (MXB…), waist size (e.g. 85/34) + MADE IN KOREA', km: 'ខាងក្នុងខ្សែ៖ ខូដម៉ូដែល (MXB…) ទំហំចង្កេះ (ឧ. 85/34) + MADE IN KOREA' },
      { en: 'Visetos strap: 9L/8R leaves, smooth edge glazing', km: 'ខ្សែ Visetos៖ ស្លឹក 9L/8R គែមលាបរលោង' },
    ],
    tip: { en: 'High demand in Thailand; clean stock is hard to find', km: 'តម្រូវការខ្ពស់នៅថៃ; ស្តុកស្អាតពិបាករក' },
    keywords: 'mcm claus belt reversible buckle mxb korea germany' },
  { rank: 4, brand: 'MCM', model: 'Visetos Bifold / Zip Wallet & Card Holder', tier: 'korean_original', badges: ['fast'],
    era: { en: 'Korean era', km: 'ជំនាន់កូរ៉េ' },
    checks: [
      { en: 'Inside billfold / card slot seam: white fabric tag with code (MYL… / MXZ…) + MADE IN KOREA', km: 'ក្នុងថតលុយ / ថ្នេររន្ធកាត៖ ស្លាកក្រណាត់ស មានខូដ (MYL… / MXZ…) + MADE IN KOREA' },
      { en: 'Sharp heat-stamped MCM logo, no ink bleeding', km: 'ត្រា MCM បោះកម្ដៅមុតច្បាស់ ទឹកថ្នាំមិនរាល' },
      { en: '9L/8R laurel and even diamond alignment', km: 'ស្លឹក 9L/8R និងពេជ្រតម្រង់ស្មើ' },
    ],
    tip: { en: 'Fast daily cash-flow item for live sellers', km: 'ទំនិញចេញលុយលឿនរាល់ថ្ងៃ សម្រាប់អ្នកលក់ Live' },
    keywords: 'mcm wallet bifold zip card holder myl mxz visetos' },
  { rank: 5, brand: 'Louis Vuitton', model: 'Pochette Accessoires (Monogram)', tier: 'luxury_vintage', badges: ['rare', 'thai'],
    era: { en: 'Vintage, discontinued classic', km: 'វីនថេជ ម៉ូដែលឈប់ផលិត' },
    checks: [
      { en: 'Inner leather tab near the zipper: date code (2 letters + 4 digits)', km: 'ស្លាកស្បែកខាងក្នុងជិតរ៉ូត៖ Date Code (អក្សរ 2 + លេខ 4)' },
      { en: 'Vachetta strap: natural honey patina, even mustard stitching', km: 'ខ្សែស្បែក Vachetta៖ ពណ៌ទឹកឃ្មុំធម្មជាតិ ថ្នេរពណ៌លឿងស្មើ' },
      { en: 'Solid brass D-ring and LV-embossed zipper pull', km: 'កងដែក D លង្ហិនរឹង និងក្បាលរ៉ូតឆ្លាក់ LV' },
    ],
    tip: { en: 'Sells out as soon as it is stocked', km: 'ដាក់ស្តុកភ្លាម លក់អស់ភ្លាម' },
    keywords: 'lv louis vuitton pochette accessoires monogram vachetta date code' },
  { rank: 6, brand: 'Celine', model: 'Macadam Vintage & Triomphe', tier: 'luxury_vintage', badges: ['thai'],
    era: { en: 'Vintage Boston / shoulder; Triomphe series', km: 'វីនថេជ Boston / ស្ពាយស្មា; ស៊េរី Triomphe' },
    checks: [
      { en: 'Heat-stamped leather tab behind the pocket: serial (e.g. M94, MC98/1)', km: 'ស្លាកស្បែកបោះត្រាក្រោយហោប៉ៅ៖ លេខសម្គាល់ (ឧ. M94, MC98/1)' },
      { en: 'Coated Blason / Macadam canvas with tan leather trim', km: 'ក្រណាត់ស្រោប Blason / Macadam គែមស្បែកពណ៌ត្នោតស្រាល' },
      { en: 'Gold-tone rings and CELINE-engraved zipper pulls', km: 'កងពណ៌មាស និងក្បាលរ៉ូតឆ្លាក់ CELINE' },
    ],
    tip: { en: 'Top quiet-luxury vintage pick in Bangkok & KL', km: 'ជម្រើសវីនថេជ Quiet Luxury ល្បីនៅបាងកក និង KL' },
    keywords: 'celine macadam triomphe blason boston vintage' },
  { rank: 7, brand: 'Goyard / Louis Vuitton', model: 'Saint Louis PM · Speedy 25 Bandoulière', tier: 'luxury_vintage', badges: ['fast'],
    era: { en: 'Everyday luxury staples', km: 'កាបូបប្រើប្រចាំថ្ងៃ ល្បីគ្រប់ពេល' },
    checks: [
      { en: 'Check the heat stamp, date code / serial and stitching like any luxury piece', km: 'ពិនិត្យត្រាម៉ាក Date Code / លេខសម្គាល់ និងថ្នេរ ដូចកាបូប Luxury ផ្សេងៗ' },
    ],
    tip: { en: 'Core fast sellers across Southeast Asia', km: 'លក់ចេញលឿនទូទាំងអាស៊ីអាគ្នេយ៍' },
    keywords: 'goyard saint louis pm lv speedy 25 bandouliere' },
];

/** Korean bale "cream" brands (sorted as Grade A). */
export const CREAM_BRANDS = ['Stand Oil', 'Marithé François Girbaud', 'emis', 'Mardi Mercredi', 'Matin Kim', 'OSOI', 'Beanpole', 'Louis Quatorze', 'Metrocity', 'J.Estina', 'MLB Korea'];
/** Even-ton / casual bale items (mass market, fast). */
export const EVEN_TON = ['Charles & Keith', 'Pedro', 'Zara', 'Uniqlo Round Mini Shoulder', 'Carhartt WIP', 'Kangol', 'Dickies', 'Y2K Nylon bags', 'Y2K Denim bags', 'Printed canvas totes (salad / graphic)'];
export const BALE_CHECKS: Line[] = [
  { en: 'Korean Hangul care / maker label (제조국: 대한민국 / 수입원)', km: 'ស្លាកភាសាកូរ៉េ (제조국: 대한민국 / 수입원)' },
  { en: 'YKK or branded zippers, smooth tracks', km: 'រ៉ូត YKK ឬរ៉ូតមានម៉ាក រត់រលូន' },
  { en: 'Strap hardware intact, lining clean', km: 'ដែកខ្សែស្ពាយនៅល្អ ស្រទាប់ក្នុងស្អាត' },
];
export const TIER_ORDER: Tier[] = ['luxury_vintage', 'korean_original', 'bale_cream', 'even_ton'];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Search the dealer list: every word must appear in the brand, model, era, checks, tip or keywords (any language). */
export function searchDealer(q: string, items: DealerItem[] = DEALER_ITEMS): DealerItem[] {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => {
    const hay = norm([it.brand, it.model, it.era.en, it.era.km, it.tip.en, it.tip.km, it.keywords, ...it.checks.flatMap((c) => [c.en, c.km])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}
/** Search a plain name list (cream brands, even-ton items). */
export const searchNames = (q: string, list: string[]) => { const w = norm(q).split(' ').filter(Boolean); return w.length ? list.filter((n) => w.every((x) => norm(n).includes(x))) : list; };

/** The guide as plain text for the AI assistant's context (no prices). */
export function dealerGuideText(): string {
  return [
    `Dealer stock guide (${SOURCE}; no prices):`,
    ...DEALER_ITEMS.map((it) => `#${it.rank} ${it.brand} ${it.model} — ${it.era.en}; tier ${it.tier}; badges ${it.badges.join('/')}; checks: ${it.checks.map((c) => c.en).join('; ')}; tip: ${it.tip.en}`),
    `Korean bale cream brands (Grade A): ${CREAM_BRANDS.join(', ')}.`,
    `Even ton / casual bale items (mass market, fast): ${EVEN_TON.join(', ')}.`,
    `Bale checks: ${BALE_CHECKS.map((c) => c.en).join('; ')}.`,
  ].join('\n');
}
