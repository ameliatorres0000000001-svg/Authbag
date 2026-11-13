import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE_VERSION, cleanGuideText, guideFor, isCurrentGuide, parseGuides } from '../src/shared/pointGuide.ts';

const one = (n: number, extra: Record<string, string> = {}) => ({
  box_id: n, title_km: 'ពុម្ពអក្សរម៉ាក', popup_km: 'អក្សរ O មូល', look_at_km: 'អក្សរ', match_km: 'O មូល', differs_km: 'O ពងក្រពើ',
  title_en: 'Logo lettering', popup_en: 'Round O', look_at_en: 'letters', match_en: 'round O', differs_en: 'oval O', ...extra,
});

test('guides are matched to box numbers; bad or out-of-range boxes are dropped', () => {
  const g = parseGuides(JSON.stringify({ annotations: [one(1), one(2), one(9), one(1), { box_id: 3, title_km: 'x' }, 'junk'] }), 3);
  assert.deepEqual([...g.keys()], [1, 2]);
  assert.equal(g.get(1)!.km.popup, 'អក្សរ O មូល');
  assert.equal(g.get(2)!.en.differs, 'oval O');
});

test('owner format v2 (_kh fields) is read, versioned, and banned phrases are removed', () => {
  const g = parseGuides(JSON.stringify({ model_summary_kh: 'ត្រា និងស្នាមដេរ', annotations: [{ box_id: 1, title_kh: 'ត្រាម៉ាក',
    popup_text_kh: 'ក្នុងរូបនេះ៖ ឃើញ អក្សរ C ក្រាស់ស្មើ', where_to_look_kh: 'ក្រោមគន្លឹះ', original_trait_kh: 'ឆ្លាក់មុតច្បាស់',
    fake_red_flag_kh: 'អក្សររាក់ ព្រាល', title_en: 'Stamp', popup_text_en: 'Thick even C', where_to_look_en: 'under the clasp',
    original_trait_en: 'crisp engraving', fake_red_flag_en: 'shallow blurry letters' }] }), 1).get(1)!;
  assert.equal(g.v, GUIDE_VERSION);
  assert.equal(g.km.popup, 'អក្សរ C ក្រាស់ស្មើ');
  assert.equal(g.km.differs, 'អក្សររាក់ ព្រាល');
  assert.equal(g.en.match, 'crisp engraving');
  assert.ok(isCurrentGuide(JSON.stringify(g)));
  assert.ok(!isCurrentGuide(JSON.stringify(parseGuides(JSON.stringify({ annotations: [one(1)] }), 1).get(1)).replace('"v":2,', '')));
  assert.equal(cleanGuideText('ប្រៀបធៀបលេខ “28002098” ជាមួយរូបយោង។'), 'មើល លេខ “28002098”។');
});

test('English falls back to Khmer when the AI wrote Khmer only', () => {
  const g = parseGuides(JSON.stringify({ annotations: [{ box_id: 1, title_kh: 'ថ្នេរ', popup_text_kh: 'ស្នាមដេរញឹកស្មើ' }] }), 1).get(1)!;
  assert.equal(g.en.title, 'ថ្នេរ');
});

test('broken answers give nothing; guideFor picks the language', () => {
  assert.equal(parseGuides('sorry', 2).size, 0);
  assert.equal(parseGuides('{"annotations": 5}', 2).size, 0);
  const json = JSON.stringify(parseGuides(JSON.stringify({ annotations: [one(1)] }), 1).get(1));
  assert.equal(guideFor(json, 'km')!.title, 'ពុម្ពអក្សរម៉ាក');
  assert.equal(guideFor(json, 'th')!.title, 'Logo lettering');
  assert.equal(guideFor(null, 'km'), null);
  assert.equal(guideFor('{bad', 'km'), null);
});
