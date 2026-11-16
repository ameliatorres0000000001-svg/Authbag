import { useEffect, useMemo, useRef } from 'react';
import { SCENE_PIC, type HomeScene } from './homeTheme.ts';

/** Weak phones (few cores / little memory / data saver) get a lighter sky: fewer stars, still clouds, no sparkles or blur. */
const detectLite = (): boolean => {
  try {
    const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    return !!n.connection?.saveData || (!!n.deviceMemory && n.deviceMemory <= 2) || (!!n.hardwareConcurrency && n.hardwareConcurrency <= 4);
  } catch { return false; }
};

/**
 * Live galaxy background: drifting violet / blue / gold nebula clouds, three layers of stars that twinkle and
 * slowly drift (parallax), shooting stars every few seconds, a breathing gold glow behind the logo and gold
 * sparkles rising. Pure CSS, fixed behind the scrolling page; all motion stops for users who prefer reduced motion.
 * Also defines the keyframes used by the country cards (hz-spin, hz-pulse, hz-rise-in) and the AI wait screen.
 * `calm` (home screen, seen every day): half the stars, one shooting star, no rising sparkles, a darker veil so text reads well.
 * Battery: the animation pauses while the tab is hidden, clouds are plain gradients (no blur filter), layers are GPU
 * transforms, and weak phones get the lighter sky above (also sets <html data-fx="lite"> so cards drop their glass blur).
 */
