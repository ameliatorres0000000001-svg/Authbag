import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesIn } from '../src/shared/stepMinutes.ts';

test('minutes are read from Khmer and English steps, Khmer or Latin digits', () => {
  assert.equal(minutesIn('ទុកស្ងួត ២០ នាទី រវាងស្រទាប់'), 20);
  assert.equal(minutesIn('ទុកស្ងួត 20នាទី'), 20);
  assert.equal(minutesIn('Let it dry 15 minutes between coats'), 15);
  assert.equal(minutesIn('Stir 1 min'), 1);
});

test('a range takes the longer time', () => {
  assert.equal(minutesIn('ទុក ១៥-២០ នាទី'), 20);
  assert.equal(minutesIn('dry 15–30 minutes'), 30);
});

test('no timer for steps without minutes, for hours, or for absurd numbers', () => {
  assert.equal(minutesIn('លាបស្តើងៗ ២–៣ ស្រទាប់'), null);
  assert.equal(minutesIn('ទុក ២៤ ម៉ោង មុនប្រើ'), null);
  assert.equal(minutesIn('wait 500 minutes'), null);
  assert.equal(minutesIn(''), null);
});
