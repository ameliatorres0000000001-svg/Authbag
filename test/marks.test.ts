import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBox, iou, isValidRect, parseSuggestedMarks, rectFromDrag, refineMarks, MAX_AI_MARKS } from '../src/shared/marks.ts';

test('drag in any direction gives the same clamped rectangle', () => {
  assert.deepEqual(rectFromDrag(0.6, 0.7, 0.2, 0.1), rectFromDrag(0.2, 0.1, 0.6, 0.7));
  const r = rectFromDrag(-0.5, 0.5, 0.5, 1.4)!;
  assert.equal(r.x, 0); assert.equal(r.w, 0.5); assert.equal(r.y + r.h, 1);
});

test('tiny drags (taps) are ignored', () => {
  assert.equal(rectFromDrag(0.5, 0.5, 0.505, 0.6), null);
});

test('isValidRect rejects boxes that leave the image', () => {
  assert.ok(isValidRect({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }));
  assert.ok(!isValidRect({ x: 0.8, y: 0.1, w: 0.5, h: 0.5 }));
  assert.ok(!isValidRect({ x: Number.NaN, y: 0, w: 0.5, h: 0.5 }));
});

test('AI reply parsing keeps labelled, valid boxes only and never throws', () => {
  const txt = 'Here you go:\n```json\n[{"label":"Serial plate characters","x":0.1,"y":0.2,"w":0.3,"h":0.1},{"label":"","x":0,"y":0,"w":0.5,"h":0.5},{"label":"bad","x":"a"}]\n```';
  const m = parseSuggestedMarks(txt);
  assert.equal(m.length, 1);
  assert.equal(m[0].label, 'Serial plate characters');
  assert.deepEqual(parseSuggestedMarks('not json'), []);
  assert.deepEqual(parseSuggestedMarks('[{broken'), []);
});

test('AI suggestions are capped', () => {
  const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ label: `p${i}`, x: 0.1, y: 0.1, w: 0.2, h: 0.2 })));
  assert.equal(parseSuggestedMarks(many).length, MAX_AI_MARKS);
});

test('crop box keeps the photo proportions and offsets the image', () => {
  const c = cropBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 1000, 2000);
  assert.equal(c.aspectRatio, '500 / 500');
  assert.deepEqual(c.img, { width: '200%', height: '400%', left: '-50%', top: '-200%' });
});

import { parseBilingualMarks } from '../src/shared/marks.ts';
test('bilingual teaching points keep English as the base text and both languages in i18n', () => {
  const r = parseBilingualMarks('ok [{"x":0.1,"y":0.2,"w":0.3,"h":0.2,"label_en":"Star-head screw","note_en":"Check the head.\\nIn this photo: a star socket.","label_km":"ខ្ចៅក្បាលផ្កាយ","note_km":"មើលក្បាលខ្ចៅ។\\nក្នុងរូបនេះ៖ រន្ធផ្កាយ។"},{"x":0.5,"y":0.5,"w":0.1,"h":0.1,"label_km":"តែខ្មែរ"},{"x":"a"}]');
  assert.equal(r.length, 2);
  assert.equal(r[0].label, 'Star-head screw');
  assert.equal(r[0].i18n!.km!.note, 'មើលក្បាលខ្ចៅ។\nក្នុងរូបនេះ៖ រន្ធផ្កាយ។');
  assert.equal(r[1].label, 'តែខ្មែរ');
  assert.equal(r[1].i18n!.en, undefined);
});

test('refineMarks drops near-whole-photo boxes and duplicates', () => {
  const whole = { x: 0.02, y: 0.02, w: 0.95, h: 0.9, label: 'whole' };
  const a = { x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: 'a' };
  const aAgain = { x: 0.11, y: 0.1, w: 0.2, h: 0.21, label: 'a again' };
  const b = { x: 0.6, y: 0.6, w: 0.2, h: 0.2, label: 'b' };
  assert.deepEqual(refineMarks([whole, a, aAgain, b]).map((m) => m.label), ['a', 'b']);
  // a box that repeats a point already on the photo is dropped
  assert.deepEqual(refineMarks([a, b], [{ x: 0.6, y: 0.61, w: 0.2, h: 0.19 }]).map((m) => m.label), ['a']);
  assert.ok(Math.abs(iou(a, a) - 1) < 1e-9);
  assert.equal(iou(a, b), 0);
});
