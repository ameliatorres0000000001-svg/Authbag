import { useCallback, useEffect, useState } from 'react';
import { useI18n } from './i18n.tsx';

// Sound for people who prefer listening to reading. Order: our audio file (staff recording or AI Khmer voice),
// then the phone's own voice if it has one for the language, otherwise silence (the text stays on screen).

let current: HTMLAudioElement | null = null;
export function stopAudio() {
  if (current) { current.onended = null; current.onerror = null; current.pause(); current = null; }
  try { window.speechSynthesis?.cancel(); } catch { /* not supported */ }
}

/** Play an audio URL; resolves true when it finished, false when it could not play. */
export function playUrl(url: string): Promise<boolean> {
  stopAudio();
  return new Promise((resolve) => {
    const a = new Audio(url); current = a;
    a.onended = () => resolve(true);
    a.onerror = () => resolve(false);
    a.play().catch(() => resolve(false));
  });
}

const LANG: Record<string, string> = { km: 'km', en: 'en', vi: 'vi', th: 'th', id: 'id' };
/** The phone's own text-to-speech, only if it really has a voice for this language. */
export function speakText(text: string, locale: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    const lang = /[ក-៿]/.test(text) ? 'km' : LANG[locale] ?? 'en';
    const voice = s?.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (!s || !voice) return resolve(false);
    stopAudio();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice; u.lang = voice.lang; u.rate = 0.92;
    u.onend = () => resolve(true); u.onerror = () => resolve(false);
    s.speak(u);
  });
}

export async function say(url: string | null, text: string, locale: string): Promise<boolean> {
  if (url && (await playUrl(url))) return true;
  return speakText(text, locale);
}

/** Spoken app phrases (scanner guidance). Off until the person turns it on; the choice is remembered on this phone. */
let uiAvailable: Promise<Set<string>> | null = null;
export function useUiVoice() {
  const { t, locale } = useI18n();
  const [on, setOn] = useState(() => { try { return localStorage.getItem('hz_voice') === '1'; } catch { return false; } });
  const [have, setHave] = useState<Set<string>>(new Set());
  useEffect(() => {
    uiAvailable ??= fetch('/api/voice/ui').then((r) => r.json() as Promise<{ available: { key: string; lang: string }[] }>).then((d) => new Set(d.available.map((x) => `${x.lang}/${x.key}`))).catch(() => new Set<string>());
    uiAvailable.then(setHave);
  }, []);
  const toggle = useCallback(() => setOn((v) => { const n = !v; try { localStorage.setItem('hz_voice', n ? '1' : '0'); } catch { /* private mode */ } if (!n) stopAudio(); return n; }), []);
  const sayKey = useCallback((key: string) => {
    if (!on) return;
    say(have.has(`${locale}/${key}`) ? `/api/voice/ui/${locale}/${key}` : null, t(key), locale);
  }, [on, have, locale, t]);
  return { on, toggle, sayKey };
}
