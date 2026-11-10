import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anthropicKeyKind, cleanKey } from '../src/worker/vision.ts';

test('pasted keys are cleaned of line breaks, spaces, quotes and "Bearer "', () => {
  assert.equal(cleanKey('sk-ant-api03-abc\n'), 'sk-ant-api03-abc');
  assert.equal(cleanKey('  "sk-ant-api03-abc"  '), 'sk-ant-api03-abc');
  assert.equal(cleanKey('Bearer sk-ant-api03-abc'), 'sk-ant-api03-abc');
  assert.equal(cleanKey(undefined), '');
});

test('the kind of credential is named without showing it', () => {
  assert.deepEqual(anthropicKeyKind('sk-ant-api03-x'), { kind: 'api_key', changedByCleaning: false });
  assert.deepEqual(anthropicKeyKind('sk-ant-api03-x\n'), { kind: 'api_key', changedByCleaning: true });
  assert.equal(anthropicKeyKind('sk-ant-oat01-x').kind, 'oauth_token');
  assert.equal(anthropicKeyKind('sk-ant-admin01-x').kind, 'admin_key');
  assert.equal(anthropicKeyKind('AIzaSy-x').kind, 'other');
  assert.equal(anthropicKeyKind('').kind, 'missing');
});
