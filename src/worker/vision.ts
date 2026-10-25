import type { Env } from './env.ts';

export interface ObsDef { key: string; value_type: 'enum' | 'number' | 'boolean' | 'text'; enum_json: string | null; label_en: string }
export interface Suggestion { key: string; value: string | number | boolean; confidence: number }
export interface VisionImage { data: ArrayBuffer; mime: string }

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Provider: Gemini if GEMINI_API_KEY + AI_MODEL are set, otherwise Anthropic if ANTHROPIC_API_KEY + AI_MODEL are set. */
export const aiConfigured = (env: Env) => !!env.AI_MODEL && !!(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY);

/** One vision call returning raw text. Images are sent in order; the caller's prompt says which is which. */
export async function callVision(env: Env, system: string, images: VisionImage[], userText: string, maxTokens = 1500): Promise<string> {
  if (!aiConfigured(env)) throw new Error('ai_not_configured');
  if (env.GEMINI_API_KEY) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.AI_MODEL!)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.mime, data: b64(i.data) } })), { text: userText }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
    if (!res.ok) throw new Error(`ai_http_${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.AI_MODEL, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: [
        ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: b64(i.data) } })),
        { type: 'text', text: userText },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`ai_http_${res.status}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  return data.content.find((c) => c.type === 'text')?.text ?? '';
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
export async function explainDifferences(env: Env, inspected: VisionImage, refs: VisionImage[], component: string): Promise<{ differences: Difference[]; summary: string }> {
  const text = await callVision(env,
    `You are an optical comparison assistant for luxury-goods appraisers. ${NO_VERDICT} Do not output scores or percentages. Image 1 is the INSPECTED item; the remaining images are approved REFERENCE photos of the same component. ` +
    `List concrete visible differences and similarities in features such as letter shape and spacing, depth and edge sharpness, finish and colour tone, symbols, texture, alignment. ` +
    `For each, mention if lighting, angle, or resolution could explain it (photoCaveat). Reply with JSON only: {"summary":"one or two neutral sentences","differences":[{"feature":"...","inspected":"...","reference":"...","note":"...","photoCaveat":"..."}]}`,
    [inspected, ...refs], `Component: ${component}. Compare image 1 against the ${refs.length} reference image(s).`, 1800);
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const o = JSON.parse(json) as { summary?: string; differences?: Difference[] };
    return { summary: String(o.summary ?? ''), differences: (o.differences ?? []).filter((d) => d && d.feature).slice(0, 20) };
  } catch { return { summary: '', differences: [] }; }
}
