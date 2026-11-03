import test from 'node:test';
import assert from 'node:assert/strict';
import { labelFromCaption, parseCropRegions } from '../src/shared/crop.ts';

const parts = ['date_code', 'zipper', 'heat_stamp'];

test('parses regions, keeps known parts, drops tiny and duplicate boxes, sorts in reading order', () => {
  const r = parseCropRegions(`Here: [
    {"x":0.5,"y":0.1,"w":0.45,"h":0.4,"caption":"Authentic","part":"date_code"},
    {"x":0.02,"y":0.1,"w":0.45,"h":0.4,"caption":"Counterfeit","part":"date_code"},
    {"x":0.03,"y":0.11,"w":0.44,"h":0.39,"caption":"dup"},
    {"x":0.1,"y":0.9,"w":0.02,"h":0.02,"caption":"arrow"},
    {"x":0.1,"y":0.55,"w":0.3,"h":0.3,"part":"made_up"}
  ]`, parts);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.caption), ['Counterfeit', 'Authentic', '']);
  assert.equal(r[0].part, 'date_code');
  assert.equal(r[2].part, null);
});

test('garbage replies give no regions', () => {
  assert.deepEqual(parseCropRegions('no json here'), []);
  assert.deepEqual(parseCropRegions('[{"x":"a"}]'), []);
});

test('captions map to a label pre-fill only when clear', () => {
  assert.equal(labelFromCaption('COUNTERFEIT'), 'counterfeit');
  assert.equal(labelFromCaption('Authentic'), 'authentic');
  assert.equal(labelFromCaption('ក្លែង'), 'counterfeit');
  assert.equal(labelFromCaption('real vs fake'), 'unknown');
  assert.equal(labelFromCaption(''), 'unknown');
});
