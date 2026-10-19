/*
 * Turn the raw Event stream (docs/api-contract.md §2, §5) into what the session screen shows.
 *
 * The examiners' verdict on an answer arrives inside the *next* event's reasoning:
 *   "[weak] <judgement> → <why this question>"          (follow-up by the same examiner)
 *   "Professor judged the last answer partial: <judgement> Topic closed; …"   (moderator handover)
 *   "Engineer rated this strong. Professor [extend]: <why>"                  (cross-challenge)
 *   "[test inconclusive] <claim>"                                             (after a sandbox run)
 * so we attach it to the student's answer it refers to.
 */
import { EXAMINERS } from "./examiners.js";

export const isExaminer = (s) => Boolean(EXAMINERS[s]);
export const isQuestion = (e) => isExaminer(e.speaker) && !e.tool_used;
export const isEnd = (e) => e.speaker === "moderator" && /end of the viva/i.test(e.message);

function judgementOf(reasoning) {
  let m = reasoning.match(/^\[(strong|partial|weak|no_answer)\]\s*(.*?)(?:\s+→\s+|$)/s);
  if (m) return { verdict: m[1], judgement: m[2] };
  m = reasoning.match(/judged the last answer (strong|partial|weak|no_answer):\s*(.*?)(?:\s+Topic closed|$)/s);
  if (m) return { verdict: m[1], judgement: m[2] };
  m = reasoning.match(/rated this (strong|partial|weak|no_answer)/);
  if (m) return { verdict: m[1], judgement: "" };
  return null;
}

/** "Why this question", without the verdict on the previous answer. */
export function whyOf(e) {
  const r = e.reasoning || "";
  const arrow = r.split(/\s+→\s+/);
  if (arrow.length > 1 && /^\[(strong|partial|weak|no_answer)\]/.test(r)) return arrow.slice(1).join(" → ");
  const challenge = r.match(/\[(disagree|extend)\]:\s*(.*)$/s);
  if (challenge) return challenge[2];
  return r.replace(/^\[test \w+\]\s*/, "Checking the claim: ");
}

export function badgesOf(e) {
  const r = e.reasoning || "";
  const out = [];
  const ch = r.match(/\[(disagree|extend)\]/);
  if (ch) out.push({ kind: "challenge", label: ch[1] === "disagree" ? "Challenges a colleague" : "Builds on a colleague" });
  const t = r.match(/^\[test (supported|contradicted|inconclusive)\]/);
  if (t) out.push({ kind: `test-${t[1]}`, label: `Claim ${t[1]}` });
  return out;
}

/** Strip the old "Looking at `x` in `y`: " / "On `x()`: " anchors; the file chip shows the file. */
export function cleanQuestion(text) {
  return text.replace(/^(Looking at|On) `[^`]+`( in `[^`]+`)?:\s*/, "");
}

export function parsePlan(events) {
  const plan = events.find((e) => e.speaker === "moderator" && e.reasoning?.includes(" → "));
  if (!plan) return [];
  return plan.reasoning.split(" | ").map((part) => {
    const m = part.match(/^(\w+) → ([^:]+): (.*)$/s);
    return m ? { examiner: m[1].toLowerCase(), file: m[2], why: m[3] } : null;
  }).filter(Boolean);
}

export function buildTimeline(events) {
  const items = [];
  let lastStudent = null;
  for (const e of events) {
    const j = e.speaker === "student" ? null : judgementOf(e.reasoning || "");
    if (j && lastStudent && !lastStudent.verdict) Object.assign(lastStudent, j);
    if (e.speaker === "student") {
      lastStudent = { ...e, type: "answer" };
      items.push(lastStudent);
    } else if (e.tool_used) {
      items.push({ ...e, type: "tool" });
    } else if (isExaminer(e.speaker)) {
      items.push({ ...e, type: "question", why: whyOf(e), badges: badgesOf(e) });
    } else if (e.speaker === "moderator") {
      items.push({ ...e, type: "moderator" });
    } else {
      if (e.reasoning === "retry_answer") {
        // the backend couldn't process the last answer; it isn't part of the viva, the question is still open
        const i = items.map((x) => x.type).lastIndexOf("answer");
        if (i >= 0) items.splice(i, 1);
        lastStudent = null;
      }
      items.push({ ...e, type: "system" });
    }
  }
  return items;
}
