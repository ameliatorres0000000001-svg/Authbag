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

test('Bedrock keys are recognised and pick the Bedrock provider with anthropic. model ids', async () => {
  const { aiProvider, aiModel, pointsModel } = await import('../src/worker/vision.ts');
  const env = (e: Record<string, string>) => e as any;
  assert.equal(anthropicKeyKind('ABSKQmVkcm9ja0FQSUtleS1').kind, 'bedrock_key');
  assert.equal(aiProvider(env({ ANTHROPIC_API_KEY: 'ABSKxyz' })), 'bedrock');
  assert.equal(aiProvider(env({ BEDROCK_API_KEY: 'bedrock-api-key-abc' })), 'bedrock');
  assert.equal(aiProvider(env({ AWS_ACCESS_KEY_ID: 'AKIA1', AWS_SECRET_ACCESS_KEY: 's' })), 'bedrock');
  assert.equal(aiProvider(env({ ANTHROPIC_API_KEY: 'sk-ant-api03-x', AWS_ACCESS_KEY_ID: 'AKIA1', AWS_SECRET_ACCESS_KEY: 's' })), 'anthropic');
  assert.equal(aiProvider(env({ ANTHROPIC_API_KEY: 'sk-ant-api03-x', AI_PROVIDER: 'bedrock' })), 'bedrock');
  assert.equal(aiModel(env({ BEDROCK_API_KEY: 'ABSK1' })), 'anthropic.claude-sonnet-5-5');
  assert.equal(aiModel(env({ BEDROCK_API_KEY: 'ABSK1', AI_MODEL: 'claude-opus-5-5' })), 'anthropic.claude-opus-5-5');
  assert.equal(pointsModel(env({ BEDROCK_API_KEY: 'ABSK1' })), 'anthropic.claude-opus-5-5');
  assert.equal(aiModel(env({ ANTHROPIC_API_KEY: 'sk-ant-api03-x' })), 'claude-sonnet-5-5');
});
