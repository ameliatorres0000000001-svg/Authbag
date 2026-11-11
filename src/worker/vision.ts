import { LEATHERS } from '../shared/leathers.ts';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { Env } from './env.ts';
import { recordUsage } from './usage.ts';
import { MAX_AI_MARKS, parseBilingualMarks, parseMarkChecks, parseSuggestedMarks, reconcileMarks, refineMarks, type Rect, type SuggestedMark } from '../shared/marks.ts';
import { parseAppearance, type DateCodeAppearance } from '../shared/datecodeAppearance.ts';
import { MAX_CROPS, parseCropRegions, type CropRegion } from '../shared/crop.ts';
import { matchFoundUrls } from '../shared/urls.ts';
import { catalogLine, catalogPaint } from '../shared/paintKnowledge.ts';

export interface ObsDef { key: string; value_type: 'enum' | 'number' | 'boolean' | 'text'; enum_json: string | null; label_en: string }
export interface Suggestion { key: string; value: string | number | boolean; confidence: number }
export interface VisionImage { data: ArrayBuffer; mime: string }

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Default model per provider when the AI_MODEL var is left empty. Bedrock model ids carry the `anthropic.` prefix. */
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', bedrock: 'anthropic.claude-sonnet-5-5', openai: '', gemini: 'gemini-3.8-flash' } as const;
export type AiProvider = keyof typeof DEFAULT_MODEL;

/** Bedrock API keys: long-term ("ABSK…") or short-term ("bedrock-api-key-…"). */
const BEDROCK_KEY = /^(ABSK|bedrock-api-key-)/;
/** The Bedrock API key in use: BEDROCK_API_KEY, or a Bedrock key that was put into ANTHROPIC_API_KEY. */
const bedrockKey = (env: Env): string => {
  const b = cleanKey(env.BEDROCK_API_KEY);
  if (b) return b;
  const a = cleanKey(env.ANTHROPIC_API_KEY);
  return BEDROCK_KEY.test(a) ? a : '';
};
const awsKeys = (env: Env) => (cleanKey(env.AWS_ACCESS_KEY_ID) && cleanKey(env.AWS_SECRET_ACCESS_KEY)
  ? { awsAccessKey: cleanKey(env.AWS_ACCESS_KEY_ID), awsSecretAccessKey: cleanKey(env.AWS_SECRET_ACCESS_KEY), awsSessionToken: cleanKey(env.AWS_SESSION_TOKEN) || null } : null);
export const bedrockRegion = (env: Env): string => env.AWS_REGION?.trim() || 'us-east-1';

/**
 * Provider: AI_PROVIDER if set; else Claude direct for an Anthropic key (sk-ant-…); else Claude in Amazon Bedrock when
 * Bedrock credentials are set (a Bedrock API key — also when it was put into ANTHROPIC_API_KEY — or AWS access keys);
 * else Claude direct for any other ANTHROPIC_API_KEY (the admin check explains a 401); else Gemini.
 */
export const aiProvider = (env: Env): AiProvider | null => {
  const forced = env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === 'anthropic' || forced === 'bedrock' || forced === 'openai' || forced === 'gemini') return forced;
  const a = cleanKey(env.ANTHROPIC_API_KEY);
  if (a.startsWith('sk-ant-')) return 'anthropic';
  if (bedrockKey(env) || awsKeys(env)) return 'bedrock';
  if (a) return 'anthropic';
  if (openaiConfigured(env)) return 'openai';
  return cleanKey(env.GEMINI_API_KEY) ? 'gemini' : null;
};
/** An OpenAI-compatible API needs a key and a model name (there is no safe default model across providers). */
const openaiConfigured = (env: Env) => !!cleanKey(env.OPENAI_API_KEY) && !!env.OPENAI_MODEL?.trim();
export const openaiBase = (env: Env): string => {
  const u = env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1';
  try { const p = new URL(u); return p.protocol === 'https:' ? (p.origin + p.pathname).replace(/\/$/, '') : 'https://api.openai.com/v1'; } catch { return 'https://api.openai.com/v1'; }
};
/** Which providers have credentials: the main one first, then the others as backups (tried in this order). */
const configured = (env: Env): Record<AiProvider, boolean> => {
  const a = cleanKey(env.ANTHROPIC_API_KEY);
  return { anthropic: !!a && !BEDROCK_KEY.test(a), bedrock: !!(bedrockKey(env) || awsKeys(env)), openai: openaiConfigured(env), gemini: !!cleanKey(env.GEMINI_API_KEY) };
};
export function providerChain(env: Env): AiProvider[] {
  const main = aiProvider(env);
  if (!main) return [];
  const has = configured(env);
  return [main, ...(['anthropic', 'bedrock', 'openai', 'gemini'] as const).filter((p) => p !== main && has[p])];
}
/** The model a provider uses: the main provider follows AI_MODEL; backups use their own default / configured model. */
const modelFor = (env: Env, p: AiProvider): string =>
  p === aiProvider(env) ? aiModel(env) ?? '' : p === 'openai' ? env.OPENAI_MODEL?.trim() ?? '' : p === 'gemini' ? env.GEMINI_MODEL?.trim() || DEFAULT_MODEL.gemini : DEFAULT_MODEL[p];
/** Claude (direct or through Bedrock) — everything except Gemini; web search needs Claude direct (not on Bedrock). */
const isClaude = (p: AiProvider | null): p is 'anthropic' | 'bedrock' => p === 'anthropic' || p === 'bedrock';

/** The model id actually used: AI_MODEL if set (prefixed `anthropic.` on Bedrock), else the provider's default. */
export const aiModel = (env: Env): string | null => {
  const p = aiProvider(env);
  if (!p) return null;
  const m = env.AI_MODEL?.trim() || (p === 'openai' ? env.OPENAI_MODEL?.trim() : '');
  if (!m) return DEFAULT_MODEL[p] || null;
  return p === 'bedrock' && !m.startsWith('anthropic.') ? `anthropic.${m}` : m;
};

export const aiConfigured = (env: Env) => aiProvider(env) !== null;

/** The gateway in front of Claude, if one is set (ANTHROPIC_BASE_URL, https only); otherwise Anthropic directly. */
export function gatewayUrl(env: Env): string | null {
  let u = cleanKey(env.ANTHROPIC_BASE_URL);
  if (!u) return null;
  if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u}`; // "api.laalaa.me" typed without the scheme
  try { const p = new URL(u); return p.protocol === 'https:' ? p.origin + p.pathname.replace(/\/$/, '') : null; } catch { return null; }
}
/** A pasted secret often carries a line break, spaces, quotes or "Bearer " — Anthropic and Google then answer 401 / 400. */
export const cleanKey = (v: string | undefined): string => (v ?? '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim();

/** What kind of Anthropic credential is stored (never the key itself), to explain a 401 in the admin check. */
export function anthropicKeyKind(v: string | undefined): { kind: 'api_key' | 'oauth_token' | 'admin_key' | 'bedrock_key' | 'other' | 'missing'; changedByCleaning: boolean } {
  const k = cleanKey(v);
  const kind = !k ? 'missing' : k.startsWith('sk-ant-api') ? 'api_key' : k.startsWith('sk-ant-oat') ? 'oauth_token' : k.startsWith('sk-ant-admin') ? 'admin_key'
    : BEDROCK_KEY.test(k) ? 'bedrock_key' : 'other';
  return { kind, changedByCleaning: !!v && k !== v };
}

/**
 * The Claude client: Anthropic directly, or Claude in Amazon Bedrock (bedrock-mantle endpoint, same Messages API) with
 * the Bedrock API key or SigV4 from the AWS keys — credentials passed explicitly, since Workers have no AWS config files.
 */
const anthropicClient = (env: Env, p: AiProvider | null = aiProvider(env)): Anthropic => {
  if (p === 'bedrock') {
    const key = bedrockKey(env);
    return new AnthropicBedrockMantle({
      awsRegion: bedrockRegion(env),
      ...(key ? { apiKey: key } : { apiKey: null, ...awsKeys(env) }),
    }) as unknown as Anthropic;
  }
  const gw = gatewayUrl(env), key = cleanKey(env.ANTHROPIC_API_KEY);
  // a gateway may read the key from either header (laalaa asks for "Authorization: Bearer"), so send both there
  return new Anthropic({ apiKey: key, ...(gw ? { baseURL: gw, defaultHeaders: { authorization: `Bearer ${key}` } } : {}) });
};

/** Drawing teaching points is the hardest vision task: it uses the strongest Claude model unless AI_MODEL pins one. */
const POINTS_MODEL = 'claude-opus-5-5';
export const pointsModel = (env: Env): string | null => {
  const p = aiProvider(env);
  if (!isClaude(p) || env.AI_MODEL?.trim()) return aiModel(env);
  return p === 'bedrock' ? `anthropic.${POINTS_MODEL}` : POINTS_MODEL;
};

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const toImageMime = (m: string): ImageMime => (['image/png', 'image/gif', 'image/webp'].includes(m) ? m as ImageMime : 'image/jpeg');

/**
 * One vision call returning raw text. Images are sent in order; the caller's prompt says which is which.
 * `maxTokens` is the caller's expected answer size; Claude also thinks before answering, so the request allows more.
 */
export async function callVision(env: Env, system: string, images: VisionImage[], userText: string, maxTokens = 1500, effort: 'low' | 'medium' | 'high' = 'medium', modelOverride?: string): Promise<string> {
  return aiCall(env, { system, turns: [{ role: 'user', content: userText }], images, maxTokens: Math.max(16000, maxTokens), effort, json: true, modelOverride });
}

type CallOpts = { system: string; turns: ChatTurn[]; images: VisionImage[]; maxTokens: number; effort: 'low' | 'medium' | 'high'; json: boolean; modelOverride?: string };

/**
 * One AI answer with automatic backup: the main provider first, then each other provider that has a key
 * (Claude direct / gateway, Claude in Amazon Bedrock, an OpenAI-compatible API, Gemini). A refusal is final;
 * any other failure (bad key, no credit, outage, unknown model) tries the next one. Images go with the last user turn.
 */
async function aiCall(env: Env, o: CallOpts): Promise<string> {
  const chain = providerChain(env);
  if (!chain.length) throw new Error('ai_not_configured');
  let last: Error | null = null;
  for (const [i, p] of chain.entries()) {
    try {
      if (p === 'gemini') return await geminiCall(env, modelFor(env, p), o);
      if (p === 'openai') return await openaiCall(env, modelFor(env, p), o);
      return await claudeCall(env, p, i === 0 && o.modelOverride ? o.modelOverride : modelFor(env, p), o);
    } catch (e) {
      if ((e as Error).message === 'ai_refused') throw e;
      last = e as Error;
      if (i < chain.length - 1) console.error(`ai: ${p} failed (${last.message.slice(0, 160)}); trying ${chain[i + 1]}`);
    }
  }
  throw last ?? new Error('ai_failed');
}

async function claudeCall(env: Env, p: AiProvider, model: string, o: CallOpts): Promise<string> {
  const lastIdx = o.turns.length - 1;
  try {
    const msg = await anthropicClient(env, p).messages.create({
      // Thinking is on by default for current Claude models and counts toward max_tokens.
      model, max_tokens: o.maxTokens, output_config: { effort: o.effort }, system: o.system,
      messages: o.turns.map((t, i) => (o.images.length && i === lastIdx && t.role === 'user'
        ? { role: 'user' as const, content: [
          ...o.images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: toImageMime(im.mime), data: b64(im.data) } })),
          { type: 'text' as const, text: t.content }] }
        : { role: t.role, content: t.content })),
    });
    await recordUsage(env, model, msg.usage);
    if (msg.stop_reason === 'refusal') throw new Error('ai_refused');
    return msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      const why = apiErrorText(e);
      // the stronger model may not be available on this account: try the provider's default model once
      const fallback = modelFor(env, p);
      if (model !== fallback && (e.status === 404 || e.status === 403 || /model/i.test(why))) {
        console.error(`ai: ${model} failed (${why}); using ${fallback}`);
        return claudeCall(env, p, fallback, o);
      }
      console.error(`ai: ${model} failed: ${why}`);
      throw new Error(`ai_http_${e.status ?? 0}: ${why}`);
    }
    throw e;
  }
}

async function geminiCall(env: Env, model: string, o: CallOpts): Promise<string> {
  const lastIdx = o.turns.length - 1;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': cleanKey(env.GEMINI_API_KEY), 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: o.turns.map((t, i) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [
        ...(i === lastIdx ? o.images.map((im) => ({ inline_data: { mime_type: im.mime, data: b64(im.data) } })) : []), { text: t.content }] })),
      ...(o.json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`ai_http_${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: Record<string, number> };
  await recordUsage(env, model, data.usageMetadata);
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

