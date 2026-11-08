import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFor, handleFromInput, profileUrl, tiktokHandle } from '../src/shared/leads.ts';

test('tiktok links: profile, video and live pages give the handle; other pages do not', () => {
  assert.equal(tiktokHandle('https://www.tiktok.com/@Bag.Shop_TH'), 'bag.shop_th');
  assert.equal(tiktokHandle('https://www.tiktok.com/@bagshop/video/7312345678901234567?lang=th'), 'bagshop');
  assert.equal(tiktokHandle('https://m.tiktok.com/@bagshop/live'), 'bagshop');
  assert.equal(tiktokHandle('https://www.tiktok.com/discover/preloved-bag'), null);
  assert.equal(tiktokHandle('https://www.tiktok.com/tag/กระเป๋ามือสอง'), null);
  assert.equal(tiktokHandle('https://evil.com/?u=https://www.tiktok.com/@x1'), null);
  assert.equal(tiktokHandle('https://www.tiktok.com.evil.com/@bagshop'), null);
});

test('input: @name, name or link', () => {
  assert.equal(handleFromInput('@Preloved.MY'), 'preloved.my');
  assert.equal(handleFromInput('preloved_id'), 'preloved_id');
  assert.equal(handleFromInput('https://www.tiktok.com/@abc123/live'), 'abc123');
  assert.equal(handleFromInput('not a handle!'), null);
  assert.equal(profileUrl('abc123'), 'https://www.tiktok.com/@abc123');
});

test('an AI-proposed account needs a real search link, LIVE pages preferred', () => {
  const found = ['https://www.tiktok.com/@shop1/video/1', 'https://www.tiktok.com/@shop1/live', 'https://www.tiktok.com/discover/x'];
  assert.equal(evidenceFor('@Shop1', found), 'https://www.tiktok.com/@shop1/live');
  assert.equal(evidenceFor('shop2', found), null);
});
