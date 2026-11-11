import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_PAINT_KNOWLEDGE, SAKURA_ACRYLIC, catalogLine, catalogPaint, paintLabel, withBuiltinPaintKnowledge } from '../src/shared/paintKnowledge.ts';

test('catalogue lookup accepts the ways a code is written and nothing else', () => {
  for (const c of ['15', '#15', ' # 15 ', 'No.15']) assert.equal(catalogPaint('Sakura', c)?.name, 'Yellow Ochre');
  assert.equal(catalogPaint('sakura acrylic', '112')?.name, 'Burnt Sienna');
  assert.equal(catalogPaint('Sakura', '107'), null);      // a real Sakura code, but not one of the catalogue paints
  assert.equal(catalogPaint('Sakura', ''), null);
  assert.equal(catalogPaint('Angelus', '15'), null);      // another brand's code is never taken as Sakura's
  assert.equal(catalogPaint('', '15'), null);
});

test('the codes that are easy to get wrong', () => {
  assert.equal(catalogPaint('Sakura', '36')?.name, 'Cobalt Blue');
  assert.equal(catalogPaint('Sakura', '38')?.name, 'Ultramarine Blue');
  assert.equal(catalogPaint('Sakura', '53')?.name, 'Silver');
  assert.equal(catalogPaint('Sakura', '52'), null);
  assert.equal(new Set(SAKURA_ACRYLIC.map((p) => p.code)).size, SAKURA_ACRYLIC.length);
});

test('every code named in the built-in notes is in the catalogue; the notes never judge authenticity', () => {
  for (const m of BUILTIN_PAINT_KNOWLEDGE.matchAll(/#(\d+)/g)) assert.ok(catalogPaint('Sakura', m[1]), `#${m[1]}`);
  assert.doesNotMatch(BUILTIN_PAINT_KNOWLEDGE, /authentic|genuine|fake|counterfeit|replica/i);
  assert.match(catalogLine(), /#50 Titanium White \(opaque\)/);
});

test('shop knowledge comes first and the built-in notes fit the paint budget', () => {
  const s = withBuiltinPaintKnowledge('### Shop\nour way');
  assert.ok(s.startsWith('### Shop'));
  assert.equal(withBuiltinPaintKnowledge(''), BUILTIN_PAINT_KNOWLEDGE);
  assert.ok(BUILTIN_PAINT_KNOWLEDGE.length < 4000);
});

test('Khmer screens lead with the Khmer colour name and code; other paints and languages keep the label words', () => {
  assert.deepEqual(paintLabel({ brand: 'Sakura', code: '#15', name: 'Yellow Ochre' }, 'km'), { main: 'លឿងដី', code: '#15', sub: 'Sakura Yellow Ochre' });
  assert.deepEqual(paintLabel({ brand: 'Sakura', code: '#15', name: 'Yellow Ochre' }, 'en'), { main: 'Sakura Yellow Ochre', code: '#15', sub: '' });
  assert.deepEqual(paintLabel({ brand: 'Angelus', code: '001', name: 'Black' }, 'km'), { main: 'Angelus Black', code: '001', sub: '' });
  assert.deepEqual(paintLabel({ brand: '', code: '', name: 'white' }, 'km'), { main: 'white', code: '', sub: '' });
  for (const p of SAKURA_ACRYLIC) assert.ok(p.km.trim(), p.code);
});