/** Any OpenAI-compatible Chat Completions API (OpenAI, gateways, OpenRouter, DeepSeek…); photos as data URLs. */
async function openaiCall(env: Env, model: string, o: CallOpts): Promise<string> {
  const lastIdx = o.turns.length - 1;
  const res = await fetch(`${openaiBase(env)}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cleanKey(env.OPENAI_API_KEY)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: o.system }, ...o.turns.map((t, i) => (o.images.length && i === lastIdx && t.role === 'user'
        ? { role: 'user', content: [{ type: 'text', text: t.content }, ...o.images.map((im) => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${b64(im.data)}` } }))] }
        : { role: t.role, content: t.content }))],
    }),
  });
  if (!res.ok) {
    // the provider's own message, with any key fragment it echoes masked (never shown or logged)
    const raw = await res.text().catch(() => '');
    let why = raw; try { why = (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? raw; } catch { /* not JSON */ }
    const key = cleanKey(env.OPENAI_API_KEY);
    why = (key ? why.split(key).join('…') : why).replace(/\b(sk|key|gsk|xai)[-_][A-Za-z0-9_*\-.]{3,}/gi, '$1-…');
    throw new Error(`ai_http_${res.status}: ${why.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string | { type?: string; text?: string }[] | null; refusal?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  await recordUsage(env, model, data.usage);
  const m = data.choices?.[0]?.message;
  if (m?.refusal) throw new Error('ai_refused');
  const c = m?.content;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join('') : '';
}

/** The provider's own short error message (e.g. "credit balance too low", "model not found"); never contains the key. */
function apiErrorText(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = (e as { error?: { error?: { message?: string } } }).error;
  return String(body?.error?.message ?? e.message ?? '').replace(/\s+/g, ' ').slice(0, 200);
}

/** Admin check: one tiny call to every configured AI (main first, then the backups), with the time and the provider's error. */
export async function testAi(env: Env): Promise<{ name: string; model: string; ok: boolean; ms: number; error?: string }[]> {
  const out: { name: string; model: string; ok: boolean; ms: number; error?: string }[] = [];
  const run = async (name: string, model: string, fn: () => Promise<string>) => {
    const t = Date.now();
    try { const r = await fn(); out.push({ name, model, ok: r.trim().length > 0, ms: Date.now() - t, ...(r.trim() ? {} : { error: 'empty reply' }) }); }
    catch (e) { out.push({ name, model, ok: false, ms: Date.now() - t, error: String((e as Error).message).slice(0, 240) }); }
  };
  const ask = 'Reply with the single word: ok';
  const tiny = (json: boolean): CallOpts => ({ system: json ? 'Reply in JSON.' : 'Reply briefly.', turns: [{ role: 'user', content: json ? `${ask} as {"r":"ok"}` : ask }], images: [], maxTokens: 2000, effort: 'low', json });
  const main = aiProvider(env);
  for (const p of providerChain(env)) {
    const role = p === main ? 'main' : 'backup';
    const model = modelFor(env, p);
    if (isClaude(p)) {
      const client = anthropicClient(env, p);
      const call = (m: string) => async () => {
        try {
          const r = await client.messages.create({ model: m, max_tokens: 2000, output_config: { effort: 'low' }, messages: [{ role: 'user', content: ask }] });
          return r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
        } catch (e) { if (e instanceof Anthropic.APIError) throw new Error(`ai_http_${e.status ?? 0}: ${apiErrorText(e)}`); throw e; }
      };
      const via = p === 'bedrock' ? ` via Amazon Bedrock (${bedrockRegion(env)}, ${bedrockKey(env) ? 'API key' : 'AWS keys'})`
        : gatewayUrl(env) ? ` via ${new URL(gatewayUrl(env)!).host}` : '';
      await run(`Claude${via} · ${role}`, model, call(model));
      const pm = p === main ? pointsModel(env) : null;
      if (pm && pm !== model) await run(`Claude${via} · ${role} (drawing points)`, pm, call(pm));
    } else if (p === 'openai') {
      await run(`OpenAI-compatible (${new URL(openaiBase(env)).host}) · ${role}`, model, () => openaiCall(env, model, tiny(false)));
    } else {
      await run(`Gemini · ${role}`, model, () => geminiCall(env, model, tiny(true)));
    }
  }
  return out;
}

export type OutLang = 'km' | 'en' | 'vi' | 'th' | 'id';
export const OUT_LANGS: OutLang[] = ['km', 'en', 'vi', 'th', 'id'];
const LANG_NAME: Record<OutLang, string> = { km: 'Khmer (ភាសាខ្មែរ)', en: 'English', vi: 'Vietnamese (Tiếng Việt)', th: 'Thai (ภาษาไทย)', id: 'Indonesian (Bahasa Indonesia)' };
const IN_PHOTO: Record<OutLang, string> = { km: 'ក្នុងរូបនេះ៖', en: 'In this photo:', vi: 'Trong ảnh này:', th: 'ในภาพนี้:', id: 'Di foto ini:' };
/**
 * Output language + teaching style for every human-readable field the AI writes.
 * Codes, brand words and stamped text stay exactly as written on the item.
 */
export function langRule(lang: OutLang = 'km'): string {
  return ` Write every human-readable text value (labels, notes, summaries, descriptions) in ${LANG_NAME[lang]}. ` +
    `Teach, do not analyse: first say what a learner should check and how, then start a new line with "${IN_PHOTO[lang]}" and say what this photo shows. ` +
    'Keep brand names, codes, stamped words and letters exactly as written on the item (e.g. LOUIS VUITTON, CA4109). JSON keys stay in English.';
}

/** One Gemini generateContent call returning JSON text. */
async function callGemini(env: Env, model: string, system: string, images: VisionImage[], userText: string): Promise<string> {
  return geminiCall(env, model, { system, turns: [{ role: 'user', content: userText }], images, maxTokens: 4000, effort: 'low', json: true });
}

const NO_VERDICT = 'Never state or imply whether an item is authentic or counterfeit. Describe only what is visibly present. If something is not clearly visible, omit it.';

/**
 * AI *observation* suggestions. The model describes only; results are stored as source='ai_suggested'
 * and do NOT count until an appraiser confirms each one.
 */
export async function suggestObservations(env: Env, image: ArrayBuffer, mime: string, defs: ObsDef[]): Promise<Suggestion[]> {
  const spec = defs.map((d) => `- ${d.key} (${d.value_type}${d.enum_json ? ', one of ' + d.enum_json : ''}): ${d.label_en}`).join('\n');
  const text = await callVision(env,
    `You are an optical inspection assistant. ${NO_VERDICT} Reply with JSON only: [{"key":"...","value":...,"confidence":0..1}] using exactly the keys and allowed values provided.`,
    [{ data: image, mime }], `Observation keys you may fill:\n${spec}`, 800);
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  let arr: Suggestion[] = [];
  try { arr = JSON.parse(json); } catch { return []; }
  const byKey = new Map(defs.map((d) => [d.key, d]));
  return arr.filter((s) => {
    const d = byKey.get(s.key);
    if (!d) return false;
    if (d.value_type === 'enum') return (JSON.parse(d.enum_json ?? '[]') as string[]).includes(String(s.value));
    if (d.value_type === 'number') return typeof s.value === 'number';
    if (d.value_type === 'boolean') return typeof s.value === 'boolean';
    return typeof s.value === 'string';
  }).map((s) => ({ ...s, confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)) }));
}

export interface Difference { feature: string; inspected: string; reference: string; note?: string; photoCaveat?: string }

/** Explain visible differences between ONE inspected photo and N approved reference photos. Never a verdict, never a percentage. */
export async function explainDifferences(env: Env, inspected: VisionImage, refs: VisionImage[], component: string, lang: OutLang = 'km'): Promise<{ differences: Difference[]; summary: string }> {
  const text = await callVision(env,
    `You are an optical comparison assistant for luxury-goods appraisers. ${NO_VERDICT} Do not output scores or percentages. Image 1 is the INSPECTED item; the remaining images are approved REFERENCE photos of the same component. ` +
    `List concrete visible differences and similarities in features such as letter shape and spacing, depth and edge sharpness, finish and colour tone, symbols, texture, alignment. ` +
    `For each, mention if lighting, angle, or resolution could explain it (photoCaveat). Reply with JSON only: {"summary":"one or two neutral sentences","differences":[{"feature":"...","inspected":"...","reference":"...","note":"...","photoCaveat":"..."}]}` + langRule(lang),
    [inspected, ...refs], `Component: ${component}. Compare image 1 against the ${refs.length} reference image(s).`, 1800);
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const o = JSON.parse(json) as { summary?: string; differences?: Difference[] };
    return { summary: String(o.summary ?? ''), differences: (o.differences ?? []).filter((d) => d && d.feature).slice(0, 20) };
  } catch { return { summary: '', differences: [] }; }
}

/**
 * Propose up to 4 small regions of ONE photo that are worth a close look (letters, screws, stitches, edges).
 * Where to look only: no verdict. Results are stored as source='ai_suggested' marks and never feed the engine.
 */
export async function suggestFocusRegions(env: Env, image: VisionImage, component: string, shot: string): Promise<SuggestedMark[]> {
  const text = await callVision(env,
    `You help a luxury-goods appraiser decide where to zoom in on a photo. ${NO_VERDICT} ` +
    `Return up to ${MAX_AI_MARKS} small rectangles around details an expert would inspect closely (engraved or stamped characters, logo shapes, screw heads, stitch rows, edges, plating wear). ` +
    `Coordinates are fractions of the image width/height (0..1) with the origin at the top-left. Labels name the detail neutrally (e.g. "Serial plate characters"), max 60 characters. ` +
    `Reply with JSON only: [{"label":"...","x":0..1,"y":0..1,"w":0..1,"h":0..1}]`,
    [image], `Component: ${component}. Shot: ${shot}.`, 600);
  return parseSuggestedMarks(text);
}

/**
 * Teaching points on a REFERENCE photo: up to 4 boxes, each with a short explanation of what a learner should check
 * there. The admin's prompt/note steers it (e.g. "point at the date code and explain each character").
 * Teaching only: stored as source='ai_suggested' reference points, never read by the engine.
 */
export async function suggestTeachingPoints(env: Env, image: VisionImage, ctx: {
  model: string; part?: string | null; title?: string | null; note?: string | null; prompt?: string | null;
  /** the uploader's own label; never a verdict from the AI */
  label?: 'authentic' | 'counterfeit' | 'unknown' | null;
  /** a genuine reference photo of the same part: compared against when the photo is labelled counterfeit, otherwise for orientation */
  reference?: VisionImage | null;
  lang?: OutLang;
  brand?: string | null;
  /** what HENGZ experts already teach for this brand / model / part (curated points, approved code guide) */
  knowledge?: string[];
  /** points already on this photo: do not repeat them */
  existing?: (Rect & { label: string })[];
}): Promise<SuggestedMark[]> {
  const compare = ctx.label === 'counterfeit' && !!ctx.reference;
  const orient = !compare && !!ctx.reference;
  const task = compare
    ? `Image 1 was labelled by the uploader as a counterfeit example; image 2 is a genuine reference of the same part. ` +
      `Box up to ${MAX_AI_MARKS} places on IMAGE 1 where a visible detail differs from image 2 (letter shape or spacing, stamp depth, stitch count or angle, ` +
      `hardware finish or engraving, alignment, colour). For each, the note says what image 1 shows, what image 2 shows, and how a learner can see it; ` +
      `mention when lighting, angle or resolution could explain the difference. Use the uploader's label as given; do not judge it yourself.`
    : `Box up to ${MAX_AI_MARKS} details on the photo that a learner should study (stamps, date codes, letter shapes, stitches, hardware engraving, edges). ` +
      `The note explains what to look at there and how to read it; if the admin's instructions explain a code or detail, use that explanation.` +
      (orient ? ' Image 2 is a genuine reference photo of the same part, only to help you recognise the parts: draw every box on IMAGE 1.' : '');
  // expert context: what HENGZ already teaches for this model / part, and points already on the photo
  const knowledge = (ctx.knowledge ?? []).filter(Boolean).slice(0, 14);
  const existing = ctx.existing ?? [];
  const context =
    (knowledge.length ? `\nWhat HENGZ experts already teach for this brand / model / part (prefer these checkpoints when they are visible, and stay consistent with them):\n- ${knowledge.join('\n- ')}` : '') +
    (existing.length ? `\nPoints already on this photo (do not repeat them; choose other details): ${existing.map((p) => p.label).join('; ')}` : '');
  const text = await callVision(env,
    `You are a senior luxury-bag authenticator teaching a trainee from a photo. ${NO_VERDICT} ${task} ` +
    `Choose at most ${MAX_AI_MARKS} details that are clearly visible and worth learning, the most diagnostic first: where an expert would look for this brand and part ` +
    '(e.g. stamp lettering and spacing, date code characters, stitch count and angle, hardware engraving and screws, edge paint, zipper pull markings). ' +
    'Each box covers ONE detail, not the whole bag or a large area; no two boxes on the same detail. First locate the detail in words (where it is in the image), then give its box. For each: ' +
    'BOX — a tight rectangle around exactly that detail (x, y = top-left corner; x, y, w, h are fractions 0..1 of IMAGE 1\'s width and height). ' +
    'Before answering, check each box really contains the named detail; if you are unsure where it is, leave that detail out. ' +
    'LABEL — 2 to 5 words naming the detail (e.g. "Star-head screw", "Heat stamp lettering"). ' +
    'NOTE — two short lines, easy to remember. Line 1 (max 14 words): what an experienced authenticator checks there and why, using real trade knowledge ' +
    '(for example: some brands use proprietary screw heads that ordinary repair tools cannot turn; Louis Vuitton heat stamps have very round O\'s and close double T\'s). ' +
    'Line 2 (max 10 words) starts with "In this photo:" and says what is visible here. No generic advice about lighting or resolution unless it hides the detail. ' +
    'Write every label and note in BOTH English and Khmer. Khmer must be natural, simple Khmer, not word for word; its second line starts with "ក្នុងរូបនេះ៖". Separate the two lines with a line break. ' +
    'Keep brand names, codes and stamped words exactly as written on the item. ' +
    'Reply with JSON only: [{"where":"short words on where it is","x":0..1,"y":0..1,"w":0..1,"h":0..1,"label_en":"...","note_en":"...","label_km":"...","note_km":"..."}]',
    compare || orient ? [image, ctx.reference!] : [image],
    `${ctx.brand ? `Brand: ${ctx.brand}. ` : ''}Model: ${ctx.model}.${ctx.part ? ` Part: ${ctx.part}.` : ''}${ctx.title ? ` Photo: ${ctx.title}.` : ''}` +
    `${ctx.label ? ` Uploader label: ${ctx.label}.` : ''}${ctx.note ? `\nAdmin note: ${ctx.note}` : ''}${ctx.prompt ? `\nAdmin instructions: ${ctx.prompt}` : ''}${context}`,
    16000, 'high', pointsModel(env) ?? undefined);
  // drop boxes that cover most of the photo or repeat another point
  const marks = refineMarks(parseBilingualMarks(text), existing);
  if (!marks.length) return marks;
  // second look: the AI finds each named detail again; boxes it cannot place twice are dropped (see reconcileMarks)
  try { return reconcileMarks(marks, await recheckMarks(env, image, marks, pointsModel(env) ?? undefined)); }
  catch (e) { console.error('teaching points recheck:', (e as Error).message); return marks; }
}

/**
 * Second look at AI boxes on ONE photo: for each named detail, is it visible, and where exactly. The first boxes
 * are not shown to the model as the answer, only the detail names and where they were said to be, so the two
 * placements are independent enough to compare. Position only: no verdict, no new details, no text changes.
 */
async function recheckMarks(env: Env, image: VisionImage, marks: SuggestedMark[], model?: string) {
  const text = await callVision(env,
    `You check where details are on a photo of a luxury bag part. ${NO_VERDICT} ` +
    'For each numbered detail, look for it in the image. If it is clearly visible, give a tight rectangle around exactly that detail ' +
    '(x, y = top-left corner; x, y, w, h are fractions 0..1 of the image width and height, origin at the top-left). ' +
    'If it is not visible, or you cannot tell where it is, set "found": false and give no rectangle. Do not guess. Do not add details. ' +
    'Reply with JSON only: [{"i":0,"found":true,"x":0..1,"y":0..1,"w":0..1,"h":0..1},{"i":1,"found":false}]',
    [image], marks.map((m, i) => `${i}: ${m.i18n?.en?.label ?? m.label}`).join('\n'), 800, 'medium', model);
  return parseMarkChecks(text);
}

/**
 * Describe what a date code LOOKS like: shape, size, font, spacing, alignment, depth, placement.
 * Image 1 is the photo to describe; any further images are reference date-code photos of the same brand.
 * Descriptive only, no verdict, no score. Millimetre sizes are kept only when a ruler/scale is visible.
 */
export async function analyzeDateCodeAppearance(env: Env, image: VisionImage, refs: VisionImage[], ctx: { brand: string; model?: string | null; typed?: string | null; lang?: OutLang }): Promise<DateCodeAppearance | null> {
  const text = await callVision(env,
    `You describe the physical appearance of a luxury-goods date code for a teaching tool. ${NO_VERDICT} Never give scores or percentages. ` +
    `Image 1 is the date code to describe.${refs.length ? ` Images 2..${refs.length + 1} are reference date-code photos of the same brand for comparison; date codes legitimately vary by era, factory, model and item size, so only point out concrete visible differences.` : ''} ` +
    `Describe: exact transcription ('?' for unreadable characters); number of characters; number of lines or separate parts; method (heat_stamped, embossed, printed, engraved or unclear); placement on the item; surface material; ` +
    `font (serif or sans-serif, narrow or wide, stroke thickness, shapes of distinctive digits such as 0, 1, 4, 7); size relative to nearby features; ` +
    `character height in millimetres ONLY if a ruler or scale is visible (otherwise null and scaleVisible false); spacing between characters; baseline alignment and centring; pressed depth, edge sharpness and any foil or ink fill; ` +
    `photo problems (blur, glare, angle, crop) that limit what can be seen. Use short, plain sentences a beginner understands. ` +
    `Reply with JSON only: {"transcription":"","characterCount":0,"lines":1,"method":"","placement":"","surface":"","font":"","size":"","sizeMm":null,"scaleVisible":false,"spacing":"","alignment":"","depthEdges":"","differences":[{"feature":"","inspected":"","reference":"","photoCaveat":""}],"photoIssues":[""],"summary":""}` + langRule(ctx.lang) + ' The transcription field is the code exactly as visible.',
    [image, ...refs],
    `Brand: ${ctx.brand}.${ctx.model ? ` Model: ${ctx.model}.` : ''}${ctx.typed ? ` The appraiser typed the code as: ${ctx.typed}.` : ''}`,
    1800);
  return parseAppearance(text);
}

/**
 * Find the separate photos inside one composite image (comparison chart, collage) so each can become its own post.
 * Only geometry plus the printed caption next to each photo, transcribed as written: never a judgement of the item.
 */
export async function findPhotoRegions(env: Env, image: VisionImage, partCodes: string[]): Promise<CropRegion[]> {
  const text = await callVision(env,
    `You split a composite image into its separate photos. ${NO_VERDICT} ` +
    `Return one rectangle per distinct photograph (up to ${MAX_CROPS}); skip text-only areas, arrows, logos and borders. ` +
    `Each rectangle should tightly contain the photo itself, without the surrounding caption. ` +
    `"caption" is the printed text that labels that photo in the image (e.g. a heading above or below it), copied exactly, or "" if none - do not invent one. ` +
    `"part" is the bag part the photo shows, one of: ${partCodes.join(', ')}; or null if unclear. ` +
    `Coordinates are fractions of the image width/height (0..1), origin top-left. ` +
    `Reply with JSON only: [{"x":0..1,"y":0..1,"w":0..1,"h":0..1,"caption":"...","part":"..."}]`,
    [image], 'Find each photo in this image.', 1500);
  return parseCropRegions(text, partCodes);
}

export interface StyleIdentification {
  found: boolean; model_name: string | null; colour: string | null; product_url: string | null;
  sources: string[]; note: string | null;
}

/**
 * Look up which product a brand style / article code belongs to, using Claude's web search.
 * Identification only (model name, colour, product page) — never a judgement of whether an item is genuine.
 * Needs the Anthropic provider (web search is a Claude server tool).
 */
export async function identifyStyleCode(env: Env, brand: string, code: string, hint: string, lang: OutLang = 'km'): Promise<StyleIdentification> {
  if (aiProvider(env) !== 'anthropic') throw new Error('web_search_needs_claude');
  const client = anthropicClient(env);
  const system =
    `You identify luxury-goods products from their style / article code. ${NO_VERDICT} ` +
    'Search the web for the exact code. Prefer the brand\'s official site, then large resellers. ' +
    'Only report a model if a page shows this exact code (or the same code without the last colour/size part, then say so in note). Never guess. ' +
    'Reply with JSON only: {"found":true|false,"model_name":"...","colour":"...","product_url":"...","sources":["url",...],"note":"..."}. ' +
    `Keep model_name exactly as the brand writes it; write note in ${LANG_NAME[lang]}.`;
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Brand: ${brand}\nCode: ${code}\nWhat the code parts suggest: ${hint || 'unknown'}` }];
  let msg: Anthropic.Message | null = null;
  // a long server-side search can pause; send the turn back so the server resumes it
  for (let i = 0; i < 3; i++) {
    try {
      msg = await client.messages.create({
        model: aiModel(env)!, max_tokens: 16000, output_config: { effort: 'medium' }, system, messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      });
      await recordUsage(env, msg.model, msg.usage);
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new Error(`ai_http_${e.status ?? 0}`);
      throw e;
    }
    if (msg.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: msg.content });
  }
  if (!msg) throw new Error('ai_failed');
  if (msg.stop_reason === 'refusal') throw new Error('ai_refused');
  const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: Record<string, unknown> = {};
  try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : {}; } catch { o = {}; }
  const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const url = (v: unknown) => { const s = str(v, 500); return s && /^https?:\/\//.test(s) ? s : null; };
  const sources = (Array.isArray(o.sources) ? o.sources : []).map(url).filter((x): x is string => !!x).slice(0, 6);
  const model_name = str(o.model_name, 160);
  return { found: o.found === true && !!model_name, model_name, colour: str(o.colour, 80), product_url: url(o.product_url), sources, note: str(o.note, 400) };
}

/** Translate existing teaching points so each has English and Khmer. Text only; meaning and codes unchanged. */
export async function translatePoints(env: Env, items: { id: string; label: string; note: string | null }[]): Promise<Record<string, { en: { label: string; note?: string }; km: { label: string; note?: string } }>> {
  // translation is plain text work: use Gemini when its key is set (fast and cheap), otherwise the main AI
  const system = 'You translate short teaching notes about luxury bags between English and Khmer, making each one short and easy to remember (a learner reads it on a phone). Keep the meaning, keep brand names, codes and stamped words exactly as written, ' +
    'keep line breaks. If a note has a line starting "In this photo:" the Khmer line starts "ក្នុងរូបនេះ៖" and vice versa. Natural Khmer, not word for word. ' +
    'Reply with JSON only: [{"id":"...","label_en":"...","note_en":"...","label_km":"...","note_km":"..."}] — one entry per input id.';
  const input = JSON.stringify(items.map((i) => ({ id: i.id, label: i.label, note: i.note ?? '' })));
  type Tr = Record<string, { en: { label: string; note?: string }; km: { label: string; note?: string } }>;
  const ids = new Set(items.map((i) => i.id));
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const read = (text: string): Tr => {
    const a = text.indexOf('['), b = text.lastIndexOf(']');
    let arr: Record<string, unknown>[] = [];
    try { arr = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : []; } catch { arr = []; }
    const out: Tr = {};
    for (const o of Array.isArray(arr) ? arr : []) {
      const id = s(o?.id, 80);
      if (!ids.has(id) || !s(o.label_en, 80) || !s(o.label_km, 80)) continue;
      out[id] = {
        en: { label: s(o.label_en, 80), ...(s(o.note_en, 1000) ? { note: s(o.note_en, 1000) } : {}) },
        km: { label: s(o.label_km, 80), ...(s(o.note_km, 1000) ? { note: s(o.note_km, 1000) } : {}) },
      };
    }
    return out;
  };
  // Gemini first when its key is set (fast, cheap); if it fails or gives nothing usable, Claude translates instead
  let out: Tr = {};
  if (env.GEMINI_API_KEY) {
    try { out = read(await callGemini(env, env.GEMINI_MODEL?.trim() || DEFAULT_MODEL.gemini, system, [], input)); }
    catch (e) { console.error('translate: gemini failed, falling back to claude:', (e as Error).message); }
  }
  if (!Object.keys(out).length && isClaude(aiProvider(env))) out = read(await callVision(env, system, [], input, 16000, 'low'));
  if (!Object.keys(out).length) throw new Error('ai_translate_failed');
  return out;
}

export interface GuideText { title: string; intro: string; steps: string[] }
export type ModelGuide = { km: GuideText; en: GuideText };

const cleanGuide = (v: any): GuideText | null => {
  const s = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
  const steps = Array.isArray(v?.steps) ? v.steps.map((x: unknown) => s(x, 240)).filter(Boolean).slice(0, 6) : [];
  const g = { title: s(v?.title, 120), intro: s(v?.intro, 400), steps };
  return g.title && g.steps.length ? g : null;
};
export const parseModelGuide = (raw: unknown): ModelGuide | null => {
  const km = cleanGuide((raw as any)?.km); const en = cleanGuide((raw as any)?.en);
  return km && en ? { km, en } : null;
};

/**
 * A short "how to look at this model" guide for an album, written from the album's own teaching points.
 * Teaching text only: where to look and what to compare against references — never a verdict.
 */
export async function writeModelGuide(env: Env, ctx: { brand: string; model: string; points: { part: string | null; label: string; note: string | null }[] }): Promise<ModelGuide | null> {
  const system = `You are a senior luxury-bag authenticator writing a short study guide for one bag model, for learners reading on a phone. ${NO_VERDICT} ` +
    'Use only the teaching points provided (they were checked by staff); do not invent features, codes or dates. ' +
    'Write 3 to 5 steps, in the order an expert inspects the bag (overall shape → logo/stamp → serial/date code → material → hardware → zipper). ' +
    'Each step is one short line: the part, then exactly what to look at and compare with references. ' +
    'Write it in English and in natural Khmer (not word for word); keep brand names, codes and stamped words exactly as written. ' +
    'Reply with JSON only: {"en":{"title":"How to look at <model>","intro":"one sentence","steps":["..."]},"km":{"title":"...","intro":"...","steps":["..."]}}';
  const input = JSON.stringify({ brand: ctx.brand, model: ctx.model, points: ctx.points.slice(0, 60) });
  const text = env.GEMINI_API_KEY && !isClaude(aiProvider(env))
    ? await callGemini(env, env.GEMINI_MODEL?.trim() || DEFAULT_MODEL.gemini, system, [], input)
    : await callVision(env, system, [], input, 3000, 'medium');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  try { return a >= 0 && b > a ? parseModelGuide(JSON.parse(text.slice(a, b + 1))) : null; } catch { return null; }
}

/** Which of the brand's models a loose photo most likely shows (to suggest an album). Identification of the model only. */
export async function suggestModelForPhoto(env: Env, image: VisionImage, brand: string, models: { id: string; name: string }[]): Promise<{ modelId: string | null; confidence: number; reason: string }> {
  const text = await callVision(env,
    `You identify which bag model a photo shows, from a fixed list, so the photo can be filed in the right album. ${NO_VERDICT} ` +
    'If the photo is a close-up that could belong to several models, or the model is unclear, answer null. ' +
    'Reply with JSON only: {"model_id": "<id from the list>" | null, "confidence": 0..1, "reason": "one short English sentence on the visible shape/feature used"}',
    [image], `Brand: ${brand}\nModels: ${JSON.stringify(models.map((m) => ({ id: m.id, name: m.name })))}`, 600, 'low');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null; try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const id = typeof o?.model_id === 'string' && models.some((m) => m.id === o.model_id) ? o.model_id : null;
  const conf = Math.max(0, Math.min(1, Number(o?.confidence) || 0));
  return { modelId: id, confidence: id ? conf : 0, reason: typeof o?.reason === 'string' ? o.reason.slice(0, 200) : '' };
}

/**
 * AI analysis of a verification request, for the experts: each customer photo is compared with a reference photo of
 * the same part; per feature "matches / differs / unclear" with confidence, then ONE suggested outcome from the
 * system's four. The expert decides; the customer never sees this.
 */
export async function assessVerification(env: Env, ctx: {
  brand: string; model: string | null;
  photos: { step: string; image: VisionImage }[];
  refs: { step: string; image: VisionImage; model: string | null }[];
  knowledge: string[]; expertNotes: string[]; skills?: string[];
}): Promise<string> {
  const images: VisionImage[] = [];
  const lines: string[] = [];
  for (const p of ctx.photos) { images.push(p.image); lines.push(`Image ${images.length}: CUSTOMER photo · step "${p.step}"`); }
  for (const r of ctx.refs) { images.push(r.image); lines.push(`Image ${images.length}: REFERENCE photo (from HENGZ library${r.model ? `, ${r.model}` : ''}) · step "${r.step}"`); }
  const system =
    'You are a senior luxury-bag authenticator ASSISTING a human expert at HENGZ AUTHENTIC. The expert makes the decision; you prepare the evidence. ' +
    'Never write the words authentic, genuine, real, fake, counterfeit or replica, and never state whether the bag is genuine. ' +
    'For each customer photo, compare the visible features with the reference photo of the same step (stamp lettering and spacing, serial/date code characters and font, ' +
    'stitch count, angle and colour, hardware engraving, screws and finish, material grain, zipper pull and markings, shape and proportions). ' +
    'For each feature give status "matches" (consistent with the reference), "differs" (a visible difference from the reference) or "unclear" (not visible enough, ' +
    'different angle or lighting, or no reference), with your confidence 0..1 in THAT observation. Lighting, angle and resolution often explain differences: say so. ' +
    'Then suggest ONE outcome: "consistent_with_references" (all key features match), "concerns_found" (one or more clear differences on key features), ' +
    '"insufficient_evidence" (key photos missing or too unclear) or "requires_expert_review" (mixed or uncertain), with your confidence 0..1 in that suggestion. ' +
    'Write feature names and notes in English and natural Khmer. Keep brand names and codes exactly as written. ' +
    'Reply with JSON only: {"suggestion":"…","confidence":0..1,"summary_en":"2-3 sentences","summary_km":"…","findings":[{"step":"model|logo|serial|material|hardware|zipper|extra","feature_en":"…","feature_km":"…","status":"matches|differs|unclear","confidence":0..1,"note_en":"one short line","note_km":"…"}]}';
  const user = [
    `Brand: ${ctx.brand}${ctx.model ? ` · Model: ${ctx.model}` : ''}`,
    ...lines,
    ctx.skills?.length ? `Shop knowledge approved by staff for this brand / model (checkpoints to compare; it never decides the outcome):\n- ${ctx.skills.join('\n- ')}` : '',
    ctx.knowledge.length ? `What HENGZ experts teach for this brand / model (prefer these checkpoints):\n- ${ctx.knowledge.slice(0, 14).join('\n- ')}` : '',
    ctx.expertNotes.length ? `Notes HENGZ experts wrote on earlier bags of this brand / model (learn what they look at; do not copy their decisions):\n- ${ctx.expertNotes.slice(0, 8).join('\n- ')}` : '',
  ].filter(Boolean).join('\n');
  return callVision(env, system, images, user, 16000, 'high', pointsModel(env) ?? undefined);
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/**
 * Anajak Secondhand AI assistant: answers questions about second-hand luxury bags (market, care, repair,
 * materials, history, how experts inspect). Teaching only: it never says whether a particular bag is
 * genuine or counterfeit, and only quotes market figures from the staff-entered data it is given.
 */
export async function chatAssistant(env: Env, turns: ChatTurn[], lang: OutLang, ctx: { market: string; skills: string; app: string }, image: VisionImage | null = null): Promise<string> {
  const system = [
    'You are Anajak, the AI work assistant of second-hand designer bag vendors at the Cambodia–Thailand border market (Aran / Rong Kluea) who sell to Thai, Malaysian and Indonesian resellers.',
    'They already know the market. Help them get the work done: repainting and recolouring by leather type, cleaning and repair, recognising brands / models / materials / hardware, date codes, what to photograph to check a bag, and selling. Give direct, practical answers (what to do, with what, in which order), not lectures.',
    'Hard rules:',
    '1. Never state, imply or estimate whether a specific bag, photo or listing is authentic, genuine, real, fake, counterfeit or a replica, and never give a probability or percentage. If asked, say which points to look at and suggest the Check skill of the app, where the photos of the bag are compared with reference photos (and, when expert review is on, a named human expert answers).',
    '2. Never invent market numbers, rankings, prices or statistics. For current market facts, use only the "Market data" below; if it has nothing relevant, say there is no data yet and explain general factors instead.',
    '3. For repair and chemical work (dyes, solvents, edge paint), give safety notes and suggest testing on a hidden spot first; say when a professional should do it.',
    '4. Never help make, label or sell counterfeit goods, or remove or alter serial numbers, date codes or brand marks.',
    `Answer in ${LANG_NAME[lang]} unless the user writes in another language, then use theirs. Keep brand names, model names and codes as written. Be concise and practical; use short lists when steps help.`,
    'If a photo is attached, describe only what is visible in it and say when something cannot be seen clearly.',
    '',
    'Market data (entered by the Anajak Bag team, with sources):',
    ctx.market || '(no data yet)',
    ...(ctx.skills ? ['', 'Shop knowledge (written and approved by the Anajak Bag team). Prefer it over general knowledge and use its facts, prices and steps as given; it never overrides the hard rules above:', ctx.skills] : []),
    ...(ctx.app ? ['', 'In the app (point the user to these when they help):', ctx.app] : []),
  ].join('\n');
  return runChat(env, system, turns, 8000, image);
}

/** One chat completion with the configured provider (Claude or Gemini); token use is recorded. */
async function runChat(env: Env, system: string, turns: ChatTurn[], maxTokens = 8000, image: VisionImage | null = null): Promise<string> {
  return aiCall(env, { system, turns, images: image ? [image] : [], maxTokens, effort: 'low', json: false });
}

export interface SkillDraft { title: string; body: string; keywords: string; brand: string | null }

/**
 * Turn a seller's rough notes (any language, voice-typed, unordered) into one clean AI skill for STAFF to check
 * and activate: a short title, clear knowledge lines, and keywords that tell the assistant when to use it.
 * It keeps the seller's own facts and numbers and adds nothing it was not told.
 */
export async function draftSkill(env: Env, x: { notes: string; area: string; lang: OutLang }): Promise<SkillDraft> {
  const text = await callVision(env,
    'You turn a second-hand bag seller\'s rough notes into one piece of shop knowledge for an AI assistant (a "skill"). ' +
    'Keep every fact, number, price, place and name from the notes exactly; do not add facts, prices or statistics that are not in the notes; ' +
    'remove repetition; write short clear lines (one fact or step per line, "- " bullets). ' +
    'Never write that a bag is authentic, genuine, fake, counterfeit or a replica, and drop any note that asks to make, label or sell counterfeit goods or to alter serial numbers, date codes or logos. ' +
    'keywords: 3-10 short words or names (comma separated, mixing Khmer, Thai and English where useful) a user would type when this knowledge helps. ' +
    'brand: the single designer brand the notes are about, or null when they are general. ' +
    `Write title and body in ${LANG_NAME[x.lang]}; keep brand, model and product names as written. ` +
    'Reply with JSON only: {"title":"…","body":"…","keywords":"…","brand":string|null}',
    [], `Where the AI will use it: ${x.area}\nNotes:\n${x.notes}`, 2000, 'low');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null; try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const title = s(o?.title, 120), body = s(o?.body, 4000);
  if (title.length < 3 || body.length < 10) throw new Error('ai_empty');
  return { title, body, keywords: s(o?.keywords, 300), brand: s(o?.brand, 80) || null };
}

export interface CareDraft { summary: string; materials: string; safety: string; minutes: number | null; steps: { body: string; tip: string | null }[] }

/**
 * Draft of a bag painting / repair / care lesson for STAFF to check and edit before publishing (stored with
 * ai_drafted = 1, status 'draft'). Practical workshop steps only; it never comments on whether a bag is genuine.
 */
export async function draftCareLesson(env: Env, x: { topic: string; level: string; title: string; lang: OutLang }): Promise<CareDraft> {
  const text = await callVision(env,
    'You write practical workshop lessons for people who clean, repaint and repair second-hand leather and canvas bags for resale in Southeast Asia. ' +
    'Give realistic steps a beginner can follow with materials sold in Thai and Cambodian markets. Always include safety (ventilation, gloves, test on a hidden spot first) and say when a professional should do the work. ' +
    'Never say or imply whether a bag is authentic or counterfeit, and never explain how to add, copy or alter brand logos, serial numbers or date codes. ' +
    'Reply with JSON only: {"summary":"2 sentences","materials":"one item per line","safety":"short paragraph","minutes":number,"steps":[{"body":"one clear action","tip":"optional short tip or empty"}]} with 5 to 10 steps.' +
    ` Write all text in ${LANG_NAME[x.lang]}; keep product and brand names as written.`,
    [], `Lesson title: ${x.title}\nTopic: ${x.topic}\nLevel: ${x.level}`, 3000, 'medium');
  const o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Partial<CareDraft>;
  const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
  const steps = (Array.isArray(o.steps) ? o.steps : []).map((st) => ({ body: s(st?.body, 2000), tip: s(st?.tip, 600) || null })).filter((st) => st.body.length >= 3).slice(0, 15);
  if (!steps.length) throw new Error('ai_empty');
  const m = Number(o.minutes);
  return { summary: s(o.summary, 800), materials: s(o.materials, 1500), safety: s(o.safety, 1000), minutes: Number.isFinite(m) && m >= 1 && m <= 1440 ? Math.round(m) : null, steps };
}

export interface PaintResearch { info: string; sources: { title: string; url: string }[]; model: string }

/**
 * Look a paint / dye / finisher up on the web (Claude web search) and summarise how it is used on bags.
 * A DRAFT for staff: they read it and copy what is right into the product. Only links that really came back
 * from the search are kept as sources. Needs ANTHROPIC_API_KEY (the web search tool is Claude-only);
 * each call allows at most 5 searches.
 */
export async function researchPaintProduct(env: Env, x: { brand: string; name: string; kind: string; lang: OutLang }): Promise<PaintResearch> {
  if (aiProvider(env) !== 'anthropic') throw new Error('ai_web_not_configured');
  const model = aiModel(env)!;
  const client = anthropicClient(env);
  const system =
    'You research leather paints, dyes, edge paints and finishers for people who restore second-hand bags in Cambodia and Thailand. ' +
    'Use web search to find the manufacturer\'s own pages and reliable guides about THIS exact product. ' +
    'Report only what the sources say: what it is, which surfaces it suits, how to prepare and apply it, how it can be mixed or thinned, drying and finishing, and safety. ' +
    'If the sources do not cover something, say it is not stated. Never invent mixing ratios or colour formulas. ' +
    'Never say whether any bag is authentic or counterfeit. ' +
    `Write the text in ${LANG_NAME[x.lang]}; keep product names as written. ` +
    'Finish with JSON only: {"info":"the summary as short paragraphs and lists, max 2500 characters","sources":[{"title":"...","url":"..."}]}';
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Product: ${x.brand} ${x.name}\nType: ${x.kind}` }];
  const found = new Map<string, string>();
  let final: Anthropic.Beta.BetaMessage | null = null;
  try {
    for (let turn = 0; turn < 4 && !final; turn++) {
      const r = await client.beta.messages.create({
        model, max_tokens: 16000, output_config: { effort: 'medium' }, system, messages,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      });
      await recordUsage(env, r.model, r.usage);
      for (const b of r.content) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
          for (const res of b.content) if (res.type === 'web_search_result') found.set(res.url, res.title);
        }
      }
      if (r.stop_reason === 'refusal') throw new Error('ai_refused');
      if (r.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
      final = r;
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) { console.error(`paint research: ${model} failed: ${apiErrorText(e)}`); throw new Error(`ai_http_${e.status ?? 0}`); }
    throw e;
  }
  if (!final) throw new Error('ai_unfinished');
  const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let o: { info?: unknown; sources?: { title?: unknown; url?: unknown }[] } = {};
  try { o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { o = { info: text }; }
  // keep only sources the search really returned (no made-up links); fall back to the search results themselves
  const cited = (Array.isArray(o.sources) ? o.sources : []).map((s) => String(s?.url ?? '')).filter((u) => found.has(u));
  const urls = [...new Set(cited.length ? cited : [...found.keys()])].slice(0, 8);
  const info = String(o.info ?? '').trim().slice(0, 3000);
  if (!info) throw new Error('ai_empty');
  return { info, sources: urls.map((url) => ({ url, title: (found.get(url) ?? url).slice(0, 200) })), model: final.model };
}

