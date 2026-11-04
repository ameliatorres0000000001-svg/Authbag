import Anthropic from '@anthropic-ai/sdk';
import type { Env } from './env.ts';
import { MAX_AI_MARKS, parseBilingualMarks, parseSuggestedMarks, type SuggestedMark } from '../shared/marks.ts';
import { parseAppearance, type DateCodeAppearance } from '../shared/datecodeAppearance.ts';
import { MAX_CROPS, parseCropRegions, type CropRegion } from '../shared/crop.ts';

export interface ObsDef { key: string; value_type: 'enum' | 'number' | 'boolean' | 'text'; enum_json: string | null; label_en: string }
export interface Suggestion { key: string; value: string | number | boolean; confidence: number }
export interface VisionImage { data: ArrayBuffer; mime: string }

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Default model per provider when the AI_MODEL var is left empty. */
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5-5', gemini: 'gemini-3.8-flash' } as const;

/** Provider: Anthropic (Claude) if ANTHROPIC_API_KEY is set, otherwise Gemini if GEMINI_API_KEY is set. */
export const aiProvider = (env: Env): 'anthropic' | 'gemini' | null =>
  env.ANTHROPIC_API_KEY ? 'anthropic' : env.GEMINI_API_KEY ? 'gemini' : null;

/** The model id actually used: AI_MODEL if set, else the provider's default. Recorded with every AI result. */
export const aiModel = (env: Env): string | null => {
  const p = aiProvider(env);
  return p ? (env.AI_MODEL?.trim() || DEFAULT_MODEL[p]) : null;
};

export const aiConfigured = (env: Env) => aiProvider(env) !== null;

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const toImageMime = (m: string): ImageMime => (['image/png', 'image/gif', 'image/webp'].includes(m) ? m as ImageMime : 'image/jpeg');

/**
 * One vision call returning raw text. Images are sent in order; the caller's prompt says which is which.
 * `maxTokens` is the caller's expected answer size; Claude also thinks before answering, so the request allows more.
 */
