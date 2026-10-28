import test from 'node:test';
import assert from 'node:assert/strict';
import { cropBox, isValidRect, parseSuggestedMarks, rectFromDrag, MAX_AI_MARKS } from '../src/shared/marks.ts';

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
