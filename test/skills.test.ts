import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSkills, mentions, skillWords, type SkillRow } from '../src/shared/skills.ts';

const row = (id: string, x: Partial<SkillRow>): SkillRow => ({ id, area: 'chat', title: id, body: 'x'.repeat(20), brand: null, keywords: null, ...x });
const ids = (r: SkillRow[]) => r.map((s) => s.id);

test('keywords split on commas, lines and Asian commas; very short words dropped', () => {
  assert.deepEqual(skillWords('តោន, Bale，กระสอบ\na'), ['តោន', 'bale', 'กระสอบ']);
});

test('chat: general skills always, keyword skills only on a hit, brand skills only when the brand is named', () => {
  const rows = [row('general', {}), row('bale', { keywords: 'តោន, bale' }), row('bal', { brand: 'Balenciaga' }), row('coach', { brand: 'Coach' })];
  assert.deepEqual(ids(chooseSkills(rows, 'chat', { text: 'ទិញតោនពីចិនខាតមែនទេ?' }, 9999)), ['bale', 'general']);
  assert.deepEqual(ids(chooseSkills(rows, 'chat', { text: 'Balenciaga City price?' }, 9999)), ['bal', 'general']);
});

test('area: chat skills never reach the bag check; "all" skills do', () => {
  const rows = [row('c', { area: 'chat' }), row('a', { area: 'all' }), row('k', { area: 'check' })];
  assert.deepEqual(ids(chooseSkills(rows, 'check', {}, 9999)).sort(), ['a', 'k']);
});

test('check: brand skills follow the request brand', () => {
  const rows = [row('lv', { area: 'check', brand: 'Louis Vuitton' }), row('coach', { area: 'check', brand: 'Coach' })];
  assert.deepEqual(ids(chooseSkills(rows, 'check', { brand: 'Coach' }, 9999)), ['coach']);
});

test('identify: reads every recognition tip, but "all" skills only on a keyword hit', () => {
  const rows = [row('tip', { area: 'identify', brand: 'Balenciaga' }), row('allgen', { area: 'all' })];
  assert.deepEqual(ids(chooseSkills(rows, 'identify', {}, 9999)), ['tip']);
});

test('budget and the skill being tested comes first', () => {
  const rows = [row('a', { body: 'a'.repeat(60) }), row('b', { body: 'b'.repeat(30) })];
  const extra = row('test', { body: 't'.repeat(50) });
  assert.deepEqual(ids(chooseSkills(rows, 'chat', { extra }, 100)), ['test', 'b']);
});

test('whole-word match for Latin words, inside-text match for Khmer and Thai', () => {
  assert.equal(mentions('balenciaga city', 'bale'), false);
  assert.equal(mentions('buying bales from china', 'bale'), true);
  assert.equal(mentions('louis vuitton speedy', 'louis vuitton'), true);
  assert.equal(mentions('ទិញតោនពីចិន', 'តោន'), true);
  assert.equal(mentions('ซื้อกระสอบจากจีน', 'กระสอบ'), true);
});

test('paint and repair: their own skills plus "all"; keyword skills only on a hit', () => {
  const rows = [row('suede', { area: 'paint', keywords: 'suede, ស្បែកកក់' }), row('gen', { area: 'paint' }), row('rep', { area: 'repair' }), row('chat', { area: 'chat' })];
  assert.deepEqual(ids(chooseSkills(rows, 'paint', { text: 'surface: suede' }, 9999)), ['suede', 'gen']);
  assert.deepEqual(ids(chooseSkills(rows, 'paint', { text: 'surface: smooth leather' }, 9999)), ['gen']);
  assert.deepEqual(ids(chooseSkills(rows, 'repair', { text: 'mould' }, 9999)), ['rep']);
});
