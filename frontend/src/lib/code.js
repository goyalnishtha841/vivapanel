// The code viewer beside the question: which file to show, and which lines to light up.
// Follows the latest event that points at code: a question (its file and function), or the Engineer
// reading a file or searching the repo (the matched lines).

const EXAMINER = new Set(["professor", "engineer", "junior"]);

export function focusOf(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e.file_ref) continue;
    if (e.speaker === "system" && e.tool_used === "read_file") return { path: e.file_ref, kind: "read" };
    if (e.speaker === "system" && e.tool_used === "search_code") {
      const query = (e.message.match(/Search “(.*?)”/) || [])[1] || "";
      const lines = [...(e.reasoning || "").matchAll(/(\S+):(\d+) /g)].filter((m) => m[1] === e.file_ref).map((m) => Number(m[2]));
      return { path: e.file_ref, kind: "search", query, lines };
    }
    if (EXAMINER.has(e.speaker) && !e.tool_used) {
      const [path, func] = e.file_ref.split(":");
      return { path, func: func ? func.replace(/\(\)$/, "") : null, kind: "question", speaker: e.speaker };
    }
  }
  return null;
}

const indent = (line) => line.match(/^\s*/)[0].length;

/** 1-based [start, end] of a function or class definition, by name; null if not found. */
export function functionRange(lines, name) {
  if (!name) return null;
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\b(def|class|function|func|fn|interface|struct)\\s+${n}\\b`),
    new RegExp(`\\b${n}\\s*[=:]\\s*(async\\b|function\\b|\\()`),
    new RegExp(`\\b${n}\\s*\\(`),
  ];
  let start = -1;
  for (const p of patterns) {
    start = lines.findIndex((l) => p.test(l));
    if (start >= 0) break;
  }
  if (start < 0) return null;
  let first = start;
  while (first > 0 && /^\s*@/.test(lines[first - 1])) first--; // decorators belong to it
  const base = indent(lines[start]);
  let end = start;
  for (let i = start + 1; i < lines.length && i < start + 80; i++) {
    if (!lines[i].trim()) continue;
    if (indent(lines[i]) <= base) {
      if (/^\s*[}\])]/.test(lines[i])) end = i; // closing brace of a braced language
      break;
    }
    end = i;
  }
  return [first + 1, end + 1];
}

/** Line numbers to highlight for a focus. */
export function highlighted(lines, focus) {
  if (!focus) return new Set();
  if (focus.kind === "search") return new Set(focus.lines);
  const r = focus.kind === "question" ? functionRange(lines, focus.func) : null;
  if (!r) return new Set();
  return new Set(Array.from({ length: r[1] - r[0] + 1 }, (_, k) => r[0] + k));
}
