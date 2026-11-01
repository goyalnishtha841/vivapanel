/*
 * Talks to the backend (docs/api-contract.md). Two adapters, same interface:
 *
 *   live  — VITE_API_URL is set: POST /session, SSE GET /stream/{id}, POST /answer, GET /report/{id}
 *           ("/" = same origin, for the deployed build the API serves itself)
 *   demo  — no backend yet: replays a real recorded Groq session (src/mock/session.json),
 *           pausing at each question until the user answers.
 */
import recorded from "../mock/session.json";
import recordedReport from "../mock/report.json";
import demoCode from "../mock/code.json"; // the sample project's files, for the code viewer

const API_URL = import.meta.env.VITE_API_URL || "";
const BASE = API_URL.replace(/\/+$/, "");
export const MODE = API_URL ? "live" : "demo";
export const DEMO_REPO = "https://github.com/example-student/campus-library-api";

async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || `Request failed (${res.status})`);
  return body;
}

const live = {
  // student: the GitHub login of the team member being examined (team projects), or null
  async createSession(repoUrl, student = null, invite = null) {
    const r = await json(await fetch(`${BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl, student, invite }),
    }));
    return r.session_id;
  },
  // hiring mode
  async createInvite({ title, company, focus }) {
    return json(await fetch(`${BASE}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, company, focus }),
    }));
  },
  async invite(token) {
    return json(await fetch(`${BASE}/invites/${token}`));
  },
  async screening(token, key) {
    return json(await fetch(`${BASE}/screening/${token}?key=${encodeURIComponent(key)}`));
  },
  async contributors(repoUrl) {
    const r = await json(await fetch(`${BASE}/contributors?repo_url=${encodeURIComponent(repoUrl)}`));
    return r.contributors || [];
  },
  // A shorter viva on the weakest topics of a finished session (same repo, new questions).
  async retake(id) {
    const r = await json(await fetch(`${BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retake_of: id }),
    }));
    return r.session_id;
  },
  async code(id, path) {
    return json(await fetch(`${BASE}/code/${id}?path=${encodeURIComponent(path)}`));
  },
  async sessionInfo(id) {
    return json(await fetch(`${BASE}/session/${id}`));
  },
  openStream(id, onEvent, onError) {
    let es = null;
    let closed = false;
    // check the session exists first: EventSource would silently retry a 404 forever
    fetch(`${BASE}/session/${id}`).then((r) => {
      if (closed) return;
      if (r.status === 404) {
        onError?.(new Error("This viva session doesn't exist. Start a new one from the home page."));
        return;
      }
      es = new EventSource(`${BASE}/stream/${id}`);
      es.onmessage = (m) => {
        try {
          onEvent(JSON.parse(m.data));
        } catch {
          /* ignore keep-alives */
        }
      };
      es.onerror = () => onError?.(new Error("Lost connection to the panel. Retrying…"));
    }).catch(() => onError?.(new Error("Can't reach the Viva Panel server.")));
    return () => {
      closed = true;
      es?.close();
    };
  },
  async sendAnswer(id, answer, meta = {}) {
    await json(await fetch(`${BASE}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: id, answer, seconds: meta.seconds ?? null, pasted: meta.pasted ?? null,
        skip: meta.skip ?? false,
      }),
    }));
  },
  async getReport(id) {
    // 202 while the scoring agent is still writing; poll until it's ready (up to ~3 minutes)
    for (let i = 0; i < 90; i++) {
      const res = await fetch(`${BASE}/report/${id}`);
      if (res.status !== 202) return json(res);
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("The report is taking longer than expected. Refresh to try again.");
  },
};

// ---------- demo replay ----------

const sessions = new Map();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function delayFor(e) {
  if (e.tool_used && e.speaker === "system") return 1900; // the sandbox takes a moment
  if (e.speaker === "moderator") return 900;
  return 1100 + Math.min(1400, e.message.length * 8); // longer questions take longer to "think"
}

const needsBackend = async () => {
  throw new Error("Hiring mode needs the live backend (this build is the offline demo).");
};

