import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Avatar from "../components/Avatar.jsx";
import CodeText from "../components/CodeText.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { File, Mic, Send, Speaker, Wrench } from "../components/Icons.jsx";
import { api, DEMO_REPO, MODE } from "../lib/api.js";
import { EXAMINERS, ORDER, TONE, VERDICT } from "../lib/examiners.js";
import { buildTimeline, cleanQuestion, isEnd, isQuestion, parsePlan, whyOf } from "../lib/events.js";
import { go } from "../lib/route.js";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "../lib/speech.js";

const MAX_QUESTIONS = 12; // agents/panel.py

export default function Session({ id, theme, onToggleTheme }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    const close = api.openStream(id, (e) => {
      setError("");
      setEvents((prev) => [...prev, e]);
    }, (err) => setError(err.message));
    return () => {
      close();
      stopSpeaking();
    };
  }, [id]);

  const timeline = useMemo(() => buildTimeline(events), [events]);
  const plan = useMemo(() => parsePlan(events), [events]);
  const questions = events.filter(isQuestion);
  const last = events[events.length - 1];
  const done = events.some(isEnd);
  const awaiting = !done && !sending && Boolean(last) && isQuestion(last);
  const current = [...events].reverse().find(isQuestion);
  const thinking = !done && !awaiting; // planning, judging or running a tool

  // speak each new question in that examiner's voice
  const spoken = useRef(0);
  useEffect(() => {
    if (!voiceOn || !last || events.length === spoken.current) return;
    spoken.current = events.length;
    if (isQuestion(last)) speak(last.speaker, cleanQuestion(last.message));
  }, [events, voiceOn, last]);

  async function send(text) {
    const answer = text.trim();
    if (!awaiting || !answer) return;
    stopSpeaking();
    setSending(true);
    try {
      // the live backend echoes the answer on the stream as a "student" event (api-contract §2)
      await api.sendAnswer(id, answer);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[100svh] flex-col bg-bg">
      <TopBar theme={theme} onToggleTheme={onToggleTheme} asked={questions.length} startedAt={startedAt} done={done}
        voiceOn={voiceOn} onToggleVoice={() => { setVoiceOn((v) => !v); stopSpeaking(); }} />

      {MODE === "demo" && (
        <div className="border-b border-line bg-brand/10 px-4 py-2 text-center text-[13px]">
          <span className="font-semibold text-brand">Demo replay.</span>{" "}
          <span className="sm:hidden">Recorded panel turns; your answers aren't graded yet.</span>
          <span className="hidden sm:inline">The panel's turns come from a real recorded session on{" "}
            <span className="font-mono">campus-library-api</span>. Your answers appear in the transcript but aren't graded until the backend is connected.</span>
        </div>
      )}

      <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)_330px] lg:grid-rows-1">
        <Examiners current={current} thinking={thinking} plan={plan} questions={questions} />

        <main className="flex min-h-0 flex-col border-line lg:border-x">
          <Transcript timeline={timeline} thinking={thinking} current={current} />
          {error && <div role="alert" className="mx-4 mb-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-[14px] text-bad">{error}</div>}
          {done ? (
            <div className="border-t border-line p-4 sm:p-5">
              <div className="mx-auto flex max-w-[760px] flex-col items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-5 sm:flex-row">
                <div>
                  <div className="text-[17px] font-semibold">That's the end of your viva.</div>
                  <div className="text-[14px] text-muted">The scoring agent is ready to write your report.</div>
                </div>
                <button onClick={() => go(`/report/${id}`)}
                  className="shrink-0 rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white transition-shadow hover:shadow-[0_0_30px_-4px_rgb(var(--brand)/0.8)]">
                  See my report →
                </button>
              </div>
            </div>
          ) : (
            <AnswerBox enabled={awaiting} onSend={send} current={current} />
          )}
        </main>

        <Sidebar current={current} plan={plan} timeline={timeline} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ top bar */

