import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import Avatar from "../components/Avatar.jsx";
import CodeText from "../components/CodeText.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { Check, Copy, File, Print, Wrench } from "../components/Icons.jsx";
import { api, MODE } from "../lib/api.js";
import { EXAMINERS, TONE, VERDICT } from "../lib/examiners.js";
import { cleanQuestion } from "../lib/events.js";
import { go } from "../lib/route.js";

// Report shape: docs/api-contract.md §6 (agents/schemas.py:Report)

const READINESS = {
  ready: { label: "Ready", cls: "text-good", ring: "rgb(var(--good))" },
  almost_ready: { label: "Almost ready", cls: "text-good", ring: "rgb(var(--good))" },
  needs_work: { label: "Needs work", cls: "text-warn", ring: "rgb(var(--warn))" },
  not_ready: { label: "Not ready yet", cls: "text-bad", ring: "rgb(var(--bad))" },
};

const OUTCOME = {
  supported: "bg-good/15 text-good",
  contradicted: "bg-bad/15 text-bad",
  inconclusive: "bg-warn/15 text-warn",
};

export default function Report({ id, theme, onToggleTheme }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api.getReport(id).then((r) => alive && setReport(r)).catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <div className="relative isolate min-h-[100svh]">
      <div className="no-print"><Ambient /></div>
      <header className="no-print sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => go("/")} aria-label="Back to home"><Logo /></button>
        <div className="flex items-center gap-2">
          {report && (
            <button onClick={() => window.print()} className="hidden items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink sm:flex">
              <Print /> Save as PDF
            </button>
          )}
          <button onClick={() => go("/")} className="rounded-full bg-brand px-4 py-2 text-[14px] font-semibold text-white">New viva</button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      {error && <div role="alert" className="mx-auto mt-10 max-w-[600px] rounded-2xl border border-bad/40 bg-bad/10 p-5 text-bad">{error}</div>}
      {!report && !error && <Loading />}
      {report && <Body r={report} id={id} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-[70svh] flex-col items-center justify-center gap-4 text-muted">
      <span className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-brand" animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }} />
        ))}
      </span>
      The scoring agent is reviewing your answers and the test results…
    </div>
  );
}

