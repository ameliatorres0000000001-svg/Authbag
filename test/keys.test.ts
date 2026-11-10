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

test('OpenAI-compatible provider and the automatic backup chain', async () => {
  const { aiProvider, aiModel, providerChain, openaiBase } = await import('../src/worker/vision.ts');
  const env = (o: Record<string, string>) => o as never;
  // a key without a model is not enough (no safe default model across OpenAI-compatible APIs)
  assert.equal(aiProvider(env({ OPENAI_API_KEY: 'sk-x' })), null);
  const oa = { OPENAI_API_KEY: 'sk-x', OPENAI_MODEL: 'gpt-x' };
  assert.equal(aiProvider(env(oa)), 'openai');
  assert.equal(aiModel(env(oa)), 'gpt-x');
  assert.deepEqual(providerChain(env(oa)), ['openai']);
  // Claude stays main when it has a key; the others back it up in a fixed order
  assert.deepEqual(providerChain(env({ ...oa, ANTHROPIC_API_KEY: 'sk-ant-api03-x', GEMINI_API_KEY: 'g' })), ['anthropic', 'openai', 'gemini']);
  assert.deepEqual(providerChain(env({ ...oa, ANTHROPIC_API_KEY: 'sk-ant-api03-x', GEMINI_API_KEY: 'g', AI_PROVIDER: 'gemini' })), ['gemini', 'anthropic', 'openai']);
  assert.deepEqual(providerChain(env({ ANTHROPIC_API_KEY: 'ABSKxyz', GEMINI_API_KEY: 'g' })), ['bedrock', 'gemini']);
  assert.deepEqual(providerChain(env({})), []);
  // base URL: https only, trailing slash removed
  assert.equal(openaiBase(env({})), 'https://api.openai.com/v1');
  assert.equal(openaiBase(env({ OPENAI_BASE_URL: 'https://api.laalaa.me/v1/' })), 'https://api.laalaa.me/v1');
  assert.equal(openaiBase(env({ OPENAI_BASE_URL: 'http://evil.example/v1' })), 'https://api.openai.com/v1');
});

test('gateway address: https, a bare host is accepted, plain http is refused', async () => {
  const { gatewayUrl } = await import('../src/worker/vision.ts');
  const env = (o: Record<string, string>) => o as never;
  assert.equal(gatewayUrl(env({})), null);
  assert.equal(gatewayUrl(env({ ANTHROPIC_BASE_URL: 'https://api.laalaa.me/' })), 'https://api.laalaa.me');
  assert.equal(gatewayUrl(env({ ANTHROPIC_BASE_URL: ' api.laalaa.me \n' })), 'https://api.laalaa.me');
  assert.equal(gatewayUrl(env({ ANTHROPIC_BASE_URL: 'http://api.laalaa.me' })), null);
});
