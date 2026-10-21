import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/*
 * Page background: a night-sky scene behind every page.
 *
 *   1. a faint dot grid (CSS, static)
 *   2. glowing orbital arcs that sweep in from the edges, with a light pulse travelling along each one (SVG)
 *   3. glossy spheres floating gently near the edges (CSS)
 *   4. one canvas: drifting, twinkling particles and a rolling particle wave along the bottom
 *
 * The wave and spheres stay away from the centre column, so text never sits on them.
 * `calm` (session, report) keeps only the grid, faint arcs and a few particles: no wave, no spheres.
 * Reduced motion: everything is drawn once and stays still. The canvas pauses while the tab is hidden.
 */

// The wave's colour runs left to right through the mockup's palette.
const WAVE_STOPS = [
  [0.0, [150, 92, 255]],
  [0.22, [70, 140, 255]],
  [0.42, [255, 112, 58]],
  [0.58, [255, 72, 112]],
  [0.78, [72, 132, 255]],
  [1.0, [40, 218, 196]],
];
const PARTICLE_COLORS = [[255, 112, 70], [52, 211, 178], [140, 110, 255], [90, 160, 255], [255, 90, 140]];

function waveColor(u) {
  for (let i = 1; i < WAVE_STOPS.length; i += 1) {
    const [p1, c1] = WAVE_STOPS[i];
    const [p0, c0] = WAVE_STOPS[i - 1];
    if (u <= p1) {
      const k = (u - p0) / (p1 - p0);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return WAVE_STOPS[WAVE_STOPS.length - 1][1];
}

// A soft glow sprite per colour, drawn once and stamped many times (much cheaper than shadowBlur).
function sprite([r, g, b]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.18, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return c;
}

/* ---------- orbital arcs (viewBox 1440 x 900, scaled to cover) ---------- */
const ARCS = [
  { d: "M -60 110 C 250 130, 430 400, 250 780", from: "#34D3B2", to: "#8B5CFF", dur: 11, delay: 0 },
  { d: "M -80 640 C 160 540, 330 470, 520 500", from: "#FF4E8A", to: "#FF8A3D", dur: 9, delay: 2.5, faint: true },
  { d: "M 1520 70 C 1230 120, 1110 360, 1240 720", from: "#FF8A3D", to: "#34D3B2", dur: 12, delay: 1 },
  { d: "M 1520 520 C 1320 560, 1170 520, 1020 380", from: "#34D3B2", to: "#8B5CFF", dur: 10, delay: 4, faint: true },
  { d: "M 960 920 C 1180 780, 1320 700, 1520 500", from: "#FF4E8A", to: "#8B5CFF", dur: 13, delay: 3 },
];

// Glossy spheres: position in % of the viewport, size in px. `wide` ones only appear on large screens.
const SPHERES = [
  { x: 3, y: 68, s: 60, c: ["#FFB37A", "#FF4E6A"], wide: true, dur: 9 },
  { x: 7, y: 30, s: 22, c: ["#8EE8FF", "#2F7BFF"], dur: 7 },
  { x: 96, y: 60, s: 50, c: ["#FFC08A", "#B05CFF"], wide: true, dur: 10 },
  { x: 95.5, y: 18, s: 26, c: ["#9DFFF0", "#16B8A0"], dur: 8 },
  { x: 2.5, y: 86, s: 30, c: ["#8DFFE8", "#13A08C"], wide: true, dur: 8.5 },
  { x: 91, y: 84, s: 40, c: ["#B9A2FF", "#5A34E0"], wide: true, dur: 11 },
  { x: 97, y: 70, s: 16, c: ["#FFD0A0", "#FF6A3D"], dur: 6.5 },
];

export default function Ambient({ calm = false }) {
  const reduce = useReducedMotion();
  const canvas = useRef(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!ctx) return undefined;

    const sprites = PARTICLE_COLORS.map(sprite);
    let raf = 0;
    let w = 0;
    let h = 0;
    let particles = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = calm ? 14 : w < 640 ? 22 : 46;
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.2 + Math.random() * 2.4,
        vy: -(0.04 + Math.random() * 0.12),
        vx: (Math.random() - 0.5) * 0.06,
        phase: Math.random() * Math.PI * 2,
        color: Math.floor(Math.random() * sprites.length),
      }));
    };

    const drawWave = (t, dark) => {
      const rows = w < 640 ? 16 : 24;
      const cols = w < 640 ? 80 : 170;
      const top = h * (w < 640 ? 0.8 : 0.66);
      const span = h - top;
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (let r = 0; r < rows; r += 1) {
        const z = r / (rows - 1); // 0 = far (top), 1 = near (bottom)
        const base = top + span * (0.15 + 0.95 * z ** 1.35);
        const spread = w * (1.05 + 0.5 * z);
        const amp = span * (0.1 + 0.16 * z);
        for (let c = 0; c < cols; c += 1) {
          const u = c / (cols - 1);
          const x = w / 2 + (u - 0.5) * spread;
          if (x < -10 || x > w + 10) continue;
          // two crossing waves, rising toward both sides like the mockup
          const lift = (Math.abs(u - 0.5) * 2) ** 1.6 * span * 0.35;
          const y = base
            - lift * (1 - z * 0.6)
            - Math.sin(u * 7.5 + t * 0.00055 + r * 0.32) * amp * 0.55
            - Math.sin(u * 13 - t * 0.0008 + r * 0.5) * amp * 0.22;
          const col = waveColor(u);
          // keep the centre-top of the wave dim so text above it stays clean
          const centre = 1 - Math.max(0, 1 - Math.abs(u - 0.5) * 2.6) * (1 - z) * 0.45;
          const a = (0.22 + 0.78 * z) * centre * (dark ? 1 : 0.6);
          ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`;
          const s = 0.8 + 1.9 * z;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawParticles = (t, dark) => {
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const p of particles) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -20) { p.y = h + 20; p.x = Math.random() * w; }
          if (p.x < -20) p.x = w + 20;
          if (p.x > w + 20) p.x = -20;
        }
        const tw = 0.55 + 0.45 * Math.sin(t * 0.0016 + p.phase);
        const size = p.r * 7;
        ctx.globalAlpha = (dark ? 0.75 : 0.45) * tw * (calm ? 0.6 : 1);
        ctx.drawImage(sprites[p.color], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      const dark = document.documentElement.classList.contains("dark");
      if (!calm) drawWave(t, dark);
      drawParticles(t, dark);
    };

    const frame = (t) => {
      draw(t);
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      resize();
      if (reduce) draw(0);
    };

    resize();
    window.addEventListener("resize", onResize);
    if (reduce) draw(0);
    else {
      raf = requestAnimationFrame(frame);
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduce, calm]);

  return (
    <div aria-hidden="true" className={`cosmos pointer-events-none fixed inset-0 -z-10 overflow-hidden ${calm ? "cosmos-calm" : ""}`}>
      <div className="cosmos-glow" />
      <div className="cosmos-grid" />

      <svg className="cosmos-arcs absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          {ARCS.map((a, i) => (
            <linearGradient key={i} id={`arc-g${i}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={a.from} stopOpacity="0" />
              <stop offset="0.25" stopColor={a.from} />
              <stop offset="0.8" stopColor={a.to} />
              <stop offset="1" stopColor={a.to} stopOpacity="0" />
            </linearGradient>
          ))}
          <filter id="arc-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        {ARCS.map((a, i) => (
          <g key={i} opacity={a.faint ? 0.55 : 1}>
            <path id={`arc-p${i}`} d={a.d} fill="none" stroke={`url(#arc-g${i})`} strokeWidth="7" opacity="0.35" filter="url(#arc-blur)" />
            <path d={a.d} fill="none" stroke={`url(#arc-g${i})`} strokeWidth="1.6" />
            {!reduce && (
              <path d={a.d} pathLength="1000" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"
                className="arc-pulse" style={{ animationDuration: `${a.dur}s`, animationDelay: `-${a.delay}s` }} />
            )}
            {!reduce && !calm && (
              <circle r="3.2" fill={a.to} className="arc-dot">
                <animateMotion dur={`${a.dur * 1.4}s`} begin={`-${a.delay}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#arc-p${i}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        ))}
      </svg>

      {!calm && SPHERES.map((s, i) => (
        <span key={i} className={`sphere ${s.wide ? "hidden xl:block" : "hidden lg:block"}`}
          style={{
            left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s,
            background: `radial-gradient(circle at 32% 28%, #fff 0%, ${s.c[0]} 22%, ${s.c[1]} 70%, rgba(0,0,0,0.55) 100%)`,
            boxShadow: `0 0 ${s.s * 0.8}px ${s.s * 0.12}px ${s.c[1]}55`,
            animationDuration: `${s.dur}s`,
            animationDelay: `-${i * 1.3}s`,
          }} />
      ))}

      <canvas ref={canvas} className="absolute inset-0" />
    </div>
  );
}
