import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import Avatar from "../components/Avatar.jsx";
import CodeText from "../components/CodeText.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { File, Print, Wrench } from "../components/Icons.jsx";
import { api } from "../lib/api.js";
import { EXAMINERS, TONE, VERDICT } from "../lib/examiners.js";
import { cleanQuestion } from "../lib/events.js";
import { go } from "../lib/route.js";
import { Card, Chip, Evidence, ScoreRing } from "./Report.jsx";

const LEVEL = [
  [80, "Strong understanding", "text-good", "rgb(var(--good))"],
  [60, "Good understanding", "text-good", "rgb(var(--good))"],
  [40, "Partial understanding", "text-warn", "rgb(var(--warn))"],
  [0, "Limited understanding", "text-bad", "rgb(var(--bad))"],
];
const OUTCOME = { supported: "bg-good/15 text-good", contradicted: "bg-bad/15 text-bad", inconclusive: "bg-warn/15 text-warn" };
const WAITING = {
  not_started: "Waiting for the candidate to start.",
  ingesting: "The candidate has started. The panel is reading their project.",
  awaiting: "The viva is in progress.",
  thinking: "The viva is in progress.",
  scoring: "The viva is finished. The scoring agent is writing the summary.",
  error: "The viva stopped with an error.",
};

/** Hiring mode: the recruiter's private results page (second report template). */
export default function Screening({ token, secret, theme, onToggleTheme }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let timer;
    const load = () => api.screening(token, secret)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!d.report) timer = setTimeout(load, 5000);
      })
      .catch((e) => alive && setError(e.message));
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, secret]);

  const role = data?.role;
  return (
    <div className="relative isolate min-h-[100svh]">
      <div className="no-print"><Ambient /></div>
      <header className="no-print sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => go("/hire")} aria-label="Recruiter home"><Logo /></button>
        <div className="flex items-center gap-2">
          {data?.report && (
            <button onClick={() => window.print()} className="hidden items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium text-muted hover:bg-ink/[0.06] hover:text-ink sm:flex">
              <Print /> Save as PDF
            </button>
          )}
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 pb-24 pt-10 sm:px-6">
        {error && <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 p-5 text-bad">{error}</p>}
        {role && (
          <div className="mb-6">
            <p className="text-[14px] font-medium text-brand">Technical screen</p>
            <h1 className="mt-1 text-[30px] font-bold leading-tight sm:text-[36px]">
              {role.title}{role.company && <span className="text-muted"> · {role.company}</span>}
            </h1>
            {data.repo_url && <a href={data.repo_url} target="_blank" rel="noreferrer" className="mt-1 inline-block font-mono text-[14px] text-muted hover:text-ink">{data.repo_url.replace("https://", "")}</a>}
          </div>
        )}
        {data && !data.report && (
          <div className="rounded-[22px] border border-line bg-surface p-8 text-center text-[17px] text-muted">
            {WAITING[data.status] || "Waiting…"}
            <p className="mt-2 text-[13px]">This page refreshes on its own.</p>
          </div>
        )}
        {data?.report && <Body r={data.report} focus={role.focus} />}
      </main>
    </div>
  );
}

