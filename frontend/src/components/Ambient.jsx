import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/*
 * Page background: three slow ambient glows in the examiners' colours drifting on
 * long Lissajous paths, a soft red-pen glow that trails the cursor, and fine paper
 * grain on top. Transforms only, so it stays on the compositor.
 */
const ORBS = [
  { tone: "--prof", size: "62vmax", x: [0.12, 0.18], y: [0.1, 0.22], speed: [0.00011, 0.00009], phase: 0 },
  { tone: "--eng", size: "56vmax", x: [0.82, 0.16], y: [0.32, 0.2], speed: [0.00008, 0.00012], phase: 2.1 },
  { tone: "--jun", size: "48vmax", x: [0.42, 0.22], y: [0.86, 0.12], speed: [0.0001, 0.00007], phase: 4.2 },
];

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.2 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

export default function Ambient({ intensity = 1 }) {
  const reduce = useReducedMotion();
  const orbs = useRef([]);
  const glow = useRef(null);

  useEffect(() => {
    let raf;
    const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 };
    const pos = { ...target };
    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    const place = (t) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ORBS.forEach((o, i) => {
        const el = orbs.current[i];
        if (!el) return;
        const x = (o.x[0] + Math.sin(t * o.speed[0] + o.phase) * o.x[1]) * w;
        const y = (o.y[0] + Math.cos(t * o.speed[1] + o.phase) * o.y[1]) * h;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      });
      pos.x += (target.x - pos.x) * 0.06;
      pos.y += (target.y - pos.y) * 0.06;
      if (glow.current) glow.current.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
    };
    const frame = (t) => {
      place(t);
      raf = requestAnimationFrame(frame);
    };
    place(0);
    if (!reduce) {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onMove, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduce]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {ORBS.map((o, i) => (
        <div
          key={o.tone}
          ref={(el) => (orbs.current[i] = el)}
          className="absolute left-0 top-0 rounded-full will-change-transform"
          style={{
            width: o.size,
            height: o.size,
            opacity: intensity,
            background: `radial-gradient(circle at center, rgb(var(${o.tone}) / var(--orb-alpha)) 0%, rgb(var(${o.tone}) / 0) 62%)`,
          }}
        />
      ))}
      <div
        ref={glow}
        className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full will-change-transform"
        style={{ background: "radial-gradient(circle, rgb(var(--brand) / var(--glow-alpha)) 0%, rgb(var(--brand) / 0) 65%)" }}
      />
      <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: "var(--grain-alpha)", mixBlendMode: "overlay" }} />
    </div>
  );
}
