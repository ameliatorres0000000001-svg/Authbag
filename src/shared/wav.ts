// Turn microphone samples into a small WAV file (16 kHz, mono, 16-bit). WAV plays on every phone — Android and
// iPhone — unlike the formats browsers record natively, so a voice recorded on one phone plays on all of them.

/** Average-down from the microphone rate (e.g. 48000) to `to` Hz. */
export function downsample(samples: Float32Array, from: number, to = 16000): Float32Array {
  if (to >= from) return samples;
  const ratio = from / to, out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += samples[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

export function encodeWav(samples: Float32Array, rate = 16000): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Uint8Array(buf);
}