export interface BagIdentity { brandId: string | null; brandName: string | null; modelId: string | null; modelName: string | null; confidence: number; clues: string }

/**
 * Recognise the brand and model of a bag from one photo of the whole bag, so the customer does not have to
 * pick them and knows which details to photograph next. Identification only — what the bag is MEANT to be;
 * it never says whether it is genuine. Brand/model ids must come from the lists; otherwise names only.
 */
export async function identifyBag(env: Env, image: VisionImage, brands: { id: string; name: string }[], models: { id: string; brand_id: string; name: string }[], lang: OutLang, tips: string[] = []): Promise<BagIdentity> {
  const text = await callVision(env,
    `You recognise which designer brand and model a handbag is styled as, from one photo of the whole bag, for a second-hand shop. ${NO_VERDICT} ` +
    'Identify only what the bag is presented as (its design), never whether it is genuine. Use visible design features: shape, logo or monogram pattern, hardware, closure, handles. ' +
    'Pick brand_id and model_id from the lists when one fits; if the brand is not in the list give brand_name only; if the model is not in the list give model_name only. ' +
    'If the photo is not a bag, is too unclear, or you cannot tell, use nulls and confidence 0. ' +
    `Reply with JSON only: {"brand_id": id|null, "brand_name": string|null, "model_id": id|null, "model_name": string|null, "confidence": 0..1, "clues": "one short sentence in ${LANG_NAME[lang]} on the visible features used"}`,
    [image], `Brands: ${JSON.stringify(brands.map((b) => ({ id: b.id, name: b.name })))}\nModels: ${JSON.stringify(models.map((m) => ({ id: m.id, brand_id: m.brand_id, name: m.name })))}${tips.length ? `\nStaff tips for telling brands and models apart:\n- ${tips.join('\n- ')}` : ''}`, 800, 'medium');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null; try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const brand = brands.find((x) => x.id === o?.brand_id) ?? null;
  const model = brand ? models.find((m) => m.id === o?.model_id && m.brand_id === brand.id) ?? null : null;
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
  const brandName = brand?.name ?? str(o?.brand_name, 80);
  const confidence = brandName ? Math.max(0, Math.min(1, Number(o?.confidence) || 0)) : 0;
  return { brandId: brand?.id ?? null, brandName, modelId: model?.id ?? null, modelName: model?.name ?? str(o?.model_name, 120), confidence, clues: str(o?.clues, 300) ?? '' };
}