function Body({ r, id }) {
  const rd = READINESS[r.readiness] || READINESS.needs_work;
  const reached = r.topics.filter((t) => t.confidence !== null);
  const before = r.previous?.topics || {};
  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-10 sm:px-6">

      {/* ------------------------------------------------ summary */}
      <section className="grid items-center gap-8 rounded-[28px] border border-line bg-surface p-6 sm:p-10 lg:grid-cols-[auto_1fr]"
        style={{ backgroundImage: "radial-gradient(60% 90% at 0% 0%, rgb(var(--brand) / 0.12), transparent 70%)" }}>
        <ScoreRing value={r.overall_score} color={rd.ring} />
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[15px] text-muted">
            Viva report for <span className="font-medium text-ink">{r.project}</span>
            {MODE === "demo" && <span title="The real report from the recorded session you just replayed" className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-medium text-brand">demo</span>}
            {r.previous && <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[12px] font-medium text-brand">retake</span>}
          </div>
          <div className={`mt-2 text-[30px] font-bold leading-tight sm:text-[38px] ${rd.cls}`}>{rd.label}</div>
          <p className="mt-3 font-serif text-[22px] italic leading-snug sm:text-[25px]">“{r.headline}”</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] text-muted">
            <Chip>{r.questions_asked} questions</Chip>
            <Chip>{reached.length} of {r.topics.length} topics reached</Chip>
            <Chip>{r.test_evidence.length} claim{r.test_evidence.length === 1 ? "" : "s"} tested</Chip>
            <Chip>{r.unanswered.length} unanswered</Chip>
            {r.student && <Chip>Team project · @{r.student.login} · {r.student.commits} of {r.student.team_commits} commits</Chip>}
          </div>
          {MODE === "live" && reached.length > 0 && <Retake id={id} />}
        </div>
      </section>

      {r.previous && <Progress r={r} />}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          {/* ------------------------------------------------ topics */}
          <Card title="Confidence by topic">
            <ul className="space-y-5">
              {r.topics.map((t) => {
                const ex = EXAMINERS[t.examiner];
                const tone = TONE[ex.tone];
                const color = t.confidence === null ? "" : t.confidence >= 60 ? "bg-good" : t.confidence >= 40 ? "bg-warn" : "bg-bad";
                return (
                  <li key={t.topic}>
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[16px] font-semibold">{t.topic}</span>
                        <span className={`ml-2 text-[12px] font-medium ${tone.text}`}>{ex.short}</span>
                        {t.own_work === true && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">your code</span>}
                        {t.own_work === false && <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">teammate's code</span>}
                      </div>
                      <span className="flex shrink-0 items-baseline gap-2 text-[15px] font-semibold tabular-nums">
                        {before[t.topic] != null && t.confidence !== null && (
                          <span className="text-[12px] font-medium text-muted">was {before[t.topic]}</span>
                        )}
                        {t.confidence ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-raised">
                      {t.confidence !== null && (
                        <motion.div className={`h-2 rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${Math.max(t.confidence, 2)}%` }}
                          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {t.verdicts.map((v, i) => (
                        <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${VERDICT[v]?.cls}`}>{VERDICT[v]?.label}</span>
                      ))}
                      {t.file_ref && <span className="ml-1 font-mono text-[11px] text-muted">{t.file_ref}</span>}
                    </div>
                    {t.note && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t.note}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* ------------------------------------------------ weak spots */}
          <Card title="Weak spots">
            <div className="space-y-5">
              {r.weak_spots.map((w, i) => (
                <div key={i} className="rounded-2xl border border-bad/25 bg-bad/[0.04] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bad/15 text-[12px] font-bold text-bad">{i + 1}</span>
                    <h3 className="text-[17px] font-semibold">{w.title}</h3>
                    {w.file_ref && <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5 font-mono text-[11px]"><File />{w.file_ref}</span>}
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{w.why}</p>
                  {w.evidence.length > 0 && <Evidence quotes={w.evidence} />}
                </div>
              ))}
            </div>
          </Card>

          {/* ------------------------------------------------ tests */}
          <Card title="What the tests showed">
            {r.test_evidence.length === 0 ? (
              <p className="text-[15px] text-muted">No claims were checked against the tests in this session.</p>
            ) : (
              <div className="space-y-4">
                {r.test_evidence.map((v, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-raised/40 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${OUTCOME[v.outcome]}`}>{v.outcome}</span>
                      <span className="text-[13px] text-muted">after answer {v.turn}</span>
                    </div>
                    <p className="mt-2 text-[16px] font-medium">“{v.claim}”</p>
                    <div className="mt-3 rounded-xl bg-bg/70 p-3 font-mono text-[12px] leading-relaxed">
                      <div className="text-muted">$ {v.result.command}</div>
                      <div className={v.result.status === "passed" ? "text-good" : "text-bad"}>
                        {v.result.status} · {v.result.passed} passed, {v.result.failed} failed ({v.result.duration_s}s)
                      </div>
                      {v.result.failing_tests.map((t) => <div key={t} className="text-bad">✗ {t}</div>)}
                    </div>
                    <p className="mt-3 text-[14px] leading-relaxed text-muted">{v.explanation}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {(r.code_checks || []).length > 0 && (
            <Card title="Code checks by the Engineer">
              <ul className="space-y-2">
                {r.code_checks.map((c, i) => (
                  <li key={i} className="flex gap-2 font-mono text-[12px]">
                    <Wrench className="mt-0.5 shrink-0 text-eng" />
                    <span><span className="text-eng">{c.tool}</span>({Object.values(c.args).join(", ")}) <span className="text-muted">→ {c.summary}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ------------------------------------------------ unanswered */}
          <Card title="Questions you didn't answer">
            {r.unanswered.length === 0 ? (
              <p className="text-[15px] text-muted">None. Every question got a real attempt.</p>
            ) : (
              <ul className="space-y-4">
                {r.unanswered.map((u) => (
                  <li key={u.turn} className="flex gap-3">
                    <Avatar speaker={u.examiner} size={30} />
                    <div className="min-w-0">
                      <p className="text-[15px] leading-relaxed"><CodeText text={cleanQuestion(u.question)} /></p>
                      <p className="mt-1 text-[13px] italic text-muted">You said: “{u.answer}”</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------ right column */}
        <div className="space-y-8">
          <StudyPlan steps={r.study_plan} />
          <Recruiter text={r.recruiter_summary} />
        </div>
      </div>
    </main>
  );
}

export { Card, Chip, Evidence, ScoreRing };

function Chip({ children }) {
  return <span className="rounded-full border border-line bg-bg/50 px-3 py-1">{children}</span>;
}

function Card({ title, note, children }) {
  return (
    <section className="rounded-[22px] border border-line bg-surface p-6 sm:p-7">
      <h2 className="text-[21px] font-bold">{title}</h2>
      {note && <p className="mt-1 text-[14px] text-muted">{note}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function ScoreRing({ value, color }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-[160px] w-[160px]">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgb(var(--raised))" strokeWidth="12" />
        <motion.circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-extrabold leading-none tabular-nums">{value}</span>
        <span className="mt-1 text-[12px] text-muted">out of 100</span>
      </div>
    </div>
  );
}

function Evidence({ quotes, me = "You" }) {
  return (
    <div className="mt-4 space-y-2 border-l-2 border-line pl-4">
      {quotes.map((q, i) => {
        const ex = EXAMINERS[q.speaker];
        return (
          <p key={i} className="text-[14px] leading-relaxed">
            <span className={`mr-1.5 text-[12px] font-semibold ${ex ? TONE[ex.tone].text : "text-brand"}`}>
              Q{q.turn} {ex ? ex.short : me}:
            </span>
            <span className={ex ? "text-muted" : ""}>
              {ex ? <CodeText text={cleanQuestion(q.text)} /> : `“${q.text}”`}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function StudyPlan({ steps }) {
  const [done, setDone] = useState(() => new Set());
  const total = steps.reduce((n, s) => n + s.minutes, 0);
  const left = steps.filter((_, i) => !done.has(i)).reduce((n, s) => n + s.minutes, 0);
  const toggle = (i) => setDone((d) => {
    const n = new Set(d);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });
  return (
    <section className="rounded-[22px] border border-brand/30 bg-surface p-6 lg:sticky lg:top-24"
        style={{ backgroundImage: "radial-gradient(80% 60% at 100% 0%, rgb(var(--brand) / 0.12), transparent 70%)" }}>
        <h2 className="text-[21px] font-bold">Your study plan</h2>
        <p className="mt-1 text-[15px] text-muted">{left} of {total} minutes left</p>
        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => {
            const isDone = done.has(i);
            return (
              <li key={i}>
                <button onClick={() => toggle(i)} aria-pressed={isDone}
                  className={`flex w-full gap-3 rounded-2xl border p-4 text-left transition-colors ${isDone ? "border-good/40 bg-good/5" : "border-line hover:border-brand/40"}`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-bold ${isDone ? "border-good bg-good text-white" : "border-line text-muted"}`}>
                    {isDone ? <Check width="14" height="14" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[15px] font-semibold ${isDone ? "text-muted line-through" : ""}`}>{s.title}</span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-muted">{s.action}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                      <span className="rounded-full bg-raised px-2 py-0.5">{s.minutes} min</span>
                      {s.file_ref && <span className="font-mono">{s.file_ref}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
  );
}

function Retake({ id }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true);
    setError("");
    try {
      go(`/session/${await api.retake(id)}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="no-print mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <button onClick={start} disabled={busy}
        className="rounded-full bg-brand px-5 py-2.5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60">
        {busy ? "Setting up your retake…" : "Retake my weak topics →"}
      </button>
      <span className="text-[14px] text-muted">After the study plan: new questions on the topics you found hardest.</span>
      {error && <p role="alert" className="w-full text-[13px] text-bad">{error}</p>}
    </div>
  );
}

function Progress({ r }) {
  const rows = r.topics
    .filter((t) => t.confidence !== null && r.previous.topics[t.topic] != null)
    .map((t) => ({ topic: t.topic, before: r.previous.topics[t.topic], after: t.confidence }));
  if (rows.length === 0) return null;
  const avg = (k) => Math.round(rows.reduce((n, x) => n + x[k], 0) / rows.length);
  const delta = avg("after") - avg("before");
  return (
    <section className="mt-8 rounded-[22px] border border-line bg-surface p-6 sm:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[21px] font-bold">Since your last attempt</h2>
        <button onClick={() => go(`/report/${r.previous.session_id}`)} className="no-print text-[14px] font-medium text-brand hover:underline">
          Previous report
        </button>
      </div>
      <p className="mt-2 text-[16px]">
        On the topics you retook: <span className="font-semibold tabular-nums">{avg("before")} → {avg("after")}</span>
        <Delta value={delta} />
      </p>
      <ul className="mt-5 space-y-4">
        {rows.map((x) => (
          <li key={x.topic}>
            <div className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="min-w-0 font-medium">{x.topic}</span>
              <span className="shrink-0 tabular-nums">{x.before} → <span className="font-semibold">{x.after}</span><Delta value={x.after - x.before} /></span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-raised">
              <div className="absolute inset-y-0 left-0 rounded-full bg-ink/20" style={{ width: `${Math.max(x.before, 1)}%` }} />
              <motion.div className={`absolute inset-y-0 left-0 rounded-full ${x.after >= x.before ? "bg-good" : "bg-bad"}`}
                initial={{ width: `${Math.max(x.before, 1)}%` }} animate={{ width: `${Math.max(x.after, 1)}%` }}
                transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ opacity: 0.85 }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Delta({ value }) {
  const cls = value > 0 ? "bg-good/15 text-good" : value < 0 ? "bg-bad/15 text-bad" : "bg-raised text-muted";
  return <span className={`ml-2 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${cls}`}>{value > 0 ? "+" : ""}{value}</span>;
}

function Recruiter({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  }
  return (
    <section className="rounded-[22px] border border-line bg-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-bold">Summary for recruiters</h2>
          <button onClick={copy} className="no-print flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-ink">
            {copied ? <><Check width="14" height="14" /> Copied</> : <><Copy width="14" height="14" /> Copy</>}
          </button>
        </div>
        <p className="mt-3 text-[15px] leading-relaxed">{text}</p>
      </section>
  );
}