export default function Galaxy({ calm = false, scene = 'galaxy' }: { calm?: boolean; scene?: HomeScene }) {
  const root = useRef<HTMLDivElement>(null);
  const lite = useMemo(detectLite, []);
  useEffect(() => {
    const el = root.current;
    const sync = () => el?.classList.toggle('hz-paused', document.hidden);
    document.addEventListener('visibilitychange', sync);
    sync();
    document.documentElement.dataset.fx = lite ? 'lite' : 'full';
    return () => { document.removeEventListener('visibilitychange', sync); delete document.documentElement.dataset.fx; };
  }, [lite]);
  const stars = (n: number, size: number, seed: number) => {
    let x = seed;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, () => {
      const warm = r() < 0.18; // a few gold-tinted stars
      return `radial-gradient(${size}px ${size}px at ${Math.round(r() * 1000) / 10}% ${Math.round(r() * 1000) / 10}%, ${warm ? `rgba(255,226,150,${(0.6 + r() * 0.4).toFixed(2)})` : `rgba(255,255,255,${(0.45 + r() * 0.55).toFixed(2)})`}, transparent)`;
    }).join(',');
  };
  // nebula clouds: colour, size, left, top, animation
  const clouds: [string, string, string, string, string][] = [
    ['rgba(242,202,80,0.20)', '80vmin', 'calc(50% - 40vmin)', '0%', 'hz-glow 9s ease-in-out infinite alternate'],
    ['rgba(108,64,170,0.30)', '95vmin', '-35vmin', '28%', 'hz-drift 38s ease-in-out infinite alternate'],
    ['rgba(30,64,160,0.28)', '90vmin', '45%', '55%', 'hz-drift 46s ease-in-out -12s infinite alternate-reverse'],
    ['rgba(190,70,120,0.16)', '70vmin', '55%', '8%', 'hz-drift 52s ease-in-out -20s infinite alternate'],
  ];
  // star layers: count, size, seed, drift seconds (slower = farther), twinkle
  const layers: [number, number, number, number, string][] = [
    [110, 1, 7, 240, 'hz-twinkle 5s ease-in-out infinite'],
    [45, 1.6, 13, 160, 'hz-twinkle 7s ease-in-out -2s infinite reverse'],
    [16, 2.4, 29, 100, 'hz-twinkle 4s ease-in-out -1s infinite'],
  ];
  // shooting stars: top, left, cycle seconds, delay seconds
  const meteorsAll: [string, string, number, number][] = [['8%', '70%', 9, 1.5], ['22%', '95%', 13, 6], ['40%', '60%', 17, 11]];
  // scenes (home only): galaxy = clouds + milky way; aurora = stars + a shooting star over the curtains; marble / silk = the picture plus one light sweep
  const space = !calm || scene === 'galaxy';
  const starry = space || scene === 'aurora';
  const meteors = lite || !starry ? [] : calm ? meteorsAll.slice(1, 2) : meteorsAll;
  const sparklesAll: [string, string, number, number][] = [['12%', '22px', 26, 0], ['78%', '16px', 22, 4], ['64%', '18px', 30, 14], ['88%', '12px', 24, 2], ['35%', '14px', 28, 9]];
  const sparkles = lite ? [] : calm ? (scene === 'marble' ? sparklesAll.slice(0, 3) : []) : sparklesAll;
  // the star gradients are long strings: build them once, not on every re-render of the page above
  const sky = useMemo(() => layers.map(([n0, size, seed]) => stars(calm || lite ? Math.round(n0 / (lite ? 3 : 2)) : n0, size, seed)), [calm, lite]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={root} aria-hidden className={`pointer-events-none fixed inset-0 overflow-hidden ${calm ? 'galaxy-calm' : ''}`} style={{ contain: 'strict', background: 'radial-gradient(130% 90% at 50% 0%, #120c22 0%, #06050c 45%, #000 100%)' }}>
      <style>{`
        @keyframes hz-pan { from { transform: scale(1) translate(0,0) } to { transform: scale(1.14) translate(-2.5%,-3.5%) } }
        @keyframes hz-glow { from { opacity: .55; transform: scale(.95) } to { opacity: 1; transform: scale(1.05) } }
        @keyframes hz-drift { from { transform: translate(0,0) scale(1) } to { transform: translate(12vmin,-8vmin) scale(1.15) } }
        @keyframes hz-twinkle { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes hz-stars { from { transform: translateY(0) } to { transform: translateY(-100vh) } }
        @keyframes hz-meteor { 0% { transform: translate(0,0) rotate(-35deg); opacity: 0 } 2% { opacity: 1 } 9% { transform: translate(-60vmin,42vmin) rotate(-35deg); opacity: 0 } 100% { opacity: 0 } }
        @keyframes hz-rise { 0% { transform: translateY(0) rotate(0deg); opacity: 0 } 10% { opacity: .55 } 90% { opacity: .55 } 100% { transform: translateY(-110vh) rotate(180deg); opacity: 0 } }
        @keyframes hz-sheen { from { transform: translateX(-70%) skewX(-18deg) } to { transform: translateX(70%) skewX(-18deg) } }
        @keyframes hz-spin { to { transform: rotate(360deg) } }
        @keyframes hz-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes hz-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
        @keyframes hz-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .hz-rise-in { animation: hz-in .7s cubic-bezier(.2,.7,.2,1) both }
        .hz-paused .hz-anim { animation-play-state: paused !important }
        @media (prefers-reduced-motion: reduce) { .hz-anim, .hz-rise-in { animation: none !important } }
      `}</style>
      {/* home: a real picture of the Milky Way (85 KB) drifting very slowly; the clouds, stars and meteors below stay live on top of it */}
      {calm && <div key={scene} className="hz-anim absolute" style={{ inset: '-6%', backgroundImage: `url(${SCENE_PIC[scene]})`, backgroundSize: 'cover', backgroundPosition: 'center', willChange: lite ? undefined : 'transform', animation: lite ? 'none' : 'hz-pan 90s ease-in-out infinite alternate' }} />}
      {space && (calm ? clouds.slice(0, 2) : clouds).map(([c, size, left, top, anim], i) => (
        <div key={i} className="hz-anim absolute rounded-full" style={{ width: size, height: size, left, top, background: `radial-gradient(circle, ${c}, transparent 70%)`, willChange: lite ? undefined : 'transform, opacity', animation: lite ? 'none' : anim }} />
      ))}
      {/* the Milky Way: one faint tilted band of light across the sky (static, costs nothing to draw) */}
      {space && <div className="absolute" style={{ left: '-25%', top: '22%', width: '150%', height: '42vmin', transform: 'rotate(-24deg)', background: 'radial-gradient(ellipse at center, rgba(200,180,255,0.15), rgba(255,226,170,0.07) 42%, transparent 70%)' }} />}
      {starry && layers.map(([, , , drift, tw], i) => { return (
        // 200vh tall, the same star tile twice: moving it up by 100vh loops without a seam
        <div key={i} className="hz-anim absolute inset-x-0 top-0 h-[200vh]" style={{ animation: `hz-stars ${drift}s linear infinite`, willChange: 'transform' }}>
          <div className="hz-anim h-full w-full" style={{ backgroundImage: sky[i], backgroundSize: '100% 100vh', animation: tw }} />
        </div>
      ); })}
      {meteors.map(([top, left, cycle, delay], i) => (
        <span key={i} className="hz-anim absolute h-px w-[22vmin]" style={{ top, left, opacity: 0, background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(242,202,80,0.5) 30%, transparent)', boxShadow: '0 0 8px rgba(255,255,255,0.6)', animation: `hz-meteor ${cycle}s ease-out ${delay}s infinite` }} />
      ))}
      {sparkles.map(([left, size, dur, delay], i) => (
        <span key={i} className="hz-anim absolute bottom-[-40px]" style={{ left, fontSize: size, color: '#f2ca50', textShadow: '0 0 12px rgba(242,202,80,0.6)', animation: `hz-rise ${dur}s linear ${delay}s infinite`, opacity: 0 }}>✦</span>
      ))}
      {calm && !lite && (scene === 'marble' || scene === 'silk') && (
        <div aria-hidden className="hz-anim absolute inset-y-0 left-0 w-full" style={{ background: scene === 'marble' ? 'linear-gradient(100deg, transparent 38%, rgba(255,222,140,0.10) 50%, transparent 62%)' : 'linear-gradient(100deg, transparent 38%, rgba(255,170,160,0.12) 50%, transparent 62%)', willChange: 'transform', animation: 'hz-sheen 16s ease-in-out infinite alternate' }} />
      )}
      {calm && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.5))' }} />}
    </div>
  );
}
