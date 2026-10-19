import { splitCode } from "../lib/examiners.js";

/** Agent text with `inline code` rendered as chips. */
export default function CodeText({ text, className = "" }) {
  return (
    <span className={className}>
      {splitCode(text).map((p, i) =>
        p.code ? (
          <code key={i} className="code-chip rounded-md bg-raised px-1.5 py-0.5 text-ink">
            {p.code}
          </code>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}
