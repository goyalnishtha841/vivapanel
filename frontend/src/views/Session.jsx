import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import Avatar from "../components/Avatar.jsx";
import CodeText from "../components/CodeText.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { File, Mic, Send, Speaker, Wrench } from "../components/Icons.jsx";
import { api, DEMO_REPO, MODE } from "../lib/api.js";
import { focusOf } from "../lib/code.js";
import CodeViewer from "../components/CodeViewer.jsx";
import { EXAMINERS, ORDER, TONE, VERDICT } from "../lib/examiners.js";
import { buildTimeline, cleanQuestion, isEnd, isQuestion, parsePlan } from "../lib/events.js";
import { go } from "../lib/route.js";
import { canListen, canSpeak, listen, speak, stopSpeaking } from "../lib/speech.js";

const TIPS_KEY = "viva-tips-seen";
const seenTips = () => {
  try {
    return localStorage.getItem(TIPS_KEY) === "1";
  } catch {
    return false;
  }
};

/** True on phone-sized screens; used to size the seated examiners. */
function useNarrow() {
  const q = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

const MAX_QUESTIONS = 12; // agents/panel.py; a retake has fewer (from the session info)

const DOT = { strong: "bg-good", partial: "bg-warn", weak: "bg-bad", no_answer: "bg-muted/60" };

export default function Session({ id, theme, onToggleTheme }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  // hands-free: examiners speak, then the mic opens by itself and the answer is sent after a pause
  const [handsFree, setHandsFree] = useState(false);
  const [listenSignal, setListenSignal] = useState(0);
  const [tips, setTips] = useState(() => !seenTips());
  const [drawer, setDrawer] = useState(() => window.innerWidth >= 1280);
  const [startedAt] = useState(() => Date.now());
  const [maxQuestions, setMaxQuestions] = useState(MAX_QUESTIONS);
  const [hiring, setHiring] = useState(null);

  // The plan (and so the question limit) is saved once the first question is out.
  const started = events.some((e) => e.speaker in EXAMINERS);
  useEffect(() => {
    if (!started) return;
    let alive = true;
    api.sessionInfo?.(id).then((s) => {
      if (!alive || !s) return;
      if (s.max_questions) setMaxQuestions(s.max_questions);
      setHiring(s.hiring || null);
    }).catch(() => {});
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

  const focus = useMemo(() => focusOf(events), [events]);
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

  // speak each new question in that examiner's voice; in hands-free mode, open the mic when they finish
  const spoken = useRef(0);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  useEffect(() => {
    if (!voiceOn || !last || events.length === spoken.current) return;
    spoken.current = events.length;
    if (isQuestion(last)) {
      speak(last.speaker, cleanQuestion(last.message), () => {
        if (handsFreeRef.current) setListenSignal((n) => n + 1);
      });
    }
  }, [events, voiceOn, last]);
  // no speech synthesis in this browser: hands-free just opens the mic when a question arrives
  useEffect(() => {
    if (handsFree && !canSpeak && awaiting) setListenSignal((n) => n + 1);
  }, [handsFree, awaiting, currentIdx]);

  function toggleHandsFree() {
    setHandsFree((on) => {
      const next = !on;
      if (next) {
        setVoiceOn(true);
        // read out the question already on screen, then listen
        if (awaiting && current) {
          spoken.current = events.length;
          speak(current.speaker, cleanQuestion(current.message), () => setListenSignal((n) => n + 1));
        }
      }
      return next;
    });
  }

  function dismissTips() {
    setTips(false);
    try {
      localStorage.setItem(TIPS_KEY, "1");
    } catch {
      /* private mode: the tips just show again next time */
    }
  }

  async function send(text, meta) {
    const answer = text.trim();
    if (!awaiting || !answer) return;
    stopSpeaking();
    setSending(true);
    try {
      await api.sendAnswer(id, answer, meta); // the backend echoes it on the stream as a "student" event
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative isolate flex h-[100svh] flex-col">
      <Ambient calm />
      <TopBar maxQuestions={maxQuestions} theme={theme} onToggleTheme={onToggleTheme} answers={answers} awaitingIndex={awaiting ? answers.length : -1}
        startedAt={startedAt} done={done || failed} voiceOn={voiceOn}
        onToggleVoice={() => { setVoiceOn((v) => !v); setHandsFree(false); stopSpeaking(); }}
        onToggleDrawer={() => setDrawer((v) => !v)} />

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------ the stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col px-3 sm:px-8">
            <Seats current={current} thinking={thinking} done={done} questions={questions} />

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 sm:py-6" aria-live="polite">
              {failed ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-5 py-10 text-center">
                  <p className="max-w-md text-[19px]">{notice.message}</p>
                  <button onClick={() => go("/")} className="rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] shadow-[0_0_24px_-6px_rgb(var(--brand)/0.8)] px-7 py-3 text-[16px] font-semibold text-white">Try another repo</button>
                </div>
              ) : done ? (
                <EndCard id={id} answered={answers.length} hiring={hiring} />
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

            {!done && !failed && (
              <>
                <AnimatePresence>
                  {tips && awaiting && answers.length === 0 && <FirstVivaTips key="tips" onClose={dismissTips} />}
                </AnimatePresence>
                <Composer enabled={awaiting} onSend={send} current={current}
                  handsFree={handsFree} onToggleHandsFree={toggleHandsFree} listenSignal={listenSignal} />
              </>
            )}
          </div>
        </main>

        {/* ------------------------------------------------ transcript drawer */}
        <Drawer open={drawer} onClose={() => setDrawer(false)} timeline={timeline} plan={plan} sessionId={id} focus={focus} />
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
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-2 px-3 sm:h-[68px] sm:gap-3 sm:px-6">
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
          return <span key={i} aria-hidden="true" title={a?.verdict ? `Question ${i + 1}: ${VERDICT[a.verdict].label}` : undefined} className={`h-2.5 w-2.5 rounded-full transition-colors duration-500 ${cls}`} />;
        })}
      </div>

      {/* phones: a compact counter instead of twelve dots */}
      <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[12px] tabular-nums text-muted sm:hidden" aria-hidden="true">
        {Math.min(answers.length + (awaitingIndex >= 0 ? 1 : 0), maxQuestions)}/{maxQuestions}
      </span>

      <div className="flex items-center gap-1">
        <span className="mr-2 hidden font-mono text-[14px] tabular-nums text-muted sm:inline">
          {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}
        </span>
        {canSpeak && (
          <button onClick={onToggleVoice} aria-pressed={voiceOn} title={voiceOn ? "Mute examiners" : "Hear examiners speak"} aria-label={voiceOn ? "Mute examiners" : "Hear examiners speak"}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${voiceOn ? "bg-brand/15 text-brand" : "text-muted hover:bg-ink/[0.06] hover:text-ink"}`}>
            <Speaker off={!voiceOn} />
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button onClick={onToggleDrawer} aria-label="Code and transcript"
          className="ml-1 flex h-10 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink transition-colors hover:bg-ink/[0.06] sm:px-4">
          <File width="16" height="16" />
          <span className="hidden sm:inline">Code &amp; transcript</span>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ the panel, seated */

function Seats({ current, thinking, done, questions }) {
  const narrow = useNarrow();
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1.5 pt-2 sm:gap-4 sm:pt-4">
      {ORDER.map((s) => {
        const ex = EXAMINERS[s];
        const t = TONE[ex.tone];
        const on = !done && current?.speaker === s;
        const asked = questions.filter((q) => q.speaker === s).length;
        return (
          <motion.div key={s} animate={{ y: on ? -4 : 0, opacity: on || done || !current ? 1 : 0.5 }} transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className={`flex flex-col items-center gap-1.5 rounded-[20px] px-1.5 py-2.5 text-center transition-colors sm:flex-row sm:gap-2 sm:rounded-[22px] sm:px-4 sm:py-4 sm:text-left ${on ? `${t.soft}` : ""}`}>
            <Avatar speaker={s} size={narrow ? 40 : 52} speaking={on && !thinking} />
            <div className="min-w-0">
              <div className={`text-[14px] font-semibold sm:text-[16px] ${on ? t.text : ""}`}>{ex.short}</div>
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

const QUESTION_NEON = { prof: "neon-blue", eng: "neon-teal", jun: "neon-gold" };

function QuestionCard({ q }) {
  const [why, setWhy] = useState(false);
  const ex = EXAMINERS[q.speaker];
  const t = TONE[ex.tone];
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`neon ${QUESTION_NEON[ex.tone] || "neon-quiet"} rounded-[24px] p-5 sm:rounded-[28px] sm:p-8`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[15px] font-semibold ${t.text}`}>{ex.name}</span>
        {q.badges.map((b) => (
          <span key={b.label} className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${b.kind === "challenge" ? "bg-brand/10 text-brand" : b.kind === "test-contradicted" ? "bg-bad/15 text-bad" : b.kind === "test-supported" ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
            {b.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[19px] font-medium leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-[27px]">
        <CodeText text={cleanQuestion(q.message)} />
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4 text-[14px]">
        {q.file_ref && (
          <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 font-mono text-[12px] sm:text-[13px]"><File className="shrink-0" /><span className="truncate">{q.file_ref}</span></span>
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
      <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${v.cls}`} aria-label={`Verdict on your last answer: ${v.label}`}>{v.label}</span>
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
    <div className={`neon neon-teal w-full rounded-[22px] p-5 text-left ${live ? "max-w-[560px]" : ""}`}>
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

function EndCard({ id, answered, hiring }) {
  if (hiring) {
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col items-center justify-center gap-5 py-10 text-center">
        <h2 className="text-[34px] font-bold tracking-[-0.02em] sm:text-[44px]">
          That's the end of your <span className="font-serif font-normal italic text-brand">viva.</span>
        </h2>
        <p className="max-w-md text-[17px] text-muted">
          You answered {answered} questions. Your results are being prepared and will be shared with
          {hiring.company ? ` ${hiring.company}` : " the recruiter"} for the {hiring.title} role. Thank you!
        </p>
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col items-center justify-center gap-5 py-10 text-center">
      <h2 className="text-[34px] font-bold tracking-[-0.02em] sm:text-[44px]">
        That's the end of your <span className="font-serif font-normal italic text-brand">viva.</span>
      </h2>
      <p className="max-w-md text-[17px] text-muted">You answered {answered} questions. The scoring agent has your transcript and the test results.</p>
      <button onClick={() => go(`/report/${id}`)}
        className="rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] shadow-[0_0_24px_-6px_rgb(var(--brand)/0.8)] px-8 py-4 text-[17px] font-semibold text-white transition-shadow hover:shadow-[0_0_32px_-4px_rgb(var(--brand)/0.7)]">
        See my report →
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ first-viva tips */

/** Shown once, before the first answer: how to answer, and where things are. Dismissed for good with "Got it". */
function FirstVivaTips({ onClose }) {
  const tips = [
    canListen ? ["🎙️", "Type your answer, or tap the mic and speak it."] : ["⌨️", "Type your answer in the box below."],
    ["↵", "Enter sends. Shift + Enter starts a new line."],
    ["🔁", "Question unclear? Tap Repeat? and it's asked again, without counting against you."],
    canSpeak && ["🔊", "Turn on the speaker to hear each examiner in their own voice, or try Hands-free."],
    ["📄", "Code & transcript shows the exact file the panel is asking about."],
  ].filter(Boolean);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
      role="note" aria-label="Tips for your first viva"
      className="neon neon-ocean mb-2 shrink-0 rounded-[20px] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[15px] font-semibold">First viva? A few tips</div>
        <button onClick={onClose} className="shrink-0 rounded-full bg-ink/[0.07] px-3 py-1 text-[13px] font-semibold text-ink transition-colors hover:bg-ink/[0.12]">
          Got it
        </button>
      </div>
      <ul className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[14px] leading-snug text-muted sm:grid-cols-2">
        {tips.map(([icon, text]) => (
          <li key={text} className="flex gap-2.5">
            <span className="w-5 shrink-0 text-center" aria-hidden="true">{icon}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ composer */

const SILENCE_MS = 2500; // hands-free: send once the student has been quiet this long

function Composer({ enabled, onSend, current, handsFree, onToggleHandsFree, listenSignal }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState("");
  const stopRef = useRef(null);
  const silence = useRef(null);
  const textRef = useRef("");
  const ref = useRef(null);
  // how the answer was given (time since the question appeared, any paste): shown in screening reports
  const shownAt = useRef(Date.now());
  const pasted = useRef(false);

  useEffect(() => {
    if (enabled && !handsFree) ref.current?.focus();
    if (enabled) {
      shownAt.current = Date.now();
      pasted.current = false;
    }
  }, [enabled, current, handsFree]);

  function stopMic() {
    clearTimeout(silence.current);
    stopRef.current?.();
    stopRef.current = null;
  }

  // the mic never stays open while the panel is talking or thinking
  useEffect(() => {
    if (!enabled) stopMic();
  }, [enabled]);
  useEffect(() => () => stopMic(), []);

  function submit(value = text) {
    if (!enabled || !value.trim()) return;
    stopMic();
    onSend(value, { seconds: Math.round((Date.now() - shownAt.current) / 100) / 10, pasted: pasted.current });
    setText("");
    textRef.current = "";
  }

  function startMic() {
    if (!canListen || stopRef.current) return;
    setMicError("");
    setListening(true);
    stopRef.current = listen(
      (t) => {
        setText(t);
        textRef.current = t;
        if (handsFree) {
          clearTimeout(silence.current);
          silence.current = setTimeout(() => {
            if (textRef.current.trim()) submit(textRef.current);
          }, SILENCE_MS);
        }
      },
      () => {
        setListening(false);
        stopRef.current = null;
      },
      (msg) => setMicError(msg),
    );
  }

  function toggleMic() {
    if (listening) stopMic();
    else startMic();
  }

  // hands-free: the session asks the mic to open once the examiner has finished speaking
  useEffect(() => {
    if (listenSignal && handsFree && enabled) startMic();
  }, [listenSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const repeat = () => submit("Can you repeat the question?");

  return (
    <div className="shrink-0 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 sm:pb-5 sm:pt-2">
      {/* small controls row: hands-free on the left, Repeat? on phones on the right */}
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
          {canListen ? (
            <button onClick={onToggleHandsFree} aria-pressed={handsFree}
              title="The examiners speak, then the mic opens by itself; your answer is sent after a short pause"
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${handsFree ? "bg-eng/15 text-eng ring-1 ring-eng/30" : "text-muted hover:bg-ink/[0.06] hover:text-ink"}`}>
              <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${handsFree ? "bg-eng" : "bg-ink/20"}`} aria-hidden="true">
                <span className={`absolute h-3 w-3 rounded-full bg-white transition-transform ${handsFree ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </span>
              Hands-free
            </button>
          ) : <span />}
          <span className="flex items-center gap-2">
            {listening && (
              <span className="text-[12px] font-medium text-bad">
                {handsFree ? "Listening… pause to send" : "Listening…"}
              </span>
            )}
            <button onClick={repeat} disabled={!enabled}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40 sm:hidden">
              Repeat?
            </button>
          </span>
      </div>

      <div className={`flex items-end gap-2 rounded-[24px] border bg-surface/90 p-2 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.5)] backdrop-blur transition-colors sm:p-2.5 ${enabled ? "border-ink/20" : "border-line opacity-60"}`}>
        {canListen && (
          <button onClick={toggleMic} disabled={!enabled} aria-pressed={listening} title={listening ? "Stop dictation" : "Answer by voice"} aria-label={listening ? "Stop dictation" : "Answer by voice"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 sm:h-12 sm:w-12 ${listening ? "animate-pulse bg-bad text-white" : "bg-raised text-ink hover:bg-ink/10"}`}>
            <Mic />
          </button>
        )}
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => { setText(e.target.value); textRef.current = e.target.value; }}
          onPaste={() => { pasted.current = true; }}
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
          className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] leading-relaxed placeholder:text-muted focus:outline-none sm:min-h-[48px] sm:py-3 sm:text-[17px]"
        />
        <button onClick={repeat} disabled={!enabled}
          className="hidden h-12 shrink-0 rounded-full px-4 text-[14px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-40 sm:block">
          Repeat?
        </button>
        <button onClick={() => submit()} disabled={!enabled || !text.trim()} aria-label="Send answer"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] text-white transition-opacity disabled:opacity-30 sm:h-12 sm:w-12">
          <Send />
        </button>
      </div>
      {micError && <p role="alert" className="mt-2 px-2 text-[13px] text-bad">{micError}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ transcript drawer */

function Drawer({ open, onClose, timeline, plan, sessionId, focus }) {
  const [tab, setTab] = useState("code");
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
                {[["code", "Code"], ["transcript", "Transcript"], ["plan", "The plan"]].map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)}
                    className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition-colors ${tab === k ? "bg-surface text-ink shadow-sm" : "text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink">×</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {tab === "code" ? (
                <CodeViewer sessionId={sessionId} focus={focus} />
              ) : tab === "transcript" ? (
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