export interface MarketResearchRow { brand: string; model: string; reason: string; price_min: number | null; price_max: number | null; currency: string | null; sources: string[] }
/** `searched`: how many pages the web search returned (0 = no search happened, e.g. a gateway without web search); `proposed`: rows the AI wrote before the source check. */
export interface MarketResearch { rows: MarketResearchRow[]; sources: { title: string; url: string }[]; model: string; searched: number; proposed: number }

const COUNTRY_NAME: Record<string, { name: string; currency: string; places: string }> = {
  TH: { name: 'Thailand', currency: 'THB', places: 'Shopee TH, Lazada TH, Kaidee, Facebook Marketplace, TikTok Shop, Brand Off / 2nd Street / Komehyo Thailand, Thai resale news' },
  ID: { name: 'Indonesia', currency: 'IDR', places: 'Tokopedia, Shopee ID, Carousell ID, OLX, TikTok Shop, Indonesian preloved luxury shops and news' },
  MY: { name: 'Malaysia', currency: 'MYR', places: 'Carousell MY, Shopee MY, Lazada MY, Mudah, TikTok Shop, Malaysian preloved luxury shops and news' },
};

/**
 * Which second-hand designer bags are in demand right now in one country, researched on the web (Claude web
 * search). A DRAFT for staff: every row must rest on links the search really returned; prices only when a
 * source shows them. Staff read it, edit, and save it as that month's ranking (with the sources).
 */
