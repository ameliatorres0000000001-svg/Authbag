import test from 'node:test';
import assert from 'node:assert/strict';
import { customerPrecheck, parseAiReview } from '../src/shared/aiReview.ts';

const reply = (photos: unknown) => JSON.stringify({ suggestion: 'insufficient_evidence', confidence: 0.6, summary_en: 's', summary_km: 's', findings: [], photos });

test('photo quality is read per customer image, unknown values become unclear, verdict words are removed', () => {
  const a = parseAiReview(reply([
    { image: 1, quality: 'clear', note_en: '', note_km: '' },
    { image: 2, quality: 'blurry', note_en: 'retake closer', note_km: 'ថតជិតជាងនេះ' },
    { image: 2, quality: 'clear' },                         // duplicate image → ignored
    { image: 0, quality: 'clear' }, { quality: 'clear' },   // no valid image number → ignored
    { image: 3, quality: 'soft', note_en: 'looks fake', note_km: 'មើលទៅក្លែងក្លាយ' },
  ]))!;
  assert.deepEqual(a.photos.map((p) => [p.image, p.quality]), [[1, 'clear'], [2, 'unclear'], [3, 'soft']]);
  assert.doesNotMatch(`${a.photos[2].note_en} ${a.photos[2].note_km}`, /fake|ក្លែង/);
});

test('older replies without photos still parse; the customer view carries stored photo quality', () => {
  assert.deepEqual(parseAiReview(reply(undefined))!.photos, []);
  const pc = customerPrecheck({ suggested_outcome: 'insufficient_evidence', findings_json: '[]', summary_en: '', summary_km: '',
    photos_json: JSON.stringify([{ photo_id: 'vp_1', step: 'serial', quality: 'unclear', note_en: 'too dark', note_km: 'ងងឹតពេក' }, { step: 'logo' }]) })!;
  assert.equal(pc.level, 'more_photos');
  assert.deepEqual(pc.photos, [{ photo_id: 'vp_1', step: 'serial', quality: 'unclear', note_en: 'too dark', note_km: 'ងងឹតពេក' }]);
  assert.deepEqual(customerPrecheck({ suggested_outcome: 'concerns_found', findings_json: '[]', summary_en: '', summary_km: '' })!.photos, []);
});
