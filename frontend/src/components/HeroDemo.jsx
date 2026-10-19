import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import recorded from "../mock/session.json";
import Avatar from "./Avatar.jsx";
import CodeText from "./CodeText.jsx";
import { Wrench } from "./Icons.jsx";
import { EXAMINERS, ORDER, TONE, VERDICT, verdictIn } from "../lib/examiners.js";

// A real recorded session (Groq, 20 Oct 2026), trimmed to its two best moments:
// a vague answer caught and recovered, then a claim checked in the sandbox.
const SCRIPT = [2, 3, 4, 5, 20, 21, 22, 23, 24].map((i) => recorded[i]);
const STEP_MS = 2600;

export default function HeroDemo() {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? SCRIPT.length : 1);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setN((v) => (v >= SCRIPT.length + 2 ? 1 : v + 1)), STEP_MS);
    return () => clearInterval(t);
  }, [reduce]);

  const shown = SCRIPT.slice(0, Math.min(n, SCRIPT.length));
  const start = Math.max(0, shown.length - 4);
  const visible = shown.slice(start).map((e, i) => ({ e, key: start + i }));
  const current = [...shown].reverse().find((e) => EXAMINERS[e.speaker]);

  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-surface/80 shadow-[0_50px_120px_-50px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <span className="text-[14px] font-medium text-ink">campus-library-api</span>
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> Replay of a real session
        </span>
      </div>

      <div className="grid gap-0 md:grid-cols-[200px_1fr]">
        {/* examiners */}
        <div className="flex gap-3 border-b border-line p-4 md:flex-col md:border-b-0 md:border-r">
          {ORDER.map((s) => {
            const on = current?.speaker === s;
            const t = TONE[EXAMINERS[s].tone];
            return (
              <div key={s} className={`flex flex-1 items-center gap-3 rounded-2xl p-2.5 transition-colors ${on ? `${t.soft} ring-1 ${t.ring}` : ""}`}>
                <Avatar speaker={s} size={36} speaking={on && !reduce} dim={!on} />
                <div className="hidden min-w-0 sm:block">
                  <div className={`text-[13px] font-semibold ${on ? t.text : "text-ink"}`}>{EXAMINERS[s].short}</div>
                  <div className="truncate text-[11px] text-muted">{EXAMINERS[s].lane}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* transcript */}
        <div className="flex h-[360px] flex-col justify-end gap-3 overflow-hidden p-5">
          <AnimatePresence initial={false}>
            {visible.map(({ e, key }) => (
              <motion.div
                key={key}
                layout
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <Line e={e} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Line({ e }) {
  if (e.speaker === "student") {
    return (
      <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-md bg-brand/15 px-4 py-2.5 text-[14px] leading-snug text-ink">
        <span className="line-clamp-2">{e.message}</span>
      </div>
    );
  }
  if (e.tool_used) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-eng/10 px-3 py-2 text-[13px] font-medium text-eng">
        <Wrench /> {e.speaker === "system" ? e.message : `Running ${e.file_ref} in the sandbox…`}
      </div>
    );
  }
  const ex = EXAMINERS[e.speaker];
  const t = TONE[ex.tone];
  const v = verdictIn(e.reasoning);
  const outcome = e.reasoning.match(/^\[test (\w+)\]/)?.[1];
  return (
    <div className="max-w-[92%]">
      <div className="mb-1 flex items-center gap-2 text-[12px]">
        <span className={`font-semibold ${t.text}`}>{ex.short}</span>
        {v && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${VERDICT[v].cls}`}>last answer: {VERDICT[v].label.toLowerCase()}</span>}
        {outcome && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-medium text-warn">claim {outcome}</span>}
      </div>
      <div className={`rounded-2xl rounded-tl-md border-l-[3px] ${t.border} bg-raised/70 px-4 py-2.5 text-[14px] leading-snug text-ink`}>
        <span className="line-clamp-3"><CodeText text={e.message.replace(/^Looking at `[^`]+`( in `[^`]+`)?: /, "")} /></span>
      </div>
    </div>
  );
}
