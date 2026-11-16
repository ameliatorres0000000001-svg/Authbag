import { useCallback, useEffect, useState } from 'react';

/** The Home screen's moving background. The choice stays on this phone only (localStorage), like a theme. */
export const SCENES = ['galaxy', 'obsidian', 'aurora', 'marble', 'silk'] as const;
export type HomeScene = (typeof SCENES)[number];
export const SCENE_PIC: Record<HomeScene, string> = {
  galaxy: '/galaxy/home-bg.webp', obsidian: '/galaxy/obsidian.webp', aurora: '/galaxy/aurora.webp', marble: '/galaxy/marble.webp', silk: '/galaxy/silk.webp',
};
const KEY = 'hz_bg';

const read = (): HomeScene => {
  try { const v = localStorage.getItem(KEY); return (SCENES as readonly string[]).includes(v ?? '') ? (v as HomeScene) : 'galaxy'; } catch { return 'galaxy'; }
};

export function useHomeScene(): [HomeScene, (s: HomeScene) => void] {
  const [scene, setScene] = useState<HomeScene>('galaxy');
  useEffect(() => { setScene(read()); }, []);
  const pick = useCallback((s: HomeScene) => {
    setScene(s);
    try { localStorage.setItem(KEY, s); } catch { /* private mode: the choice just lasts until the page closes */ }
  }, []);
  return [scene, pick];
}