function Body({ r, focus }) {
  const [, label, cls, ring] = LEVEL.find(([min]) => r.overall_score >= min);
  const integrity = r.integrity;
  return (
    <div className="space-y-8">
      <p className="rounded-2xl border border-line bg-raised/40 px-5 py-3 text-[14px] text-muted">
        One signal for a person to review, not a hiring decision. Every judgement below links to the candidate's own
        words, their code or a test run, so you can check it.
      </p>

      <section className="grid items-center gap-8 rounded-[28px] border border-line bg-surface p-6 sm:p-10 lg:grid-cols-[auto_1fr]"
        style={{ backgroundImage: "radial-gradient(60% 90% at 0% 0%, rgb(var(--brand) / 0.12), transparent 70%)" }}>
        <ScoreRing value={r.overall_score} color={ring} />
        <div>
          <div className="text-[15px] text-muted">Understanding of their own project</div>
          <div className={`mt-1 text-[30px] font-bold leading-tight sm:text-[36px] ${cls}`}>{label}</div>
          <p className="mt-3 text-[17px] leading-relaxed">{r.recruiter_summary}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-[13px] text-muted">
            <Chip>{r.questions_asked} questions</Chip>
            <Chip>{r.test_evidence.length} claim{r.test_evidence.length === 1 ? "" : "s"} tested</Chip>
            <Chip>{r.unanswered.length} unanswered</Chip>
          </div>
        </div>
      </section>

      {focus.length > 0 && (
        <Card title="Skills for this role" note="Each skill is scored from the topics that tested it.">
          <ul className="space-y-5">
            {r.skills.map((s) => {
              const color = s.score === null ? "" : s.score >= 60 ? "bg-good" : s.score >= 40 ? "bg-warn" : "bg-bad";
              return (
                <li key={s.skill}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[16px] font-semibold">{s.skill}</span>
                    <span className="text-[15px] font-semibold tabular-nums">{s.score ?? <span className="text-[13px] font-normal text-muted">Not tested</span>}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-raised">
                    {s.score !== null && <motion.div className={`h-2 rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${Math.max(s.score, 2)}%` }} transition={{ duration: 0.9 }} />}
                  </div>
                  {s.topics.length > 0 && <p className="mt-1.5 text-[13px] text-muted">From: {s.topics.join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Flags" note="Where the candidate couldn't explain their own code.">
          {r.weak_spots.length === 0 ? <p className="text-[15px] text-muted">No flags.</p> : (
            <div className="space-y-5">
              {r.weak_spots.map((w, i) => (
                <div key={i}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold">{w.title}</h3>
                    {w.file_ref && <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5 font-mono text-[11px]"><File />{w.file_ref}</span>}
                  </div>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted">{w.why}</p>
                  {w.evidence.length > 0 && <Evidence quotes={w.evidence} me="Candidate" />}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-8">
          <Card title="Claims checked against their tests">
            {r.test_evidence.length === 0 ? <p className="text-[15px] text-muted">No claims needed a test run.</p> : (
              <div className="space-y-4">
                {r.test_evidence.map((v, i) => (
                  <div key={i}>
                    <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${OUTCOME[v.outcome]}`}>{v.outcome}</span>
                    <p className="mt-2 text-[15px] font-medium">“{v.claim}”</p>
                    <p className="mt-1 font-mono text-[12px] text-muted">$ {v.result.command} → {v.result.status}, {v.result.passed} passed, {v.result.failed} failed</p>
                    <p className="mt-1 text-[14px] text-muted">{v.explanation}</p>
                  </div>
                ))}
              </div>
            )}
            {(r.code_checks || []).length > 0 && (
              <ul className="mt-5 space-y-1.5 border-t border-line pt-4">
                {r.code_checks.map((c, i) => (
                  <li key={i} className="flex gap-2 font-mono text-[12px]"><Wrench className="mt-0.5 shrink-0 text-eng" />
                    <span><span className="text-eng">{c.tool}</span>({Object.values(c.args).join(", ")}) <span className="text-muted">→ {c.summary}</span></span></li>
                ))}
              </ul>
            )}
          </Card>

          {integrity && (
            <Card title="How answers were given" note="Context, not a verdict: people paste from their own notes for many reasons.">
              <dl className="grid grid-cols-3 gap-3 text-center">
                <Stat n={`${integrity.pasted} of ${integrity.answers}`} label="answers pasted" />
                <Stat n={integrity.median_seconds != null ? `${Math.round(integrity.median_seconds)}s` : "—"} label="median time to answer" />
                <Stat n={integrity.fast_long_answers} label="long answers in under 10s" />
              </dl>
            </Card>
          )}
        </div>
      </div>

      <Card title="Full transcript" note="Every question, the candidate's answer, and the panel's judgement.">
        <ol className="space-y-5">
          {r.transcript.map((t, i) => {
            const ex = EXAMINERS[t.examiner];
            return (
              <li key={i} className="flex gap-3">
                <Avatar speaker={t.examiner} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`font-semibold ${TONE[ex.tone].text}`}>Q{i + 1} · {ex.short}</span>
                    {t.file_ref && <span className="font-mono text-muted">{t.file_ref}</span>}
                    {t.verdict && t.verdict !== "not_applicable" && <span className={`rounded-full px-2 py-0.5 font-medium ${VERDICT[t.verdict]?.cls}`}>{VERDICT[t.verdict]?.label}</span>}
                  </div>
                  <p className="mt-1 text-[15px] leading-relaxed"><CodeText text={cleanQuestion(t.question)} /></p>
                  <p className="mt-1.5 rounded-xl bg-raised/50 px-3 py-2 text-[15px] leading-relaxed">
                    {t.answer ?? <span className="italic text-muted">No answer</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-[12px] text-muted">
                    {t.judgement && <span>{t.judgement}</span>}
                    {t.seconds != null && <span>{Math.round(t.seconds)}s{t.pasted ? " · pasted" : ""}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function Stat({ n, label }) {
  return (
    <div className="rounded-2xl bg-raised/50 px-2 py-4">
      <dt className="text-[22px] font-bold tabular-nums">{n}</dt>
      <dd className="mt-1 text-[12px] text-muted">{label}</dd>
    </div>
  );
}