function TopBar({ theme, onToggleTheme, asked, startedAt, done, voiceOn, onToggleVoice }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const n = Math.min(asked, MAX_QUESTIONS);
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <button onClick={() => go("/")} aria-label="Back to home"><Logo /></button>
        {MODE === "demo" && (
          <span className="hidden truncate rounded-full border border-line px-3 py-1 font-mono text-[12px] text-muted md:inline">
            {DEMO_REPO.replace("https://github.com/", "")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        <div className="hidden items-center gap-3 sm:flex">
          <span className="text-[13px] text-muted">Question</span>
          <span className="text-[15px] font-semibold tabular-nums">{n} / {MAX_QUESTIONS}</span>
          <div className="h-1.5 w-28 rounded-full bg-raised">
            <div className="h-1.5 rounded-full bg-brand transition-all duration-500" style={{ width: `${(n / MAX_QUESTIONS) * 100}%` }} />
          </div>
        </div>
        <span className="font-mono text-[14px] tabular-nums text-muted">
          {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
        </span>
        {canSpeak && (
          <button onClick={onToggleVoice} aria-pressed={voiceOn} title={voiceOn ? "Mute examiners" : "Hear examiners speak"}
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors ${voiceOn ? "border-brand/60 bg-brand/15 text-brand" : "border-line text-muted hover:text-ink"}`}>
            <Speaker off={!voiceOn} />
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ left: examiners */

function Examiners({ current, thinking, plan, questions }) {
  return (
    <aside className="flex gap-2 overflow-x-auto border-b border-line p-3 lg:flex-col lg:gap-3 lg:overflow-visible lg:border-b-0 lg:p-4">
      <div className="hidden px-1 pb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted lg:block">The panel</div>
      {ORDER.map((s) => {
        const ex = EXAMINERS[s];
        const t = TONE[ex.tone];
        const on = current?.speaker === s;
        const asked = questions.filter((q) => q.speaker === s).length;
        const topics = plan.filter((p) => p.examiner === s).length;
        const status = on ? (thinking ? "Listening" : "Asking") : asked ? "Waiting" : "Up later";
        return (
          <div key={s} className={`flex min-w-[180px] flex-1 items-center gap-3 rounded-2xl border p-3 transition-all duration-300 lg:flex-none ${on ? `${t.border} ${t.soft}` : "border-transparent"}`}>
            <Avatar speaker={s} size={44} speaking={on && !thinking} dim={!on} />
            <div className="min-w-0">
              <div className={`text-[15px] font-semibold ${on ? t.text : ""}`}>{ex.short}</div>
              <div className="truncate text-[12px] text-muted">{ex.lane}</div>
              <div className="mt-1 text-[11px] text-muted">
                <span className={on ? t.text : ""}>{status}</span> · {asked} asked{topics ? ` · ${topics} topics` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </aside>
  );
}

/* ------------------------------------------------------------------ middle: transcript */

function Transcript({ timeline, thinking, current }) {
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [timeline.length, thinking]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6" aria-live="polite">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        <AnimatePresence initial={false}>
          {timeline.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
              <Item item={item} />
            </motion.div>
          ))}
        </AnimatePresence>
        {thinking && <Thinking started={timeline.some((i) => i.type === "question")} current={current} />}
        <div ref={end} />
      </div>
    </div>
  );
}

function Item({ item }) {
  if (item.type === "moderator") {
    return (
      <div className="mx-auto max-w-[640px] rounded-2xl border border-line bg-surface/70 px-4 py-2.5 text-center text-[14px] leading-relaxed text-muted">
        <span className="font-semibold text-ink">Moderator · </span>{item.message}
      </div>
    );
  }
  if (item.type === "tool") return <ToolRow e={item} />;
  if (item.type === "system") {
    return <div className="mx-auto rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-[13px] text-warn">{item.message}</div>;
  }
  if (item.type === "answer") return <Answer a={item} />;
  return <Question q={item} />;
}

const BADGE_CLS = {
  challenge: "bg-brand/15 text-brand",
  "test-contradicted": "bg-bad/15 text-bad",
  "test-supported": "bg-good/15 text-good",
  "test-inconclusive": "bg-warn/15 text-warn",
};

function Question({ q }) {
  const [open, setOpen] = useState(false);
  const ex = EXAMINERS[q.speaker];
  const t = TONE[ex.tone];
  return (
    <div className="flex max-w-[92%] gap-3">
      <Avatar speaker={q.speaker} size={34} />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[13px]">
          <span className={`font-semibold ${t.text}`}>{ex.short}</span>
          {q.badges.map((b) => (
            <span key={b.label} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE_CLS[b.kind]}`}>{b.label}</span>
          ))}
        </div>
        <div className={`rounded-2xl rounded-tl-md border-l-[3px] ${t.border} bg-surface px-4 py-3 text-[16px] leading-relaxed shadow-sm`}>
          <CodeText text={cleanQuestion(q.message)} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-muted">
          {q.file_ref && (
            <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5 font-mono text-[11px] text-ink"><File />{q.file_ref}</span>
          )}
          {q.why && (
            <button onClick={() => setOpen((v) => !v)} className="font-medium text-brand hover:underline lg:hidden">
              {open ? "Hide why" : "Why this question?"}
            </button>
          )}
        </div>
        {open && <p className="mt-2 rounded-xl bg-raised/70 px-3 py-2 text-[13px] text-muted lg:hidden">{q.why}</p>}
      </div>
    </div>
  );
}

function Answer({ a }) {
  const v = a.verdict && VERDICT[a.verdict];
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end">
      <div className="rounded-2xl rounded-br-md bg-brand/15 px-4 py-3 text-[16px] leading-relaxed">
        {a.message || <span className="italic text-muted">(no answer)</span>}
      </div>
      {v && (
        <div className="mt-1.5 flex max-w-full flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${v.cls}`}>{v.label}</span>
          {a.judgement && <p className="text-right text-[12px] leading-snug text-muted">{a.judgement}</p>}
        </div>
      )}
    </div>
  );
}

