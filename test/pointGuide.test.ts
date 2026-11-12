import test from 'node:test';
import assert from 'node:assert/strict';
import { guideFor, parseGuides } from '../src/shared/pointGuide.ts';

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

test('verdict words never reach the stored guide', () => {
  const g = parseGuides(JSON.stringify({ annotations: [one(1, { popup_km: 'កាបូបពិតប្រាកដ មិនមែនក្លែងក្លាយ', differs_en: 'a fake has an oval O', match_en: 'authentic bags show a round O' })] }), 1).get(1)!;
  assert.doesNotMatch(g.km.popup, /ពិតប្រាកដ|ក្លែង/);
  assert.doesNotMatch(`${g.en.differs} ${g.en.match}`, /fake|authentic/i);
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