export async function researchMarket(env: Env, x: { country: 'TH' | 'ID' | 'MY'; period: string; lang: OutLang }): Promise<MarketResearch> {
  if (aiProvider(env) !== 'anthropic') throw new Error('ai_web_not_configured');
  const c = COUNTRY_NAME[x.country];
  const model = aiModel(env)!;
  const client = anthropicClient(env);
  const system =
    `You research the SECOND-HAND (preloved) designer handbag market in ${c.name} for resellers at a Cambodian border market. ` +
    `Find which brands and models are selling fast or are most wanted there around ${x.period}: look at ${c.places}, resale price guides and recent articles. ` +
    'Prefer evidence such as many sold listings, "sold out", high resale value, waiting lists, trending searches, or articles naming the model. ' +
    'Report ONLY what the sources support. Never invent rankings, prices or statistics; if a price is not in a source, use null. Use sources from the last 12 months where possible. ' +
    'Never comment on whether any item is authentic or counterfeit. ' +
    `For each model write "reason": ONE short sentence in ${LANG_NAME[x.lang]} on why it sells (demand, rarity, style trend, resale value), based on the sources. ` +
    `Finish with JSON only: {"rows":[{"brand":"...","model":"...","reason":"...","price_min":number|null,"price_max":number|null,"currency":"${c.currency}"|null,"sources":["url", ...]}]} — up to 10 rows, most in-demand first.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Country: ${c.name}\nMonth: ${x.period}` }];
  const found = new Map<string, string>();
  let final: Anthropic.Beta.BetaMessage | null = null;
  try {
    for (let turn = 0; turn < 5 && !final; turn++) {
      const r = await client.beta.messages.create({
        model, max_tokens: 16000, output_config: { effort: 'medium' }, system, messages,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
      });
      await recordUsage(env, r.model, r.usage);
      for (const b of r.content) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const res of b.content) if (res.type === 'web_search_result') found.set(res.url, res.title);
      }
      if (r.stop_reason === 'refusal') throw new Error('ai_refused');
      if (r.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
      final = r;
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) { console.error(`market research: ${model} failed: ${apiErrorText(e)}`); throw new Error(`ai_http_${e.status ?? 0}`); }
    throw e;
  }
  if (!final) throw new Error('ai_unfinished');
  const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let o: { rows?: any[] } = {};
  try { o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { o = {}; }
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  const rows: MarketResearchRow[] = [];
  for (const r of Array.isArray(o.rows) ? o.rows : []) {
    // a row stays only if at least one of its links really came back from the search
    const sources = matchFoundUrls(Array.isArray(r?.sources) ? r.sources : [], found.keys(), 4);
    const brand = str(r?.brand, 80), name = str(r?.model, 120);
    if (!brand || !name || !sources.length) continue;
    let pmin = num(r?.price_min), pmax = num(r?.price_max);
    if (pmin !== null && pmax !== null && pmax < pmin) [pmin, pmax] = [pmax, pmin];
    const currency = pmin !== null || pmax !== null ? (['THB', 'IDR', 'MYR', 'USD'].includes(r?.currency) ? r.currency : c.currency) : null;
    rows.push({ brand, model: name, reason: str(r?.reason, 300), price_min: pmin, price_max: pmax, currency, sources });
    if (rows.length >= 10) break;
  }
  const used = [...new Set(rows.flatMap((r) => r.sources))];
  const proposed = Array.isArray(o.rows) ? o.rows.length : 0;
  if (!rows.length) console.error(`market research: no rows kept (search results: ${found.size}, rows written: ${proposed})`);
  return { rows, sources: used.map((url) => ({ url, title: (found.get(url) ?? url).slice(0, 200) })), model: final.model, searched: found.size, proposed };
}

