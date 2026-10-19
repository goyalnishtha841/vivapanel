import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/*
 * Page background: a faint "minimap" of code lines (rounded bars of varying
 * length). Bars brighten in the brand colour near the pointer, and three
 * wandering spots in the examiners' colours drift across, holding on a line
 * for a moment, then jumping on: the panel reading your code.
 */
const ROW = 22;
const COL = 380; // width of one column of "code"
const EXAMINER_VARS = ["--prof", "--eng", "--jun"];

function rgb(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).map(Number);
}

// deterministic pseudo-random so the "code" doesn't reshuffle on resize
function rand(seed) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export default function CodeField({ className = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let w, h, bars, raf;
    const pointer = { x: -999, y: -999 };
    const spots = EXAMINER_VARS.map((v, i) => ({ v, x: 200 + i * 300, y: 200 + i * 120, tx: 0, ty: 0, hold: 0 }));

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bars = [];
      const cols = Math.ceil(w / COL);
      for (let c = 0; c < cols; c++) {
        let indent = 0;
        for (let r = 0; r * ROW < h + ROW; r++) {
          const s = c * 1000 + r;
          if (rand(s) < 0.12) { indent = 0; continue; } // blank line
          indent = Math.max(0, Math.min(3, indent + (rand(s + 0.5) < 0.3 ? 1 : rand(s + 0.7) < 0.3 ? -1 : 0)));
          const x = c * COL + 40 + indent * 22;
          const len = 40 + rand(s + 0.9) * 210;
          bars.push({ x, y: r * ROW + 12, len });
        }
      }
    }

    function retarget(sp) {
      sp.tx = 60 + Math.random() * (w - 120);
      sp.ty = 60 + Math.random() * (h - 120);
      sp.hold = 40 + Math.random() * 90;
    }

    function frame() {
      const muted = rgb("--muted");
      const brand = rgb("--brand");
      const dark = document.documentElement.classList.contains("dark");
      const colours = spots.map((s) => rgb(s.v));
      ctx.clearRect(0, 0, w, h);
      for (const sp of spots) {
        if (sp.hold > 0) sp.hold -= 1;
        else {
          sp.x += (sp.tx - sp.x) * 0.06;
          sp.y += (sp.ty - sp.y) * 0.06;
          if (Math.hypot(sp.tx - sp.x, sp.ty - sp.y) < 4) retarget(sp);
        }
      }
      for (const b of bars) {
        const cx = b.x + b.len / 2;
        let col = muted;
        let a = dark ? 0.05 : 0.07;
        const dp = Math.hypot(cx - pointer.x, b.y - pointer.y);
        if (dp < 160) {
          const k = 1 - dp / 160;
          col = brand;
          a += k * 0.32;
        }
        spots.forEach((sp, i) => {
          const d = Math.hypot(cx - sp.x, b.y - sp.y);
          if (d < 110) {
            const k = 1 - d / 110;
            if (k * 0.26 > a - 0.05) { col = colours[i]; a = Math.max(a, 0.05 + k * 0.26); }
          }
        });
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y - 3, b.len, 6, 3);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    layout();
    spots.forEach(retarget);
    frame();
    window.addEventListener("resize", layout);
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", layout);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduce]);

  // Dimmed behind the centre of the screen, where the content sits, so text stays readable.
  const mask = "radial-gradient(ellipse 42% 46% at 50% 45%, rgba(0,0,0,0.18), #000 78%)";
  return (
    <canvas ref={ref} aria-hidden="true" style={{ maskImage: mask, WebkitMaskImage: mask }}
      className={`pointer-events-none fixed inset-0 h-full w-full ${className}`} />
  );
}
