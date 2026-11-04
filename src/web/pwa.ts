import { useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` once; keep it so the Install button can show the native dialog later.
let deferred: any = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
export const isMobile = () => typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/** Whether the native install dialog is available right now, and a function to open it. */
export function useInstallPrompt(): { canPrompt: boolean; prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'> } {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  return {
    canPrompt: !!deferred,
    prompt: async () => {
      if (!deferred) return 'unavailable';
      const ev = deferred; deferred = null;
      ev.prompt();
      const r = await ev.userChoice.catch(() => ({ outcome: 'dismissed' }));
      listeners.forEach((f) => f());
      return r.outcome === 'accepted' ? 'accepted' : 'dismissed';
    },
  };
}

export const INSTALL_SEEN = 'hz_install_seen';
export function markInstallSeen() { try { localStorage.setItem(INSTALL_SEEN, '1'); } catch { /* ignore */ } }
export function installSeen() { try { return localStorage.getItem(INSTALL_SEEN) === '1'; } catch { return true; } }