function ToolRow({ e }) {
  const isResult = e.speaker === "system";
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 font-mono text-[12px] ${isResult ? "ml-11 border-line bg-raised/50" : "border-eng/40 bg-eng/5 text-eng"}`}>
      <Wrench className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div>{isResult ? e.message : `${EXAMINERS[e.speaker]?.short || "Panel"}: ${e.message}`}</div>
        {e.reasoning && <div className="mt-0.5 truncate font-sans text-[12px] text-muted">{e.reasoning}</div>}
      </div>
    </div>
  );
}

function Thinking({ started }) {
  return (
    <div className="flex items-center gap-3 text-[14px] text-muted">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2 w-2 rounded-full bg-brand" animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }} />
        ))}
      </span>
      {started ? "The panel is weighing your answer…" : "The moderator is reading your project…"}
    </div>
  );
}

/* ------------------------------------------------------------------ answer box */

function AnswerBox({ enabled, onSend, current }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const stopRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [enabled, current]);

  function submit(value = text) {
    if (!enabled || !value.trim()) return;
    stopRef.current?.();
    onSend(value);
    setText("");
  }

  function toggleMic() {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setListening(true);
    stopRef.current = listen((t) => setText(t), () => setListening(false));
  }

  return (
    <div className="border-t border-line bg-surface/60 p-3 backdrop-blur sm:p-4">
      <div className="mx-auto max-w-[760px]">
        <div className={`flex items-end gap-2 rounded-2xl border bg-bg p-2 transition-colors ${enabled ? "border-brand/50" : "border-line opacity-70"}`}>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={!enabled}
            placeholder={enabled ? "Type your answer… (Enter to send, Shift+Enter for a new line)" : "Wait for the panel…"}
            aria-label="Your answer"
            className="max-h-40 min-h-[52px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px] leading-relaxed placeholder:text-muted/70 focus:outline-none"
          />
          {canListen && (
            <button onClick={toggleMic} disabled={!enabled} aria-pressed={listening} title={listening ? "Stop dictation" : "Answer by voice"}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${listening ? "animate-pulse border-bad/60 bg-bad/15 text-bad" : "border-line text-muted hover:text-ink"}`}>
              <Mic />
            </button>
          )}
          <button onClick={() => submit()} disabled={!enabled || !text.trim()} aria-label="Send answer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-opacity disabled:opacity-40">
            <Send />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <button onClick={() => submit("Can you repeat the question?")} disabled={!enabled}
            className="rounded-full border border-line px-3 py-1 transition-colors hover:border-brand/50 hover:text-ink disabled:opacity-40">
            Ask to repeat
          </button>
          <span>Be specific: name the function, say why, say what breaks.</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ right: reasoning */

function Sidebar({ current, plan, timeline }) {
  const activity = timeline.filter((i) => i.type === "tool" || (i.type === "answer" && i.verdict)).slice(-8).reverse();
  const ex = current && EXAMINERS[current.speaker];
  return (
    <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex">
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Why this question?</div>
        {current ? (
          <>
            <div className={`mt-2 text-[14px] font-semibold ${TONE[ex.tone].text}`}>{ex.name}</div>
            <p className="mt-1.5 text-[14px] leading-relaxed">{whyOf(current) || "—"}</p>
            {current.file_ref && (
              <div className="mt-3 inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 font-mono text-[12px]"><File />{current.file_ref}</div>
            )}
          </>
        ) : (
          <p className="mt-2 text-[14px] text-muted">The examiners' reasoning appears here as they ask.</p>
        )}
      </section>

      {plan.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">The moderator's plan</div>
          <ul className="mt-3 space-y-3">
            {plan.map((p, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[EXAMINERS[p.examiner]?.tone || "brand"].bg}`} />
                <span><span className="font-mono text-[12px]">{p.file}</span><span className="block text-muted">{p.why}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Activity</div>
        {activity.length === 0 && <p className="mt-2 text-[13px] text-muted">Verdicts and tool calls (code searches, test runs) show up here.</p>}
        <ul className="mt-3 space-y-2.5">
          {activity.map((a, i) => (
            <li key={i} className="text-[13px] leading-snug">
              {a.type === "tool" ? (
                <span className="flex gap-2 font-mono text-[12px] text-eng"><Wrench className="mt-0.5 shrink-0" />{a.message}</span>
              ) : (
                <span className="flex items-start gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[a.verdict].cls}`}>{VERDICT[a.verdict].label}</span>
                  <span className="line-clamp-2 text-muted">“{a.message}”</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