export interface LeadFound { handle: string; name: string | null; kind: 'live_seller' | 'reseller' | 'shop'; sells: string; why: string; fit: 1 | 2 | 3 | null; source_url: string; source_title: string }

const LEAD_QUERIES: Record<'TH' | 'MY' | 'ID', { name: string; lang: string; queries: string }> = {
  TH: { name: 'Thailand', lang: 'Thai', queries: '"กระเป๋าแบรนด์เนมมือสอง ไลฟ์สด", "กระเป๋ามือสอง live", "กระเป๋าแบรนด์เนมมือสอง ราคาส่ง", "กระเป๋ามือสองญี่ปุ่น", "Coach มือสอง", "Balenciaga มือสอง"' },
  MY: { name: 'Malaysia', lang: 'Malay and English', queries: '"beg branded preloved live", "preloved designer bag malaysia", "bundle beg branded", "beg coach preloved", "preloved luxury bag live"' },
  ID: { name: 'Indonesia', lang: 'Indonesian', queries: '"tas branded preloved live", "tas bekas branded", "tas second branded original", "preloved tas coach", "jual tas branded second live"' },
};

/**
 * Find public TikTok accounts in one country that sell second-hand designer bags (often on LIVE) — resellers who
 * could buy stock wholesale. Claude web search limited to tiktok.com; the caller keeps an account only when a link
 * the search really returned belongs to it (see evidenceFor). Business info only; never personal details.
 */
