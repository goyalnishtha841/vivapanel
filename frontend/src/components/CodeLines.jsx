import { highlight } from "../lib/highlight.js";

/** Numbered, syntax-coloured code lines; `marked` line numbers get the red-pen highlight. */
export default function CodeLines({ code, marked = [], className = "", start = 1 }) {
  const lines = code.split("\n");
  return (
    <pre className={`font-mono leading-[1.8] [font-variant-ligatures:none] ${/text-\[/.test(className) ? "" : "text-[13px]"} ${className}`}>
      {lines.map((l, i) => {
        const n = i + start;
        const on = marked.includes(n);
        return (
          <div key={i} className={`flex ${on ? "-mx-4 bg-brand/[0.16] px-4 shadow-[inset_3px_0_0_rgb(var(--brand))]" : ""}`}>
            <span className="mr-4 inline-block w-5 shrink-0 select-none text-right text-muted/60">{n}</span>
            <span className="min-w-0 whitespace-pre-wrap text-ink/90 [overflow-wrap:anywhere]">
              {l ? highlight(l).map((t, j) => <span key={j} className={t.cls}>{t.text}</span>) : " "}
            </span>
          </div>
        );
      })}
    </pre>
  );
}
