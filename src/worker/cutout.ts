import type { Env } from './env.ts';
import { sniffImage } from './lib.ts';

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const toBytes = async (v: unknown): Promise<ArrayBuffer | null> => {
  if (v instanceof ArrayBuffer) return v;
  if (v instanceof Uint8Array) return v.slice().buffer;
  if (v instanceof ReadableStream) return new Response(v).arrayBuffer();
  return null;
};

/**
 * Cut a bag out of its photo with Workers AI (bria/remove-background, RMBG 2.0): returns a transparent PNG,
 * or null when the AI binding is missing, the input is not JPEG/PNG, or the call fails (the caller keeps the original).
 */
export async function removeBackground(env: Env, image: ArrayBuffer, mime: string): Promise<ArrayBuffer | null> {
  if (!env.AI || (mime !== 'image/jpeg' && mime !== 'image/png')) return null;
  try {
    const res = await (env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> })
      .run('bria/remove-background', { image: `data:${mime};base64,${b64(image)}`, preserve_alpha: true });
    // the model answers with a URL to the PNG cutout (hosted for a few days), possibly wrapped in `result`
    let out = await toBytes(res);
    if (!out) {
      const r = res as { image?: unknown; result?: { image?: unknown } } | null;
      const url = r?.result?.image ?? r?.image;
      if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('no image in the AI answer');
      const f = await fetch(url);
      if (!f.ok) throw new Error(`cutout download ${f.status}`);
      out = await f.arrayBuffer();
    }
    return sniffImage(new Uint8Array(out)) === 'image/png' ? out : null;
  } catch (e) {
    console.error('background removal failed:', String((e as Error).message ?? e).slice(0, 200));
    return null;
  }
}
