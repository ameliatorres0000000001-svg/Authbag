// A waiting time written inside a step ("ទុកស្ងួត ២០ នាទី", "dry 15–20 minutes") → minutes for the step timer.

const KM_DIGITS = '០១២៣៤៥៦៧៨៩';
const latin = (s: string) => s.replace(/[០-៩]/g, (d) => String(KM_DIGITS.indexOf(d)));

/**
 * Minutes named in a step, or null. A range takes the longer time (drying too little is the usual mistake).
 * Only 1–120 minutes: hours and days ("24 ម៉ោង") are not a timer to sit and watch.
 */
export function minutesIn(text: string): number | null {
  const m = latin(String(text ?? '')).match(/(\d{1,3})(?:\s*[-–~]\s*(\d{1,3}))?\s*(?:នាទី|minutes?\b|mins?\b)/i);
  if (!m) return null;
  const n = Math.max(Number(m[1]), m[2] ? Number(m[2]) : 0);
  return n >= 1 && n <= 120 ? n : null;
}
