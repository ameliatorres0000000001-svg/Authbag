import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFoundUrls, urlKey } from '../src/shared/urls.ts';

test('small rewrites of the same link still match, and the search\'s own link is returned', () => {
  const found = ['https://www.example.com/bags/speedy-25/?utm_source=x'];
  for (const w of ['http://example.com/bags/speedy-25', 'https://example.com/bags/speedy-25/#prices', 'https://WWW.Example.com/bags/speedy-25/?fbclid=abc'])
    assert.deepEqual(matchFoundUrls([w], found), found);
});

test('a different page, a different site or a made-up link does not match', () => {
  const found = ['https://example.com/bags/speedy-25', 'https://shop.example.com/item?id=7'];
  assert.deepEqual(matchFoundUrls(['https://example.com/bags/neverfull', 'https://example.org/bags/speedy-25', 'https://shop.example.com/item?id=8', 'not a link', 'javascript:alert(1)', null], found), []);
  assert.equal(urlKey('ftp://example.com/a'), '');
});

test('real query parameters count, their order does not; duplicates and the limit are handled', () => {
  assert.equal(urlKey('https://a.com/p?b=2&a=1'), urlKey('https://a.com/p?a=1&b=2'));
  const found = ['https://a.com/1', 'https://a.com/2', 'https://a.com/3'];
  assert.deepEqual(matchFoundUrls(['https://a.com/1/', 'http://a.com/1', 'https://a.com/2', 'https://a.com/3'], found, 2), ['https://a.com/1', 'https://a.com/2']);
});