export async function findTiktokSellers(env: Env, x: { country: 'TH' | 'MY' | 'ID'; lang: OutLang; known: string[]; topic?: string | null; offer?: string | null }): Promise<{ rows: LeadFound[]; found: Map<string, string>; model: string }> {
  if (aiProvider(env) !== 'anthropic') throw new Error('ai_web_not_configured');
  const c = LEAD_QUERIES[x.country];
  const model = aiModel(env)!;
  const client = anthropicClient(env);
  const system =
    `You help a second-hand designer-bag wholesaler at the Cambodia–Thailand border market (Aran / Rong Kluea) find new business customers in ${c.name}. ` +
    `Search TikTok (the search is limited to tiktok.com) for accounts in ${c.name} that SELL second-hand / preloved designer bags, especially by TikTok LIVE, ` +
    'or that resell vintage / Japanese-import / bale bags: these resellers could buy stock wholesale. ' +
    (x.topic ? `FOCUS of this search: accounts that sell "${x.topic}". Translate it into ${c.lang} search words, add brand / model names and local slang, and run several different searches for it. ` : '') +
    `Search in ${c.lang}; useful searches: ${c.queries}. Prefer accounts with recent videos or LIVE pages. ` +
    (x.offer ? `The shop's offer (use it to judge fit): ${x.offer.slice(0, 600)}. ` : '') +
    'Skip: buyers who are private individuals, brand-new / official brand stores, accounts that sell copies or replicas, and the accounts in the "Already known" list. ' +
    'Use only what the search results show; never guess handles, follower numbers, phone numbers or other contact details, and do not include any personal information. ' +
    'Never comment on whether any item is authentic or counterfeit. ' +
    `For each account: "handle" exactly as in the TikTok link (without @), "name" (display name or null), "kind" ("live_seller" if they sell on LIVE, "reseller" if they sell through videos, "shop" for a shop account), ` +
    `"sells": a short phrase on what they sell (brands, style, price level) from the results, "why": ONE short sentence in ${LANG_NAME[x.lang]} on why they could buy from this shop, ` +
    '"fit": 3 if what they sell clearly matches the focus / the shop\'s offer, 2 if partly, 1 if only loosely, "source": the TikTok link from the results that shows this account. ' +
    'Finish with JSON only: {"rows":[{"handle":"…","name":"…"|null,"kind":"…","sells":"…","why":"…","fit":1|2|3,"source":"url"}]} — up to 15 accounts, best fits first.';
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Country: ${c.name}${x.topic ? `\nFocus: ${x.topic}` : ''}\nAlready known (skip): ${x.known.slice(0, 150).join(', ') || '(none)'}` }];
  const found = new Map<string, string>();
  let final: Anthropic.Beta.BetaMessage | null = null;
  try {
    for (let turn = 0; turn < 5 && !final; turn++) {
      const r = await client.beta.messages.create({
        model, max_tokens: 12000, output_config: { effort: 'medium' }, system, messages,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8, allowed_domains: ['tiktok.com'], user_location: { type: 'approximate', country: x.country } }],
      });
      await recordUsage(env, r.model, r.usage);
      for (const b of r.content) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const res of b.content) if (res.type === 'web_search_result') found.set(res.url, res.title);
      }
      if (r.stop_reason === 'refusal') throw new Error('ai_refused');
      if (r.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: r.content }); continue; }
      final = r;
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) { console.error(`lead search: ${model} failed: ${apiErrorText(e)}`); throw new Error(`ai_http_${e.status ?? 0}`); }
    throw e;
  }
  if (!final) throw new Error('ai_unfinished');
  const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let o: { rows?: any[] } = {};
  try { o = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { o = {}; }
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const rows: LeadFound[] = [];
  for (const r of Array.isArray(o.rows) ? o.rows : []) {
    const handle = str(r?.handle, 40).replace(/^@/, '');
    if (!handle) continue;
    const kind = (['live_seller', 'reseller', 'shop'] as const).find((k) => k === r?.kind) ?? 'reseller';
    const src = str(r?.source, 500);
    const fit = [1, 2, 3].includes(Number(r?.fit)) ? Number(r.fit) as 1 | 2 | 3 : null;
    rows.push({ handle, name: str(r?.name, 120) || null, kind, sells: str(r?.sells, 300), why: str(r?.why, 300), fit, source_url: src, source_title: (found.get(src) ?? '').slice(0, 200) });
    if (rows.length >= 15) break;
  }
  return { rows, found, model: final.model };
}


const LEAD_LANG: Record<'TH' | 'MY' | 'ID', string> = { TH: 'Thai', MY: 'Malay (Bahasa Melayu)', ID: 'Indonesian (Bahasa Indonesia)' };

/**
 * A first message to a TikTok seller found by the customer finder, in their language, for staff to copy and send
 * themselves (the app never sends it). Built only from the shop's own offer and what the account sells; no invented
 * prices or claims, no authenticity claims, no pressure.
 */
export async function draftOutreach(env: Env, x: { country: 'TH' | 'MY' | 'ID'; handle: string; name: string | null; sells: string | null; kind: string; offer: string; shopName: string; lang: OutLang }): Promise<{ message: string; meaning: string }> {
  const text = await callVision(env,
    'You write a short, friendly first direct message from a second-hand designer bag wholesaler at the Cambodia–Thailand border market to a reseller on TikTok. ' +
    `Write "message" in ${LEAD_LANG[x.country]} as a native seller would on TikTok / LINE: greet them, mention what they sell in one phrase, say what the shop offers, invite them to reply to see stock. 3–5 short lines, at most 2 emoji. ` +
    'Use ONLY facts from the shop\'s offer: never invent prices, discounts, stock, guarantees or claims, and never say or imply that the bags are authentic, genuine or original. No pressure, no fake urgency. ' +
    'Ask them to reply if they are interested. ' +
    `Then write "meaning": the same message translated into ${LANG_NAME[x.lang]} so the shop owner understands it. ` +
    'Reply with JSON only: {"message":"…","meaning":"…"}',
    [], `Shop: ${x.shopName || '(no name)'}\nShop offer: ${x.offer || '(not written yet)'}\nTikTok account: @${x.handle}${x.name ? ` (${x.name})` : ''} — ${x.kind}${x.sells ? ` — sells: ${x.sells}` : ''}`, 1500, 'low');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o: any = null; try { o = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { o = null; }
  const message = typeof o?.message === 'string' ? o.message.trim().slice(0, 1500) : '';
  if (message.length < 10) throw new Error('ai_empty');
  return { message, meaning: typeof o?.meaning === 'string' ? o.meaning.trim().slice(0, 1500) : '' };
}

export const SURFACE_NAME: Record<string, string> = Object.fromEntries(LEATHERS.map((l) => [l.key, l.ai]));
const steps = (v: unknown, n = 10) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, n).map((x) => x.slice(0, 400));
const parseObj = (text: string): any => { const a = text.indexOf('{'), b = text.lastIndexOf('}'); try { return a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : null; } catch { return null; } };

export interface PaintPick { brand: string; code: string; name: string; parts: number; inShop: boolean; hex: string | null }
export interface PaintMethod { paints: PaintPick[]; paintsFrom: 'recipe' | 'ai' | 'none'; paintsNote: string; steps: string[]; prep: string[]; mix: string[]; apply: string[]; dry: string[]; avoid: string[]; tools: string[]; safety: string }
export interface ShopPaint { brand: string; code: string | null; name: string; kind: string; base: string | null; hex: string | null }

/** Same paint? brand + code (or brand + name when there is no code), ignoring case, spaces and "#". */
const paintKey = (brand: string, code: string | null | undefined, name: string) =>
  `${brand}|${code || name}`.toLowerCase().replace(/[\s#._-]+/g, '');

/**
 * 🎨 Paint skill: for ONE colour, leather type and finish — which paints to mix (the shop recipe when there is one;
 * otherwise a STARTING mix the AI suggests from the shop's own paints, or plain base colours, clearly labelled as a
 * suggestion to test), then short workshop steps. Never names a product code the shop does not have.
 */
export async function paintMethod(env: Env, x: {
  surface: string; finish: string; recipe: { name: string; parts: { brand: string; name: string; kind: string; parts: number; code?: string | null; hex?: string | null }[] } | null;
  colour: { hex: string; lab: [number, number, number]; approx: boolean } | null; inventory: ShopPaint[]; skills: string; lang: OutLang;
}): Promise<PaintMethod> {
  const inv = x.inventory.slice(0, 80);
  const text = await callVision(env,
    'You are the paint-skill assistant of second-hand bag vendors who repaint and recolour bags for resale (Cambodia–Thailand border market). ' +
    'Answer for the given bag colour, leather type and finish. ' +
    'PAINTS: if a shop recipe is given, "paints" = exactly that recipe (same products, same parts). ' +
    'Otherwise, if a colour is given, suggest a STARTING mix to reach it: prefer the shop\'s paints from the list (copy brand, code and name exactly as listed); ' +
    'if the list lacks what is needed (or is empty), use paints from the reference catalogue below with brand "Sakura" and the exact code and name (the shop may still have to buy them); ' +
    'only when neither has a suitable paint, use a plain base colour with brand "" and code "" (e.g. name "white", "black"). ' +
    'NEVER write a product code that is in neither the shop list nor the reference catalogue. On aged leather, mute bright colours as the knowledge says; a blend of 3–4 paints usually matches better than 1–2, and the wet mix should be a touch lighter than the bag because it dries darker. 1–4 paints, "parts" as small whole numbers (drops), "hex": the paint colour as #rrggbb. ' +
    '"paintsNote": one short line on how to adjust (e.g. "too dark → add white 1 drop at a time"). If no colour and no recipe: "paints": []. ' +
    'STEPS: the whole job in AT MOST 6 short lines, under 12 words each, in order (clean/prepare → mix → apply thin coats → dry/seal), right for this leather; ' +
    '"avoid": max 3 mistakes; "tools": max 5 items. ' +
    'Use the shop knowledge first and do not contradict it. ' + NO_VERDICT + ' Never explain how to add, copy or alter logos, serial numbers or date codes. ' +
    `Write every text in ${LANG_NAME[x.lang]} (product names and codes stay as written). ` +
    'Reply with JSON only: {"paints":[{"brand":"","code":"","name":"","parts":1,"hex":"#rrggbb"}],"paintsNote":"…","steps":["…"],"avoid":["…"],"tools":["…"],"safety":"one short line"}',
    [], [
      `Bag colour: ${x.colour ? `${x.colour.hex} (CIELAB L ${x.colour.lab[0].toFixed(1)}, a ${x.colour.lab[1].toFixed(1)}, b ${x.colour.lab[2].toFixed(1)})${x.colour.approx ? ' — approximate (no white reference)' : ''}` : 'unknown'}`,
      `Leather type: ${SURFACE_NAME[x.surface] ?? x.surface}`,
      `Finish wanted: ${x.finish}`,
      x.recipe ? `Shop recipe "${x.recipe.name}": ${x.recipe.parts.map((p) => `${p.parts} part(s) ${p.brand}${p.code ? ` ${p.code}` : ''} ${p.name} (${p.kind})`).join(' + ')}` : 'Shop recipe: none',
      `Shop paints: ${inv.map((p) => `${p.brand}${p.code ? ` ${p.code}` : ''} ${p.name} (${p.kind}${p.base ? `, ${p.base}` : ''}${p.hex ? `, ${p.hex}` : ''})`).join('; ') || '(none yet)'}`,
      `Reference catalogue (Sakura Acrylic Color, real codes): ${catalogLine()}`,
      `Shop knowledge:\n${x.skills || '(none yet)'}`,
    ].join('\n'), 3000, 'medium');
  const o = parseObj(text);
  const byKey = new Map(inv.map((p) => [paintKey(p.brand, p.code, p.name), p]));
  let paints: PaintPick[];
  let from: PaintMethod['paintsFrom'];
  if (x.recipe) {
    from = 'recipe';
    paints = x.recipe.parts.map((p) => ({ brand: p.brand, code: p.code ?? '', name: p.name, parts: p.parts, inShop: true, hex: p.hex ?? null }));
  } else {
    paints = (Array.isArray(o?.paints) ? o.paints : []).slice(0, 4).map((p: any) => {
      const brand = String(p?.brand ?? '').trim().slice(0, 80), code = String(p?.code ?? '').trim().slice(0, 40), name = String(p?.name ?? '').trim().slice(0, 120);
      const shop = brand ? byKey.get(paintKey(brand, code || null, name)) : undefined;
      // a code is kept only for a paint in the shop list or in the reference catalogue (then with the catalogue's own name);
      // anything else is dropped back to a plain colour name (no invented product codes)
      const cat = shop ? null : catalogPaint(brand, code);
      const aiHex = /^#[0-9a-f]{6}$/i.test(String(p?.hex ?? '')) ? String(p.hex).toLowerCase() : null;
      return { brand: shop ? shop.brand : cat ? 'Sakura' : '', code: shop ? shop.code ?? '' : cat ? `#${cat.code}` : '', name: shop ? shop.name : cat ? cat.name : name,
        parts: Math.max(1, Math.min(20, Math.round(Number(p?.parts) || 1))), inShop: !!shop, hex: shop?.hex ?? aiHex };
    }).filter((p: PaintPick) => p.name);
    from = paints.length ? 'ai' : 'none';
  }
  const short = (v: unknown, n: number) => steps(v, n).map((l) => l.slice(0, 160));
  const r: PaintMethod = { paints, paintsFrom: from, paintsNote: String(o?.paintsNote ?? '').trim().slice(0, 200), steps: short(o?.steps, 6),
    prep: [], mix: [], apply: [], dry: [], avoid: short(o?.avoid, 3), tools: short(o?.tools, 5), safety: String(o?.safety ?? '').trim().slice(0, 300) };
  if (!r.steps.length) throw new Error('ai_empty');
  return r;
}

export interface RepairAdvice { problem: string; unclear: boolean; severity: 'light' | 'medium' | 'heavy' | null; steps: string[]; materials: string[]; avoid: string[]; pro: string; safety: string }

/**
 * 🧽 Clean & repair skill: from a photo of the problem (and/or a short description) and the leather type, say what
 * is visible and how to fix it step by step. Says "unclear" instead of guessing when the photo does not show it.
 * Never comments on authenticity; never explains how to add or change logos, serials or date codes.
 */
export async function repairAdvice(env: Env, x: { surface: string; problem: string; image: VisionImage | null; products: string[]; skills: string; lang: OutLang }): Promise<RepairAdvice> {
  const text = await callVision(env,
    'You are the repair-skill assistant of second-hand bag vendors who clean and fix bags for resale. ' +
    'From the photo (if any) and the description, name the visible problem (e.g. stain, ink, mould, water mark, darkened vachetta, peeling or cracked paint, worn corners, cracked edge paint, sticky lining, scratches, loose stitching, tarnished hardware, odour) ' +
    'and give a step-by-step fix for THIS leather type, gentlest method first, with a test on a hidden spot. ' +
    'If the photo does not clearly show the problem, set "unclear": true, say what photo is needed, and give no steps for things you cannot see. ' +
    'Use the shop knowledge first and do not contradict it. Name products only from the list given; otherwise use generic product types. ' + NO_VERDICT + ' Never explain how to add, copy or alter logos, serial numbers or date codes. ' +
    `Write in ${LANG_NAME[x.lang]}, short imperative lines. ` +
    'Reply with JSON only: {"problem":"what is visible, one sentence","unclear":false,"severity":"light|medium|heavy","steps":["…"],"materials":["…"],"avoid":["…"],"pro":"when a professional should do it, or empty","safety":"one short line"}',
    x.image ? [x.image] : [], [
      `Leather type: ${SURFACE_NAME[x.surface] ?? x.surface}`,
      `Vendor's description: ${x.problem || '(none)'}`,
      `Products the shop has: ${x.products.slice(0, 40).join('; ') || '(none listed)'}`,
      `Shop knowledge:\n${x.skills || '(none yet)'}`,
    ].join('\n'), 2500, 'medium');
  const o = parseObj(text);
  const sev = (['light', 'medium', 'heavy'] as const).find((k) => k === o?.severity) ?? null;
  const r: RepairAdvice = { problem: String(o?.problem ?? '').trim().slice(0, 400), unclear: !!o?.unclear, severity: sev, steps: steps(o?.steps, 12), materials: steps(o?.materials, 12),
    avoid: steps(o?.avoid, 8), pro: String(o?.pro ?? '').trim().slice(0, 400), safety: String(o?.safety ?? '').trim().slice(0, 400) };
  if (!r.problem && !r.steps.length) throw new Error('ai_empty');
  return r;
}


