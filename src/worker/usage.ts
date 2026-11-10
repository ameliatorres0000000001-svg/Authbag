import { AsyncLocalStorage } from 'node:async_hooks';
import type { Env } from './env.ts';

// Token use per day and per feature, so staff can see how fast the AI budget goes. Each request that uses AI
// runs inside `asFeature('precheck', …)`; every model call inside it adds its tokens to `ai_usage_daily`.
const feature = new AsyncLocalStorage<string>();
export const asFeature = <T>(name: string, fn: () => Promise<T>): Promise<T> => feature.run(name, fn);

interface AnthropicUsage { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }
interface GeminiUsage { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
interface OpenAIUsage { prompt_tokens?: number; completion_tokens?: number }

/** Add one call's tokens (input incl. cache reads/writes; output incl. thinking). Never fails the caller. */
export async function recordUsage(env: Env, model: string, u: AnthropicUsage | GeminiUsage | OpenAIUsage | null | undefined): Promise<void> {
  if (!u) return;
  const a = u as AnthropicUsage, g = u as GeminiUsage, o = u as OpenAIUsage;
  const input = (a.input_tokens ?? 0) + (a.cache_creation_input_tokens ?? 0) + (a.cache_read_input_tokens ?? 0) + (g.promptTokenCount ?? 0) + (o.prompt_tokens ?? 0);
  const output = (a.output_tokens ?? 0) + (g.candidatesTokenCount ?? 0) + (g.thoughtsTokenCount ?? 0) + (o.completion_tokens ?? 0);
  if (!input && !output) return;
  try {
    await env.DB.prepare(`INSERT INTO ai_usage_daily (day, feature, model, calls, input_tokens, output_tokens) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT (day, feature, model) DO UPDATE SET calls = calls + 1, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens`)
      .bind(new Date().toISOString().slice(0, 10), feature.getStore() ?? 'other', model.slice(0, 80), input, output).run();
  } catch (e) { console.error('usage not recorded:', (e as Error).message); }
}
