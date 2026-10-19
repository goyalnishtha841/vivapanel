// One entry per speaker in the Event contract (docs/api-contract.md §2).
export const EXAMINERS = {
  professor: {
    name: "The Professor",
    short: "Professor",
    initial: "P",
    lane: "Design & theory",
    blurb: "Why this design and not another? What are the trade-offs? Wants reasons, not descriptions.",
    tone: "prof",
    voice: { pitch: 0.85, rate: 0.95, prefer: ["Daniel", "Google UK English Male", "Alex"] },
  },
  engineer: {
    name: "The Industry Engineer",
    short: "Engineer",
    initial: "E",
    lane: "Scale, edge cases & security",
    blurb: "What breaks with a thousand users, bad input or two requests at once? Checks your claims in your code and your tests.",
    tone: "eng",
    voice: { pitch: 1.0, rate: 1.05, prefer: ["Samantha", "Google US English", "Karen"] },
  },
  junior: {
    name: "The Curious Junior",
    short: "Junior",
    initial: "J",
    lane: "Explain it simply",
    blurb: "A second-year who asks the beginner questions. If you can't explain it simply, it shows.",
    tone: "jun",
    voice: { pitch: 1.25, rate: 1.1, prefer: ["Moira", "Tessa", "Google UK English Female"] },
  },
};

export const ORDER = ["professor", "engineer", "junior"];

// Tailwind needs literal class names, so each tone maps to fixed strings.
export const TONE = {
  prof: { text: "text-prof", bg: "bg-prof", soft: "bg-prof/10", ring: "ring-prof/40", border: "border-prof/40" },
  eng: { text: "text-eng", bg: "bg-eng", soft: "bg-eng/10", ring: "ring-eng/40", border: "border-eng/40" },
  jun: { text: "text-jun", bg: "bg-jun", soft: "bg-jun/10", ring: "ring-jun/40", border: "border-jun/40" },
  brand: { text: "text-brand", bg: "bg-brand", soft: "bg-brand/10", ring: "ring-brand/40", border: "border-brand/40" },
};

export const VERDICT = {
  strong: { label: "Strong", cls: "bg-good/15 text-good" },
  partial: { label: "Partial", cls: "bg-warn/15 text-warn" },
  weak: { label: "Weak", cls: "bg-bad/15 text-bad" },
  no_answer: { label: "No answer", cls: "bg-muted/15 text-muted" },
};

/** The examiner's verdict on the previous answer, if this event's reasoning carries one. */
export function verdictIn(reasoning = "") {
  const m =
    reasoning.match(/^\[(strong|partial|weak|no_answer)\]/) ||
    reasoning.match(/judged the last answer (strong|partial|weak|no_answer)/) ||
    reasoning.match(/rated this (strong|partial|weak|no_answer)/);
  return m ? m[1] : null;
}

/** Turn `inline code` in agent text into styled chips. */
export function splitCode(text = "") {
  return text.split(/(`[^`]+`)/g).map((part) =>
    part.startsWith("`") && part.endsWith("`") ? { code: part.slice(1, -1) } : { text: part }
  );
}
