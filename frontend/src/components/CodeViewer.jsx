import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { highlighted } from "../lib/code.js";
import { EXAMINERS, TONE } from "../lib/examiners.js";

/** The real file the panel is talking about, with the lines in question lit up. */
export default function CodeViewer({ sessionId, focus }) {
  const cache = useRef(new Map());
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const path = focus?.path;

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const hit = cache.current.get(path);
    if (hit) {
      setFile(hit);
      return;
    }
    setError("");
    api.code(sessionId, path)
      .then((f) => {
        cache.current.set(path, f);
        if (alive) setFile(f);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sessionId, path]);

  const lines = useMemo(() => (file && file.path === path ? file.content.split("\n") : []), [file, path]);
  const lit = useMemo(() => highlighted(lines, focus), [lines, focus]);
  const firstLit = Math.min(...lit);
  const anchor = useRef(null);
  useEffect(() => {
    anchor.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [firstLit, path]);

  if (!focus) return <p className="text-[14px] text-muted">The code under discussion will appear here.</p>;
  const ex = EXAMINERS[focus.speaker] || EXAMINERS.engineer;
  const tone = TONE[ex.tone];
  const label = focus.kind === "question" ? `${ex.short} is asking about` : focus.kind === "read" ? "Engineer is reading" : `Engineer searched “${focus.query}”`;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3">
        <div className={`text-[12px] font-medium ${tone.text}`}>{label}</div>
        <div className="mt-0.5 break-all font-mono text-[13px]">
          {path}{focus.func && <span className="text-muted">:{focus.func}</span>}
        </div>
        {file?.partial && <div className="mt-1 text-[12px] text-muted">Showing the excerpt the panel saw.</div>}
      </div>
      {error ? (
        <p className="text-[13px] text-muted">{error}</p>
      ) : (
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg/70 py-2 font-mono text-[12px] leading-[1.6]" style={{ fontVariantLigatures: "none" }}>
          {lines.map((text, i) => {
            const n = i + 1;
            const on = lit.has(n);
            return (
              <div key={n} ref={n === firstLit ? anchor : null}
                className={`flex border-l-2 pr-3 ${on ? `${tone.border} ${tone.soft}` : "border-transparent"}`}>
                <span className="w-10 shrink-0 select-none pr-3 text-right text-muted/60">{n}</span>
                <code className={`whitespace-pre ${on ? "text-ink" : "text-ink/75"}`}>{text || " "}</code>
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
