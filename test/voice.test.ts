import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, encodeWav } from '../src/shared/wav.ts';
import { sniffAudio } from '../src/worker/tts.ts';

test('WAV encoding: valid header, 16 kHz mono 16-bit, recognised as audio', () => {
  const tone = new Float32Array(48000).map((_, i) => Math.sin((i / 48000) * 2 * Math.PI * 440) * 0.5);
  const ds = downsample(tone, 48000, 16000);
  assert.equal(ds.length, 16000);
  const wav = encodeWav(ds, 16000);
  assert.equal(wav.length, 44 + 16000 * 2);
  const v = new DataView(wav.buffer);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(sniffAudio(wav), 'audio/wav');
});

test('sniffAudio rejects non-audio and knows the common formats', () => {
  assert.equal(sniffAudio(new TextEncoder().encode('<html>hello</html>')), null);
  assert.equal(sniffAudio(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 0, 0])), 'audio/mpeg');
  assert.equal(sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'audio/webm');
  assert.equal(sniffAudio(new TextEncoder().encode('OggS\0\0\0\0\0\0\0\0')), 'audio/ogg');
});
