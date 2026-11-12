/**
 * Live galaxy background: drifting violet / blue / gold nebula clouds, three layers of stars that twinkle and
 * slowly drift (parallax), shooting stars every few seconds, a breathing gold glow behind the logo and gold
 * sparkles rising. Pure CSS, fixed behind the scrolling page; all motion stops for users who prefer reduced motion.
 * Also defines the keyframes used by the country cards (hz-spin, hz-pulse, hz-rise-in) and the AI wait screen.
 * `calm` (home screen, seen every day): half the stars, one shooting star, no rising sparkles, a darker veil so text reads well.
 */
export default function Galaxy({ calm = false }: { calm?: boolean }) {
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
  const meteors = calm ? meteorsAll.slice(1, 2) : meteorsAll;
  const sparklesAll: [string, string, number, number][] = [['12%', '22px', 26, 0], ['78%', '16px', 22, 4], ['64%', '18px', 30, 14], ['88%', '12px', 24, 2], ['35%', '14px', 28, 9]];
  const sparkles = calm ? [] : sparklesAll;
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-0 overflow-hidden ${calm ? 'galaxy-calm' : ''}`} style={{ zIndex: calm ? -1 : undefined, background: 'radial-gradient(130% 90% at 50% 0%, #120c22 0%, #06050c 45%, #000 100%)' }}>
      <style>{`
        @keyframes hz-glow { from { opacity: .55; transform: scale(.95) } to { opacity: 1; transform: scale(1.05) } }
        @keyframes hz-drift { from { transform: translate(0,0) scale(1) } to { transform: translate(12vmin,-8vmin) scale(1.15) } }
        @keyframes hz-twinkle { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        @keyframes hz-stars { from { transform: translateY(0) } to { transform: translateY(-100vh) } }
        @keyframes hz-meteor { 0% { transform: translate(0,0) rotate(-35deg); opacity: 0 } 2% { opacity: 1 } 9% { transform: translate(-60vmin,42vmin) rotate(-35deg); opacity: 0 } 100% { opacity: 0 } }
        @keyframes hz-rise { 0% { transform: translateY(0) rotate(0deg); opacity: 0 } 10% { opacity: .55 } 90% { opacity: .55 } 100% { transform: translateY(-110vh) rotate(180deg); opacity: 0 } }
        @keyframes hz-spin { to { transform: rotate(360deg) } }
        @keyframes hz-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes hz-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.07) } }
        @keyframes hz-in { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
        .hz-rise-in { animation: hz-in .7s cubic-bezier(.2,.7,.2,1) both }
        @media (prefers-reduced-motion: reduce) { .hz-anim, .hz-rise-in { animation: none !important } }
      `}</style>
      {clouds.map(([c, size, left, top, anim], i) => (
        <div key={i} className="hz-anim absolute rounded-full" style={{ width: size, height: size, left, top, background: `radial-gradient(circle, ${c}, transparent 65%)`, filter: 'blur(50px)', animation: anim }} />
      ))}
      {layers.map(([n0, size, seed, drift, tw], i) => { const n = calm ? Math.round(n0 / 2) : n0; return (
        // 200vh tall, the same star tile twice: moving it up by 100vh loops without a seam
        <div key={i} className="hz-anim absolute inset-x-0 top-0 h-[200vh]" style={{ animation: `hz-stars ${drift}s linear infinite` }}>
          <div className="hz-anim h-full w-full" style={{ backgroundImage: stars(n, size, seed), backgroundSize: '100% 100vh', animation: tw }} />
        </div>
      ); })}
      {meteors.map(([top, left, cycle, delay], i) => (
        <span key={i} className="hz-anim absolute h-px w-[22vmin]" style={{ top, left, opacity: 0, background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(242,202,80,0.5) 30%, transparent)', boxShadow: '0 0 8px rgba(255,255,255,0.6)', animation: `hz-meteor ${cycle}s ease-out ${delay}s infinite` }} />
      ))}
      {sparkles.map(([left, size, dur, delay], i) => (
        <span key={i} className="hz-anim absolute bottom-[-40px]" style={{ left, fontSize: size, color: '#f2ca50', textShadow: '0 0 12px rgba(242,202,80,0.6)', animation: `hz-rise ${dur}s linear ${delay}s infinite`, opacity: 0 }}>✦</span>
      ))}
      {calm && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.55))' }} />}
    </div>
  );
}
