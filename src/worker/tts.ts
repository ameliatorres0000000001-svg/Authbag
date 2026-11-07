import type { Env } from './env.ts';
import { sha256Hex } from './lib.ts';

/** Azure AI Speech text-to-speech: Khmer neural voices (km-KH-SreymomNeural female, km-KH-PisethNeural male). */
export const ttsConfigured = (env: Env) => !!(env.AZURE_SPEECH_KEY && /^[a-z0-9]+$/.test(env.AZURE_SPEECH_REGION ?? ''));

const KHMER = /[ក-៿]/;
const VOICE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+Neural$/;
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

/** Which voice reads this text: Khmer text → the Khmer voice, anything else → the English voice. */
export function voiceFor(env: Env, text: string): { voice: string; lang: string } {
  if (KHMER.test(text)) {
    const v = env.AZURE_SPEECH_VOICE_KM?.trim();
    return { voice: v && VOICE.test(v) ? v : 'km-KH-SreymomNeural', lang: 'km-KH' };
  }
  return { voice: 'en-US-JennyNeural', lang: 'en-US' };
}

/** Same text + same voice = same hash, so audio is only generated again when the words change. */
export const ttsHash = (env: Env, text: string) => sha256Hex(`${voiceFor(env, text).voice}|${text.trim()}`);

/** Speak `text` (slightly slower than normal, for clear instructions). Returns MP3 bytes. */
export async function synthesize(env: Env, text: string): Promise<ArrayBuffer> {
  if (!ttsConfigured(env)) throw new Error('tts_not_configured');
  const { voice, lang } = voiceFor(env, text);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="-8%">${esc(text.trim())}</prosody></voice></speak>`;
  const res = await fetch(`https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY!, 'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'anajak-secondhand',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`tts_http_${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength < 200) throw new Error('tts_empty');
  return buf;
}

/** Recorded audio: only real audio files (magic bytes), so nothing else can be stored as "voice". */
export function sniffAudio(b: Uint8Array): 'audio/wav' | 'audio/mpeg' | 'audio/mp4' | 'audio/webm' | 'audio/ogg' | null {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav';
  if (s(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (s(4, 4) === 'ftyp') return 'audio/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  return null;
}