export interface LeatherGuess { surface: string | null; finish: 'matte' | 'satin' | 'gloss' | null; confidence: number; colour: string; condition: string; tip: string }

/**
 * 🎨 Paint skill, step 1: from the bag photo, which material the painted area is (leather type) and its finish,
 * plus a short condition note and a prep tip. Identification of the material only — never authenticity.
 * Low confidence → nulls, and the person picks.
 */
export async function identifyLeather(env: Env, image: VisionImage, lang: OutLang): Promise<LeatherGuess> {
  const text = await callVision(env,
    'You help a bag repainter. From one photo of a bag (a white paper may lie next to it for colour), say which material the main surface is and its finish. ' +
    `Materials: ${Object.entries(SURFACE_NAME).map(([k, v]) => `"${k}" = ${v}`).join('; ')}. ` +
    'Finish: "matte", "satin" or "gloss" (how shiny the surface looks). ' + NO_VERDICT + ' ' +
    'If the photo is unclear or the material cannot be told, use null and a low confidence. ' +
    `In ${LANG_NAME[lang]}: "colour" = the colour name in a few words, "condition" = one short line on visible wear that matters for painting (scuffs, cracks, peeling, stains) or empty, "tip" = one short preparation tip for this material. ` +
    'Reply with JSON only: {"surface":"…"|null,"finish":"matte|satin|gloss"|null,"confidence":0..1,"colour":"…","condition":"…","tip":"…"}',
    [image], 'Which material and finish?', 600, 'low');
  const o = parseObj(text);
  const surface = typeof o?.surface === 'string' && o.surface in SURFACE_NAME ? o.surface : null;
  const finish = (['matte', 'satin', 'gloss'] as const).find((k) => k === o?.finish) ?? null;
  const confidence = surface ? Math.max(0, Math.min(1, Number(o?.confidence) || 0)) : 0;
  const str = (v: unknown) => String(v ?? '').trim().slice(0, 200);
  return { surface, finish, confidence, colour: str(o?.colour), condition: str(o?.condition), tip: str(o?.tip) };
}


/**
 * The AI workspace of a skill: a conversation (text or voice, optionally with a photo) about the job in hand.
 * 🎨 paint: colour not matching, peeling, streaks, sticky finish… with the leather, finish, recipe and measured
 * colour as context. 🧽 repair: follow-up questions about a repair. Shop knowledge (active skills) comes first.
 * Mixing: never a new recipe or invented ratio — only small, testable adjustments to the current mix.
 */
export async function workspaceAnswer(env: Env, x: { skill: 'paint' | 'repair'; turns: ChatTurn[]; image: VisionImage | null; lang: OutLang; context: string; skills: string }): Promise<string> {
  const role = x.skill === 'paint'
    ? 'You are the paint-workshop assistant of a second-hand bag vendor who repaints and recolours bags (leather, coated canvas, suede, edges). They are at the bench right now with the job below. ' +
      'Help them fix what goes wrong: colour does not match (too dark / light / red / yellow / green / blue / grey), uneven or streaky coats, peeling, cracking, sticky or tacky finish, paint not absorbing on suede, wrong shine, bleeding edges. ' +
      'Mixing rules: never give a new recipe or invent amounts for a colour from scratch. If a recipe or measured colour is given, suggest only small, testable adjustments to the CURRENT mix (e.g. "add 1 drop of black per 10 ml, stir 30 s, paint a swatch, let it dry, compare next to the bag"); remember paint dries darker or lighter, so compare dry swatches. If the measured colour and the recipe colour are both given, use their difference (lighter / darker, warmer / cooler) to choose the direction. '
    : 'You are the repair-bench assistant of a second-hand bag vendor who cleans and repairs bags (stains, mould, worn corners, edges, scratches, odour, sticky lining, hardware). They are working on the job below. Give the next practical step, gentlest method first, with a test on a hidden spot. ';
  const system = [
    role,
    'Reply in the language the user writes in (default ' + LANG_NAME[x.lang] + '). Be short and practical: 2–6 short lines or a short numbered list, no headings. Ask one short question back if you need a detail to help.',
    'If a photo is attached, describe only what is visible and say when it is not clear enough; ask for a closer photo in daylight next to the white paper when needed.',
    'Use the shop knowledge first and do not contradict it. ' + NO_VERDICT + ' Never explain how to add, copy or alter logos, serial numbers or date codes. Give safety notes for solvents and dyes (ventilation, gloves).',
    '',
    'The job:', x.context || '(no details yet)',
    '',
    'Shop knowledge:', x.skills || '(none yet)',
  ].join('\n');
  return runChat(env, system, x.turns, 6000, x.image);
}


export interface PaintTube {
  brand: string | null; code: string | null; name: string | null; volume_ml: number | null; base: string | null; kind: string | null;
  colour: string; hex: string | null; transparent: boolean | null; confidence: number; label: string;
  uses: string[]; mixes: { with: string; makes: string }[]; leather_tip: string;
}
const TUBE_BASES = ['acrylic', 'leather_acrylic', 'water_dye', 'solvent_dye', 'oil', 'wax', 'other'];
const TUBE_KINDS = ['leather_paint', 'edge_paint', 'dye', 'finisher', 'preparer', 'cleaner', 'other'];

/**
 * 🧴 Read a paint tube / bottle from a photo: brand, colour code and name exactly as printed, volume, what the paint
 * is made on, and an approximate swatch colour (display only — never used to measure a bag). Then, for bag work:
 * what the colour is good for, what to mix it with (shop paints first; directions only, no ratios), and one tip
 * for using it on the chosen leather. Unreadable label → nulls, low confidence.
 */
export async function readPaintTube(env: Env, image: VisionImage, x: { lang: OutLang; surface: string | null; products: string[]; skills: string }): Promise<PaintTube> {
  const text = await callVision(env,
    'You read paint tubes and bottles for a bag-repainting workshop. From the photo, copy the label EXACTLY as printed: brand (e.g. "ST Professional Acrylic", "Sakura Acrylic Color", "Angelus"), the colour code (e.g. "#107", "100-1"), the colour name (e.g. "Sap Green (Transparent)", "Unbleached Titanium"), and the volume in ml. ' +
    'Ignore paint smeared on the tube when reading text; if a field is not readable, use null — never guess codes or names. ' +
    `base: one of ${TUBE_BASES.join(', ')} ("acrylic" = artist acrylic colour; "leather_acrylic" = acrylic made for leather such as Angelus). kind: one of ${TUBE_KINDS.join(', ')} (artist acrylic tubes → "other"). ` +
    'hex: an approximate colour of the paint itself as "#rrggbb" (from the cap / colour band / paint on the nozzle) for a swatch, or null. transparent: true if the label says transparent, false if opaque, else null. ' +
    `Then, for bag work, in ${LANG_NAME[x.lang]}: "uses" = 2–4 short lines on what bag colours / jobs this paint helps with; "mixes" = up to 4 items {"with": a paint (prefer the shop list), "makes": the colour or effect}, directions only, never amounts or ratios; ` +
    `"leather_tip" = one short line on using this paint on ${x.surface ? SURFACE_NAME[x.surface] ?? x.surface : 'bag leather'} (e.g. artist acrylic needs a leather / flex medium and thin coats to stay flexible); "colour" = the colour in a few words. ` +
    'Use the shop knowledge first. ' + NO_VERDICT + ' ' +
    'Reply with JSON only: {"brand":…,"code":…,"name":…,"volume_ml":number|null,"base":…,"kind":…,"hex":…,"transparent":…,"confidence":0..1,"label":"the label text you read","colour":"…","uses":["…"],"mixes":[{"with":"…","makes":"…"}],"leather_tip":"…"}',
    [image], [`Shop paints: ${x.products.slice(0, 60).join('; ') || '(none listed)'}`, `Shop knowledge:\n${x.skills || '(none yet)'}`].join('\n'), 1500, 'low');
  const o = parseObj(text) ?? {};
  const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim().slice(0, n) : null);
  const vol = Number(o.volume_ml);
  const hex = typeof o.hex === 'string' && /^#[0-9a-f]{6}$/i.test(o.hex.trim()) ? o.hex.trim().toLowerCase() : null;
  const mixes = (Array.isArray(o.mixes) ? o.mixes : []).map((m: any) => ({ with: str(m?.with, 80) ?? '', makes: str(m?.makes, 120) ?? '' })).filter((m: { with: string; makes: string }) => m.with && m.makes).slice(0, 4);
  return {
    brand: str(o.brand, 80), code: str(o.code, 40), name: str(o.name, 120), volume_ml: Number.isFinite(vol) && vol >= 1 && vol <= 20000 ? Math.round(vol) : null,
    base: TUBE_BASES.includes(o.base) ? o.base : null, kind: TUBE_KINDS.includes(o.kind) ? o.kind : null,
    colour: str(o.colour, 80) ?? '', hex, transparent: typeof o.transparent === 'boolean' ? o.transparent : null,
    confidence: Math.max(0, Math.min(1, Number(o.confidence) || 0)), label: str(o.label, 300) ?? '',
    uses: steps(o.uses, 4), mixes, leather_tip: str(o.leather_tip, 300) ?? '',
  };
}


/** Admin check: one tiny Claude web search (1 search) — used by the TikTok customer finder, market and paint research. */
export async function testWebSearch(env: Env): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t = Date.now();
  if (aiProvider(env) !== 'anthropic') return { ok: false, ms: 0, error: aiProvider(env) === 'bedrock' ? 'not available on Amazon Bedrock (web search needs an Anthropic API key)' : 'needs ANTHROPIC_API_KEY' };
  try {
    const r = await anthropicClient(env).beta.messages.create({
      model: aiModel(env)!, max_tokens: 2000, output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1 }],
      messages: [{ role: 'user', content: 'Search the web once for "leather paint" and reply with the single word: ok' }],
    });
    await recordUsage(env, r.model, r.usage);
    const searched = r.content.some((b) => b.type === 'web_search_tool_result');
    return { ok: searched, ms: Date.now() - t, ...(searched ? {} : { error: 'no search happened' }) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, error: (e instanceof Anthropic.APIError ? `ai_http_${e.status ?? 0}: ${apiErrorText(e)}` : String((e as Error).message)).slice(0, 240) };
  }
}