export async function callVision(env: Env, system: string, images: VisionImage[], userText: string, maxTokens = 1500, effort: 'low' | 'medium' | 'high' = 'medium'): Promise<string> {
  const provider = aiProvider(env);
  const model = aiModel(env);
  if (!provider || !model) throw new Error('ai_not_configured');
  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: b64(i.data) } })), { text: userText }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!res.ok) throw new Error(`ai_http_${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let msg: Anthropic.Message;
  try {
    msg = await client.messages.create({
      model,
      // Thinking is on by default for current Claude models and counts toward max_tokens.
      max_tokens: Math.max(16000, maxTokens),
      output_config: { effort },
      system,
      messages: [{ role: 'user', content: [
        ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: toImageMime(i.mime), data: b64(i.data) } })),
        { type: 'text' as const, text: userText },
      ] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`ai_http_${e.status ?? 0}`);
    throw e;
  }
  if (msg.stop_reason === 'refusal') throw new Error('ai_refused');
  return msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
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
  /** a genuine reference photo of the same part, used when the photo is labelled counterfeit */
  reference?: VisionImage | null;
  lang?: OutLang;
}): Promise<SuggestedMark[]> {
  const compare = ctx.label === 'counterfeit' && !!ctx.reference;
  const task = compare
    ? `Image 1 was labelled by the uploader as a counterfeit example; image 2 is a genuine reference of the same part. ` +
      `Box up to ${MAX_AI_MARKS} places on IMAGE 1 where a visible detail differs from image 2 (letter shape or spacing, stamp depth, stitch count or angle, ` +
      `hardware finish or engraving, alignment, colour). For each, the note says what image 1 shows, what image 2 shows, and how a learner can see it; ` +
      `mention when lighting, angle or resolution could explain the difference. Use the uploader's label as given; do not judge it yourself.`
    : `Box up to ${MAX_AI_MARKS} details on the photo that a learner should study (stamps, date codes, letter shapes, stitches, hardware engraving, edges). ` +
      `The note explains what to look at there and how to read it; if the admin's instructions explain a code or detail, use that explanation.`;
  const text = await callVision(env,
    `You are a senior luxury-bag authenticator teaching a trainee from a photo. ${NO_VERDICT} ${task} ` +
    `Choose at most ${MAX_AI_MARKS} details that are clearly visible and worth learning. For each: ` +
    'BOX — a tight rectangle around exactly that detail (x, y = top-left corner; x, y, w, h are fractions 0..1 of IMAGE 1\'s width and height). ' +
    'Before answering, check each box really contains the named detail; if you are unsure where it is, leave that detail out. ' +
    'LABEL — 2 to 5 words naming the detail (e.g. "Star-head screw", "Heat stamp lettering"). ' +
    'NOTE — two short lines, easy to remember. Line 1 (max 14 words): what an experienced authenticator checks there and why, using real trade knowledge ' +
    '(for example: some brands use proprietary screw heads that ordinary repair tools cannot turn; Louis Vuitton heat stamps have very round O\'s and close double T\'s). ' +
    'Line 2 (max 10 words) starts with "In this photo:" and says what is visible here. No generic advice about lighting or resolution unless it hides the detail. ' +
    'Write every label and note in BOTH English and Khmer. Khmer must be natural, simple Khmer, not word for word; its second line starts with "ក្នុងរូបនេះ៖". Separate the two lines with a line break. ' +
    'Keep brand names, codes and stamped words exactly as written on the item. ' +
    'Reply with JSON only: [{"x":0..1,"y":0..1,"w":0..1,"h":0..1,"label_en":"...","note_en":"...","label_km":"...","note_km":"..."}]',
    compare ? [image, ctx.reference!] : [image],
    `Model: ${ctx.model}.${ctx.part ? ` Part: ${ctx.part}.` : ''}${ctx.title ? ` Photo: ${ctx.title}.` : ''}` +
    `${ctx.label ? ` Uploader label: ${ctx.label}.` : ''}${ctx.note ? `\nAdmin note: ${ctx.note}` : ''}${ctx.prompt ? `\nAdmin instructions: ${ctx.prompt}` : ''}`,
    16000, 'high');
  return parseBilingualMarks(text);
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
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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
  const text = await callVision(env,
    'You translate short teaching notes about luxury bags between English and Khmer, making each one short and easy to remember (a learner reads it on a phone). Keep the meaning, keep brand names, codes and stamped words exactly as written, ' +
    'keep line breaks. If a note has a line starting "In this photo:" the Khmer line starts "ក្នុងរូបនេះ៖" and vice versa. Natural Khmer, not word for word. ' +
    'Reply with JSON only: [{"id":"...","label_en":"...","note_en":"...","label_km":"...","note_km":"..."}] — one entry per input id.',
    [], JSON.stringify(items.map((i) => ({ id: i.id, label: i.label, note: i.note ?? '' }))), 16000, 'low');
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  let arr: Record<string, unknown>[] = [];
  try { arr = a >= 0 && b > a ? JSON.parse(text.slice(a, b + 1)) : []; } catch { arr = []; }
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const out: Record<string, { en: { label: string; note?: string }; km: { label: string; note?: string } }> = {};
  const ids = new Set(items.map((i) => i.id));
  for (const o of Array.isArray(arr) ? arr : []) {
    const id = s(o?.id, 80);
    if (!ids.has(id) || !s(o.label_en, 80) || !s(o.label_km, 80)) continue;
    out[id] = {
      en: { label: s(o.label_en, 80), ...(s(o.note_en, 1000) ? { note: s(o.note_en, 1000) } : {}) },
      km: { label: s(o.label_km, 80), ...(s(o.note_km, 1000) ? { note: s(o.note_km, 1000) } : {}) },
    };
  }
  return out;
}
