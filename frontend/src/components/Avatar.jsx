import { EXAMINERS, TONE } from "../lib/examiners.js";

/** Examiner avatar: initial in their colour; animated bars while speaking. */
export default function Avatar({ speaker, size = 40, speaking = false, dim = false }) {
  const ex = EXAMINERS[speaker];
  const t = TONE[ex?.tone || "brand"];
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${t.soft} ring-2 ${t.ring} transition-opacity ${dim ? "opacity-45" : ""}`}
      style={{ width: size, height: size }}
    >
      {speaking ? (
        <span className="flex h-[45%] items-center gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-full w-[3px] rounded-full ${t.bg}`}
              style={{ animation: `wave 0.9s ${i * 0.15}s ease-in-out infinite` }}
            />
          ))}
        </span>
      ) : (
        <span className={`font-bold ${t.text}`} style={{ fontSize: size * 0.42 }}>
          {ex?.initial || "?"}
        </span>
      )}
      {speaking && <span className={`absolute inset-0 animate-ping rounded-full ${t.soft}`} />}
    </span>
  );
}
