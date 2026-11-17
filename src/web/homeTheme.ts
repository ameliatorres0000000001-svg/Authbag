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

/** The picture behind every screen follows the scene chosen on Home (CSS variable read by body in index.css). */
export function applyScenePic(sc: HomeScene) {
  try { document.documentElement.style.setProperty('--bg-pic', `url(${SCENE_PIC[sc]})`); } catch { /* no document: nothing to do */ }
}
if (typeof document !== 'undefined') applyScenePic(read());

export function useHomeScene(): [HomeScene, (s: HomeScene) => void] {
  const [scene, setScene] = useState<HomeScene>('galaxy');
  useEffect(() => { setScene(read()); }, []);
  const pick = useCallback((s: HomeScene) => {
    setScene(s); applyScenePic(s);
    try { localStorage.setItem(KEY, s); } catch { /* private mode: the choice just lasts until the page closes */ }
  }, []);
  return [scene, pick];
}

/** Home layout: classic (hero + list of tools) or bento (big tiles + sideways best sellers). Kept on this phone only. */
export type HomeLayout = 'classic' | 'bento';
const LKEY = 'hz_layout';
export function useHomeLayout(): [HomeLayout, (l: HomeLayout) => void] {
  const [layout, setLayout] = useState<HomeLayout>('classic');
  useEffect(() => { try { if (localStorage.getItem(LKEY) === 'bento') setLayout('bento'); } catch { /* ignore */ } }, []);
  const pick = useCallback((l: HomeLayout) => {
    setLayout(l);
    try { localStorage.setItem(LKEY, l); } catch { /* private mode */ }
  }, []);
  return [layout, pick];
}
