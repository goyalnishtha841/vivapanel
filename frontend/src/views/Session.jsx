import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import Avatar from "../components/Avatar.jsx";
import CodeText from "../components/CodeText.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { File, Mic, Send, Speaker, Wrench } from "../components/Icons.jsx";
import { api, DEMO_REPO, MODE } from "../lib/api.js";
import { EXAMINERS, ORDER, TONE, VERDICT } from "../lib/examiners.js";
import { buildTimeline, cleanQuestion, isEnd, isQuestion, parsePlan } from "../lib/events.js";
import { go } from "../lib/route.js";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "../lib/speech.js";

const MAX_QUESTIONS = 12; // agents/panel.py; a retake has fewer (from the session info)

const DOT = { strong: "bg-good", partial: "bg-warn", weak: "bg-bad", no_answer: "bg-muted/60" };

export default function Session({ id, theme, onToggleTheme }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [drawer, setDrawer] = useState(() => window.innerWidth >= 1280);
  const [startedAt] = useState(() => Date.now());
  const [maxQuestions, setMaxQuestions] = useState(MAX_QUESTIONS);

  // The plan (and so the question limit) is saved once the first question is out.
  const started = events.some((e) => e.speaker in EXAMINERS);
  useEffect(() => {
    if (!started) return;
    let alive = true;
    api.sessionInfo?.(id).then((s) => alive && s?.max_questions && setMaxQuestions(s.max_questions)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, started]);

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
  const last = events[events.length - 1];
  const done = events.some(isEnd);
  // a failed answer ("retry_answer") leaves the question open; any other system event before a question is fatal
  const lastReal = [...events].reverse().find((e) => !(e.speaker === "system" && e.reasoning === "retry_answer"));
  const notice = last?.speaker === "system" && !last.tool_used ? last : null;
  const failed = Boolean(notice) && notice.reasoning !== "retry_answer" && !events.some(isQuestion);
  const awaiting = !done && !failed && !sending && Boolean(lastReal) && isQuestion(lastReal);
  const thinking = !done && !failed && !awaiting;

  const questions = timeline.filter((i) => i.type === "question");
  const current = questions[questions.length - 1];
  const currentIdx = timeline.lastIndexOf(current);
  const answers = timeline.filter((i) => i.type === "answer");
  const lastAnswer = answers[answers.length - 1];
  const lastAnswerIdx = timeline.lastIndexOf(lastAnswer);
  // what happened since the student last spoke: tool calls and the moderator's handovers
  const sinceAnswer = timeline.slice(lastAnswerIdx + 1);
  const tools = sinceAnswer.filter((i) => i.type === "tool");
  const handover = [...timeline].reverse().find((i) => i.type === "moderator" && timeline.indexOf(i) > currentIdx);
  const feedback = lastAnswer?.verdict && lastAnswerIdx < currentIdx ? lastAnswer : null;

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
      await api.sendAnswer(id, answer); // the backend echoes it on the stream as a "student" event
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative isolate flex h-[100svh] flex-col">
      <Ambient />
      <TopBar maxQuestions={maxQuestions} theme={theme} onToggleTheme={onToggleTheme} answers={answers} awaitingIndex={awaiting ? answers.length : -1}
        startedAt={startedAt} done={done || failed} voiceOn={voiceOn}
        onToggleVoice={() => { setVoiceOn((v) => !v); stopSpeaking(); }}
        onToggleDrawer={() => setDrawer((v) => !v)} />

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------ the stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col px-4 sm:px-8">
            <Seats current={current} thinking={thinking} done={done} questions={questions} />

            <div className="min-h-0 flex-1 overflow-y-auto py-6" aria-live="polite">
              {failed ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-5 py-10 text-center">
                  <p className="max-w-md text-[19px]">{notice.message}</p>
                  <button onClick={() => go("/")} className="rounded-full bg-brand px-7 py-3 text-[16px] font-semibold text-white">Try another repo</button>
                </div>
              ) : done ? (
                <EndCard id={id} answered={answers.length} />
              ) : (
                <div className="flex min-h-full flex-col justify-center gap-5">
                  <AnimatePresence mode="wait">
                    {feedback && !thinking && <Feedback key={`f-${lastAnswerIdx}`} a={feedback} />}
                  </AnimatePresence>
                  {current && !thinking && <QuestionCard key={currentIdx} q={current} />}
                  {thinking && <Deliberation started={Boolean(current)} handover={handover} tools={tools} />}
                  {!thinking && tools.length > 0 && <ToolSteps tools={tools} />}
                  {notice && awaiting && (
                    <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[15px] text-bad">{notice.message}</p>
                  )}
                </div>
              )}
              {error && <div role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-[14px] text-bad">{error}</div>}
            </div>

            {!done && !failed && <Composer enabled={awaiting} onSend={send} current={current} />}
          </div>
        </main>

        {/* ------------------------------------------------ transcript drawer */}
        <Drawer open={drawer} onClose={() => setDrawer(false)} timeline={timeline} plan={plan} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ top bar */

function TopBar({ theme, onToggleTheme, maxQuestions, answers, awaitingIndex, startedAt, done, voiceOn, onToggleVoice, onToggleDrawer }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => go("/")} aria-label="Back to home"><Logo /></button>
        {MODE === "demo" && (
          <span title="The panel's turns are a real recorded session on campus-library-api. Your answers appear but aren't graded until the backend is connected."
            className="hidden rounded-full bg-brand/10 px-3 py-1 text-[13px] font-medium text-brand md:inline">
            Demo replay · {DEMO_REPO.replace("https://github.com/", "")}
          </span>
        )}
      </div>

      {/* scorecard: one dot per question, coloured by the verdict */}
      <div className="hidden items-center gap-1.5 sm:flex" aria-label={`${answers.length} of ${maxQuestions} questions answered`}>
        {Array.from({ length: maxQuestions }, (_, i) => {
          const a = answers[i];
          const cls = a?.verdict ? DOT[a.verdict] : a ? "bg-ink/40" : i === awaitingIndex ? "bg-brand ring-4 ring-brand/20" : "bg-ink/10";
          return <span key={i} title={a?.verdict ? VERDICT[a.verdict].label : undefined} className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${cls}`} />;
        })}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-2 hidden font-mono text-[14px] tabular-nums text-muted sm:inline">
          {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
        </span>
        {canSpeak && (
          <button onClick={onToggleVoice} aria-pressed={voiceOn} title={voiceOn ? "Mute examiners" : "Hear examiners speak"}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${voiceOn ? "bg-brand/15 text-brand" : "text-muted hover:bg-ink/[0.06] hover:text-ink"}`}>
            <Speaker off={!voiceOn} />
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button onClick={onToggleDrawer} className="ml-1 rounded-full px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-ink/[0.06]">
          Transcript
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ the panel, seated */

function Seats({ current, thinking, done, questions }) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-2 pt-4 sm:gap-4">
      {ORDER.map((s) => {
        const ex = EXAMINERS[s];
        const t = TONE[ex.tone];
        const on = !done && current?.speaker === s;
        const asked = questions.filter((q) => q.speaker === s).length;
        return (
          <motion.div key={s} animate={{ y: on ? -4 : 0, opacity: on || done || !current ? 1 : 0.5 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className={`flex flex-col items-center gap-2 rounded-[22px] px-2 py-4 text-center transition-colors sm:flex-row sm:px-4 sm:text-left ${on ? `${t.soft}` : ""}`}>
            <Avatar speaker={s} size={52} speaking={on && !thinking} />
            <div className="min-w-0">
              <div className={`text-[15px] font-semibold sm:text-[16px] ${on ? t.text : ""}`}>{ex.short}</div>
              <div className="hidden truncate text-[13px] text-muted sm:block">{ex.lane}</div>
              <div className="text-[12px] text-muted">
                {on ? (thinking ? "thinking…" : "asking") : `${asked} asked`}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ stage pieces */

function QuestionCard({ q }) {
  const [why, setWhy] = useState(false);
  const ex = EXAMINERS[q.speaker];
  const t = TONE[ex.tone];
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border border-line bg-surface/85 p-6 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.6)] backdrop-blur sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[15px] font-semibold ${t.text}`}>{ex.name}</span>
        {q.badges.map((b) => (
          <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${b.kind === "challenge" ? "bg-brand/10 text-brand" : b.kind === "test-contradicted" ? "bg-bad/15 text-bad" : b.kind === "test-supported" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[22px] font-medium leading-snug tracking-[-0.01em] sm:text-[27px]">
        <CodeText text={cleanQuestion(q.message)} />
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-[14px]">
        {q.file_ref && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 font-mono text-[13px]"><File />{q.file_ref}</span>
        )}
        {q.why && (
          <button onClick={() => setWhy((v) => !v)} aria-expanded={why} className="font-medium text-muted transition-colors hover:text-ink">
            {why ? "Hide reasoning" : "Why this question?"}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {why && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden text-[15px] leading-relaxed text-muted">
            <span className="block pt-3">{q.why}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Feedback({ a }) {
  const v = VERDICT[a.verdict];
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex items-start gap-3 px-2">
      <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${v.cls}`}>{v.label}</span>
      <p className="text-[15px] leading-relaxed text-muted">
        <span className="text-ink">Your last answer. </span>{a.judgement || "Judged against your code."}
      </p>
    </motion.div>
  );
}

function Deliberation({ started, handover, tools }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-5 py-10 text-center">
      <span className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-brand" animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }} />
        ))}
      </span>
      <p className="text-[18px] text-muted">
        {handover ? handover.message : started ? "The panel is weighing your answer…" : "The moderator is reading your project…"}
      </p>
      {tools.length > 0 && <ToolSteps tools={tools} live />}
    </motion.div>
  );
}

/** The Engineer's code checks, as steps: what it ran, and what came back. */
function ToolSteps({ tools, live = false }) {
  const steps = [];
  for (const t of tools) {
    if (t.speaker !== "system") steps.push({ ask: t, result: null });
    else if (steps.length && !steps[steps.length - 1].result) steps[steps.length - 1].result = t;
    else steps.push({ ask: null, result: t });
  }
  return (
    <div className={`w-full rounded-[22px] border border-eng/25 bg-eng/[0.06] p-5 text-left ${live ? "max-w-[560px]" : ""}`}>
      <div className="text-[14px] font-semibold text-eng">What the Engineer checked</div>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
            <Wrench className="mt-1 shrink-0 text-eng" />
            <div className="min-w-0">
              {s.ask && <div>{s.ask.message}</div>}
              {s.result ? (
                <div className="font-mono text-[13px] text-muted">{s.result.message}</div>
              ) : (
                <div className="text-[13px] text-muted">running…</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EndCard({ id, answered }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col items-center justify-center gap-5 py-10 text-center">
      <h2 className="text-[34px] font-bold tracking-[-0.02em] sm:text-[44px]">
        That's the end of your <span className="font-serif font-normal italic text-brand">viva.</span>
      </h2>
      <p className="max-w-md text-[17px] text-muted">You answered {answered} questions. The scoring agent has your transcript and the test results.</p>
      <button onClick={() => go(`/report/${id}`)}
        className="rounded-full bg-brand px-8 py-4 text-[17px] font-semibold text-white transition-shadow hover:shadow-[0_0_32px_-4px_rgb(var(--brand)/0.7)]">
        See my report →
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ composer */

function Composer({ enabled, onSend, current }) {
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
    <div className="shrink-0 pb-5 pt-2">
      <div className={`flex items-end gap-2 rounded-[24px] border bg-surface/90 p-2.5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.5)] backdrop-blur transition-colors ${enabled ? "border-ink/20" : "border-line opacity-60"}`}>
        {canListen && (
          <button onClick={toggleMic} disabled={!enabled} aria-pressed={listening} title={listening ? "Stop dictation" : "Answer by voice"}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${listening ? "animate-pulse bg-bad text-white" : "bg-raised text-ink hover:bg-ink/10"}`}>
            <Mic />
          </button>
        )}
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
          rows={1}
          disabled={!enabled}
          placeholder={enabled ? (listening ? "Listening…" : "Your answer") : "Wait for the panel…"}
          aria-label="Your answer"
          className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-3 text-[17px] leading-relaxed placeholder:text-muted focus:outline-none"
        />
        <button onClick={() => submit("Can you repeat the question?")} disabled={!enabled}
          className="hidden h-12 shrink-0 rounded-full px-4 text-[14px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40 sm:block">
          Repeat?
        </button>
        <button onClick={() => submit()} disabled={!enabled || !text.trim()} aria-label="Send answer"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-30">
          <Send />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ transcript drawer */

function Drawer({ open, onClose, timeline, plan }) {
  const [tab, setTab] = useState("transcript");
  const end = useRef(null);
  useEffect(() => {
    if (open && tab === "transcript") end.current?.scrollIntoView({ block: "end" });
  }, [open, tab, timeline.length]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
          <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(400px,92vw)] flex-col border-l border-line bg-surface lg:static lg:z-auto lg:w-[380px] lg:bg-surface/70 lg:backdrop-blur">
            <div className="flex items-center justify-between px-5 pt-5">
              <div className="flex gap-1 rounded-full bg-raised p-1">
                {[["transcript", "Transcript"], ["plan", "The plan"]].map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors ${tab === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {tab === "transcript" ? (
                <ol className="space-y-4">
                  {timeline.map((item, i) => <Row key={i} item={item} />)}
                  <li ref={end} />
                </ol>
              ) : (
                <PlanList plan={plan} />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ item }) {
  if (item.type === "question") {
    const ex = EXAMINERS[item.speaker];
    return (
      <li className="flex gap-2.5">
        <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${TONE[ex.tone].bg}`} />
        <div className="min-w-0 text-[14px] leading-relaxed">
          <span className={`font-semibold ${TONE[ex.tone].text}`}>{ex.short} </span>
          <CodeText text={cleanQuestion(item.message)} />
        </div>
      </li>
    );
  }
  if (item.type === "answer") {
    return (
      <li className="ml-4 rounded-2xl bg-raised/70 px-3.5 py-2.5 text-[14px] leading-relaxed">
        {item.message}
        {item.verdict && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[item.verdict].cls}`}>{VERDICT[item.verdict].label}</span>}
      </li>
    );
  }
  if (item.type === "tool") {
    return <li className="ml-4 flex gap-2 font-mono text-[12px] text-eng"><Wrench className="mt-0.5 shrink-0" />{item.message}</li>;
  }
  return <li className="text-center text-[13px] text-muted">{item.message}</li>;
}

function PlanList({ plan }) {
  if (!plan.length) return <p className="text-[14px] text-muted">The moderator's plan appears once the panel has read your project.</p>;
  return (
    <ul className="space-y-4">
      {plan.map((p, i) => {
        const ex = EXAMINERS[p.examiner];
        return (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${TONE[ex?.tone || "brand"].bg}`} />
            <div className="text-[14px] leading-relaxed">
              <span className={`font-semibold ${TONE[ex?.tone || "brand"].text}`}>{ex?.short} </span>
              <span className="font-mono text-[13px]">{p.file}</span>
              <span className="block text-muted">{p.why}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
