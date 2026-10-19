import { motion, useReducedMotion } from "framer-motion";

/** Hand-drawn red-pen underline that draws itself in. */
export function Underline({ className = "", delay = 0.6 }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <motion.path
        d="M4 15 C 60 7, 120 9, 170 12 S 260 18, 296 8"
        fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-brand"
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, delay, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

/** Hand-drawn loose circle around something. */
export function Circle({ className = "", delay = 0 }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true" className={`pointer-events-none absolute ${className}`}>
      <motion.path
        d="M30 12 C 90 -2, 190 6, 192 38 C 194 72, 70 80, 20 62 C -4 52, 6 22, 46 10"
        fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-brand"
        initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, delay, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

/** A handwritten red-pen note. */
export function Note({ children, className = "", rotate = -4, delay = 0 }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}
      className={`inline-block font-hand text-brand ${className}`} style={{ rotate: `${rotate}deg` }}
    >
      {children}
    </motion.span>
  );
}
