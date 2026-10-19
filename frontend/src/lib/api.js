/*
 * Talks to the backend (docs/api-contract.md). Two adapters, same interface:
 *
 *   live  — VITE_API_URL is set: POST /session, SSE GET /stream/{id}, POST /answer, GET /report/{id}
 *   demo  — no backend yet: replays a real recorded Groq session (src/mock/session.json),
 *           pausing at each question until the user answers.
 */
import recorded from "../mock/session.json";
import recordedReport from "../mock/report.json";

const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const MODE = BASE ? "live" : "demo";
export const DEMO_REPO = "https://github.com/example-student/campus-library-api";

async function json(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || `Request failed (${res.status})`);
  return body;
}

const live = {
  async createSession(repoUrl) {
    const r = await json(await fetch(`${BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repoUrl }),
    }));
    return r.session_id;
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
  async sendAnswer(id, answer) {
    await json(await fetch(`${BASE}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id, answer }),
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

const demo = {
  async createSession() {
    const id = `demo-${Math.random().toString(36).slice(2, 8)}`;
    sessions.set(id, { cursor: 0, listener: null, running: false });
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
  async sendAnswer(id, answer) {
    const s = sessions.get(id);
    if (!s || s.running) return;
    const recordedAnswer = recorded[s.cursor];
    s.listener?.({ ...recordedAnswer, message: answer, timestamp: new Date().toISOString() });
    s.cursor += 1; // the user's answer replaces the recorded one
    play(id);
  },
  async getReport() {
    await wait(1200);
    return recordedReport;
  },
};

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
