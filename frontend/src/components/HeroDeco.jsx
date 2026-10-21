import { motion, useReducedMotion } from "framer-motion";
import CodeLines from "./CodeLines.jsx";

/*
 * The hero's side pieces: a tilted code window on the left (real code from the sample project) and the
 * three examiners' opening questions on the right. Decorative only (aria-hidden), and shown only on wide
 * screens where they sit fully outside the headline column, so they never overlap the text.
 */

// app/services/fines.py from the sample project, (signature wrapped to fit)
const CODE = `from datetime import date

FINE_PER_DAY = 5  # rupees
MAX_FINE = 500

def calculate_fine(
    due: date, returned: date
) -> int:
    days_late = (returned - due).days
    return min(days_late * FINE_PER_DAY,
               MAX_FINE)`;

const Cap = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3 1 8.5 12 14l9-4.5V16h2V8.5L12 3zM5 12.2V16c0 1.7 3.1 3.5 7 3.5s7-1.8 7-3.5v-3.8l-7 3.5-7-3.5z" />
  </svg>
);
const Case = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v4H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 3h6V5H9v1zM2 14h8v1.5h4V14h8v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" />
  </svg>
);
const Bulb = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z" />
  </svg>
);

const CARDS = [
  { who: "Professor", q: "Why did you choose this approach?", icon: <Cap />, tone: "neon-blue", text: "text-prof", chip: "from-[#4F7BFF] to-[#7A94FF]" },
  { who: "Industry Engineer", q: "How does this scale in production?", icon: <Case />, tone: "neon-gold", text: "text-[#FFB066]", chip: "from-[#FF8A3D] to-[#C9692A]" },
  { who: "Curious Junior", q: "Can you explain it simply?", icon: <Bulb />, tone: "neon-violet", text: "text-violet", chip: "from-[#8B5CFF] to-[#C06BFF]" },
];

export default function HeroDeco() {
  const reduce = useReducedMotion();
  const enter = (d, x) => ({
    initial: reduce ? false : { opacity: 0, x },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.9, delay: d, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden min-[1440px]:block" style={{ perspective: "1400px" }}>
      {/* left: the code under examination */}
      <motion.div {...enter(0.5, -40)} className="absolute left-[max(20px,calc(50%-700px))] top-[196px] w-[330px]">
        <div className="drift" style={{ transform: "rotateY(22deg) rotateZ(-5deg)", transformStyle: "preserve-3d" }}>
          <div className="neon neon-ocean overflow-hidden rounded-[20px]">
            <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
              <span className="win-dots"><i /><i /><i /></span>
              <span className="font-mono text-[11px] text-muted">fines.py</span>
            </div>
            <CodeLines code={CODE} marked={[10]} className="px-4 py-3 text-[10.5px] leading-[1.85]" />
          </div>
        </div>
      </motion.div>

      {/* right: the three examiners' opening questions */}
      <div className="absolute right-[max(20px,calc(50%-700px))] top-[178px] w-[280px] space-y-4">
        {CARDS.map((c, i) => (
          <motion.div key={c.who} {...enter(0.7 + i * 0.15, 40)}>
            <div className="drift" style={{ animationDelay: `-${i * 1.6}s`, transform: `rotateY(-20deg) rotateZ(${4 - i * 0.5}deg)` }}>
              <div className={`neon ${c.tone} flex items-start gap-3 rounded-[18px] px-4 py-3.5`}>
                <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${c.chip} text-white shadow-[0_0_18px_-2px_currentColor]`}>
                  {c.icon}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[14px] font-semibold ${c.text}`}>{c.who}</span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-ink/85">{c.q}</span>
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