const demo = {
  createInvite: needsBackend,
  invite: needsBackend,
  screening: needsBackend,
  async code(id, path) {
    if (!(path in demoCode)) throw new Error("That file isn't in the sample project.");
    return { path, content: demoCode[path], partial: false };
  },
  async contributors() {
    return [];
  },
  async createSession() {
    const id = `demo-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(id, { cursor: 0, listener: null, running: false, skipped: [] });
    return id;
  },
  openStream(id, onEvent) {
    const s = sessions.get(id) || { cursor: 0 };
    sessions.set(id, s);
    s.listener = onEvent;
    if (s.cursor === 0 && !s.running) play(id); // StrictMode mounts twice; only one playback loop
    return () => {
      s.listener = null;
    };
  },
  async sendAnswer(id, answer, meta = {}) {
    const s = sessions.get(id);
    if (!s || s.running) return;
    (s.skipped ||= []).push(Boolean(meta.skip)); // one entry per question, in order: the report scores skips as 0
    const recordedAnswer = recorded[s.cursor];
    s.listener?.({ ...recordedAnswer, message: answer, timestamp: new Date().toISOString() });
    s.cursor += 1; // the user's answer replaces the recorded one
    play(id);
  },
  async getReport(id) {
    await wait(1200);
    return demoReport(sessions.get(id)?.skipped || []);
  },
};

/* The demo can't grade what you type (there's no model), so typed answers keep the recorded verdicts. A skipped
 * question, though, is scored exactly as the real panel scores it: no_answer, 0 — using agents/scoring.py's numbers. */
const VERDICT_WEIGHT = { strong: 1, partial: 0.55, weak: 0.2, no_answer: 0 };
const confidenceOf = (vs) => {
  if (!vs.length) return null;
  const w = vs.map((_, i) => i + 1);
  return Math.max(0, Math.round((vs.reduce((s, v, i) => s + VERDICT_WEIGHT[v] * w[i], 0) / w.reduce((a, b) => a + b, 0)) * 100));
};
const readinessOf = (score, covered) =>
  covered < 2 ? (score < 60 ? "not_ready" : "needs_work") : score >= 80 ? "ready" : score >= 60 ? "almost_ready" : score >= 40 ? "needs_work" : "not_ready";

function demoReport(skipped) {
  // turn n is the n-th question; turn 1 is the ungraded warm-up
  const skippedTurns = new Set(skipped.map((s, i) => (s ? i + 1 : 0)).filter((n) => n > 1));
  if (!skippedTurns.size) return recordedReport;
  const r = structuredClone(recordedReport);
  const asSkipped = (quotes) => quotes.map((q) => (q.speaker === "student" && skippedTurns.has(q.turn) ? { ...q, text: "(skipped)" } : q));
  const graded = new Set();
  const questionOf = {};
  for (const t of r.topics) {
    const answers = t.evidence.filter((q) => q.speaker === "student").map((q) => q.turn);
    for (const q of t.evidence) if (q.speaker !== "student") questionOf[q.turn] = { examiner: q.speaker, question: q.text, file_ref: t.file_ref };
    answers.forEach((n) => graded.add(n));
    t.verdicts = t.verdicts.map((v, i) => (skippedTurns.has(answers[i]) ? "no_answer" : v));
    t.confidence = confidenceOf(t.verdicts);
    if (answers.length && answers.every((n) => skippedTurns.has(n))) t.note = "Skipped, so it scores 0.";
    t.evidence = asSkipped(t.evidence);
  }
  const covered = r.topics.filter((t) => t.confidence !== null).map((t) => t.confidence);
  r.overall_score = covered.length ? Math.round(covered.reduce((a, b) => a + b, 0) / covered.length) : 0;
  r.readiness = readinessOf(r.overall_score, covered.length);
  r.weak_spots = r.weak_spots.map((w) => ({ ...w, evidence: asSkipped(w.evidence) }));
  r.unanswered = r.unanswered.map((u) => (skippedTurns.has(u.turn) ? { ...u, answer: "(skipped)" } : u));
  const already = new Set(r.unanswered.map((u) => u.turn));
  r.unanswered = [...r.unanswered, ...[...skippedTurns].filter((n) => !already.has(n) && questionOf[n])
    .map((n) => ({ turn: n, ...questionOf[n], answer: "(skipped)" }))].sort((a, b) => a.turn - b.turn);
  r.test_evidence = r.test_evidence.filter((v) => !skippedTurns.has(v.turn)); // no claim was made, so none was tested
  r.skipped_count = skippedTurns.size;
  const n = skippedTurns.size;
  if ([...graded].every((t) => skippedTurns.has(t))) {
    r.headline = "No questions were answered, so there is nothing to score yet.";
    r.weak_spots = [];
    r.study_plan = [{ title: "Take the viva again", action: "Answer the questions this time — even a partial answer scores more than a skip.", file_ref: null, minutes: 10 }];
    r.recruiter_summary = `The candidate skipped all ${graded.size} questions, so this session gives no evidence of how well they understand the project.`;
  } else {
    r.headline = `Scored ${r.overall_score}/100 across ${covered.length} topics, with ${n} question${n === 1 ? "" : "s"} skipped.`;
    r.recruiter_summary = `${n} of ${graded.size} questions were skipped and score 0. The rest are scored from the recorded answers in this demo replay.`;
  }
  return r;
}

/** Emit recorded events until the panel is waiting on the student again. */
async function play(id) {
  const s = sessions.get(id);
  s.running = true;
  while (s.cursor < recorded.length && recorded[s.cursor].speaker !== "student") {
    const e = recorded[s.cursor];
    await wait(delayFor(e));
    if (!sessions.has(id)) return;
    s.listener?.({ ...e, timestamp: new Date().toISOString() });
    s.cursor += 1;
  }
  s.running = false;
}

export const api = MODE === "live" ? live : demo;
