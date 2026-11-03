import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessFromFilename } from '../src/shared/uploadGuess.ts';

const brands = [{ id: 'b_lv', name: 'Louis Vuitton' }, { id: 'b_gucci', name: 'Gucci' }, { id: 'b_prada', name: 'Prada' }, { id: 'b_chanel', name: 'Chanel' }];
const models = [
  { id: 'm_ps', brand_id: 'b_lv', name: 'Palm Springs Mini' },
  { id: 'm_kp', brand_id: 'b_lv', name: 'Keepall Bandoulière' },
  { id: 'm_nice', brand_id: 'b_lv', name: 'Nice (vanity case)' },
  { id: 'm_josh', brand_id: 'b_lv', name: 'Josh Backpack' },
  { id: 'm_c19', brand_id: 'b_chanel', name: 'Chanel 19 Flap Bag' },
];
const parts = ['heat_stamp', 'date_code', 'stitching', 'zipper', 'hardware', 'rivet', 'canvas', 'lining', 'handles', 'rfid'];
const g = (n: string) => guessFromFilename(n, brands, models, parts);

test('model photos: brand, model and part from the file name', () => {
  assert.deepEqual(g('04_lv-palm-springs-mini_4_heat_stamp.jpg'), { brandId: 'b_lv', modelId: 'm_ps', componentCode: 'heat_stamp' });
  assert.deepEqual(g('14_lv-keepall-bandouliere_5_date_code.jpg'), { brandId: 'b_lv', modelId: 'm_kp', componentCode: 'date_code' });
  assert.deepEqual(g('15_lv-nice-vanity_1_zipper.jpg'), { brandId: 'b_lv', modelId: 'm_nice', componentCode: 'zipper' });
  assert.deepEqual(g('19_lv-josh-backpack_2_handles.JPG'), { brandId: 'b_lv', modelId: 'm_josh', componentCode: 'handles' });
});

test('comparison photos: brand, part and the uploader-given label', () => {
  assert.deepEqual(g('25_compare1_gucci_date_code_counterfeit.jpg'), { brandId: 'b_gucci', componentCode: 'date_code', label: 'counterfeit' });
  assert.deepEqual(g('28_compare2_louis-vuitton_date_code_authentic.jpg'), { brandId: 'b_lv', componentCode: 'date_code', label: 'authentic' });
});

test('unknown names guess nothing', () => {
  assert.deepEqual(g('IMG_2041.jpg'), {});
  assert.deepEqual(g('slvx_canvasy.jpg'), {});
});
