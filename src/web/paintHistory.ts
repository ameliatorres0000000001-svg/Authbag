// Colour history for the paint skill: every bag colour a person scanned, with the leather, the finish and the mix, kept
// on this phone only (localStorage). The paint page is open to everyone (no login), so there is no server copy.

export interface HistoryPaint { name: string; code: string; hex: string | null; parts: number }
export interface PaintHistoryEntry {
  id: string; at: string; hex: string; approx: boolean; name: string;
  leather: string | null; finish: string | null;
  recipeId: string | null; recipeName: string | null; paints: HistoryPaint[];
}

const KEY = 'hz_paint_history';
const MAX = 40;

export function readHistory(): PaintHistoryEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === 'string' && /^#[0-9a-f]{6}$/i.test(e.hex ?? '')) : [];
  } catch { return []; }
}

const write = (list: PaintHistoryEntry[]) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* private mode / full: history is a convenience */ } };

/** Add a scan, or update the one with the same id (the mix arrives a moment after the colour). Newest first. */
export function saveHistory(e: PaintHistoryEntry) {
  const rest = readHistory().filter((x) => x.id !== e.id);
  const old = readHistory().find((x) => x.id === e.id);
  write([{ ...e, at: old?.at ?? e.at }, ...rest]);
}
export function deleteHistory(id: string) { write(readHistory().filter((x) => x.id !== id)); }
export function clearHistory() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
