import { useEffect, useState } from 'react';

/** Auto-Skin: "dark" (workshop black & gold, default), "light" (ivory & gold) or "auto" (follows the phone). */
export type ThemeMode = 'auto' | 'dark' | 'light';
const KEY = 'hz_theme';

export const readTheme = (): ThemeMode => {
  try { const v = localStorage.getItem(KEY); return v === 'auto' || v === 'light' || v === 'dark' ? v : 'dark'; } catch { return 'dark'; }
};

export function applyTheme(mode: ThemeMode) {
  const light = mode === 'light' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  const root = document.documentElement;
  if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#FAF9F6' : '#0E0E10');
}

/** The chosen mode, a setter that saves it, and live switching while "auto" when the phone changes day / night. */
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(readTheme);
  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'auto' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => applyTheme('auto');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [mode]);
  const set = (m: ThemeMode) => { try { localStorage.setItem(KEY, m); } catch { /* private mode */ } setMode(m); };
  return [mode, set];
}
