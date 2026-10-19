import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import CodeField from "../components/CodeField.jsx";
import HeroDemo from "../components/HeroDemo.jsx";
import RepoInput from "../components/RepoInput.jsx";
import Avatar from "../components/Avatar.jsx";
import Logo, { Mark } from "../components/Logo.jsx";
import { Check, Cross, File, Wrench } from "../components/Icons.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/Motion.jsx";
import { EXAMINERS, ORDER, TONE } from "../lib/examiners.js";

/*
 * Landing page. Written for a final-year student before their viva.
 * Every claim matches what the system actually does (see docs/architecture.md).
 */

const REPO_URL = "https://github.com/goyalnishtha841/vivapanel";

const FACTS = [
  { value: "3", label: "examiners, each with their own focus" },
  { value: "~5 min", label: "for a full 12-question viva" },
  { value: "Your tests", label: "actually run, in a sandbox" },
  { value: "Every finding", label: "backed by a quote or a test result" },
];

// Exact questions from live sessions on our sample project (docs/evidence/2026-10-20-day4-eval-*.json).
const SAMPLE_Q = {
  professor: "Why did you choose plain SHA‑256 without a salt for hashing passwords, and what security drawbacks does this design have?",
  engineer: "If two students hit borrow_book for the same copy_id at the same millisecond, what race condition could occur, and how would you modify the SQL to prevent double‑borrowing?",
  junior: "When a user returns a book 7 days late, what integer does calculate_fine return and why?",
};

const STEPS = [
  { tone: "brand", tag: "10 seconds", title: "Paste your repo link", body: "Any public GitHub repository. Your final-year project, a hackathon build, anything you'll have to defend." },
  { tone: "prof", tag: "automatic", title: "The panel reads your code", body: "It maps your files, reads your README and key functions, and plans who asks what, so questions don't overlap." },
  { tone: "eng", tag: "about 5 minutes", title: "Answer three examiners", body: "Type or speak. They follow up on vague answers, push back on each other, and run your tests when you make a claim." },
  { tone: "jun", tag: "instant", title: "Get your report", body: "Scores per topic, your weak spots with the exact quotes, what the tests showed, and a study plan for this repo." },
];

const FAQS = [
  { q: "Who is Viva Panel for?", a: "Final-year and pre-final-year engineering students preparing for project vivas and placement interviews. Placement cells can use it to run mock vivas at scale, and recruiters can read the evidence-backed summary at the end of each report." },
  { q: "What kind of questions does it ask?", a: "Questions about your actual code, never textbook trivia. Every question names a specific file or function in your repo: why you designed it that way, what breaks under load or bad input, and how it works in plain words." },
  { q: "How does it check what I say?", a: "Each answer is judged against your real code. If you make a claim your tests could prove, like \"my tests cover double-borrowing\", the Engineer runs those tests in an isolated sandbox and also reads them to check whether they actually test what you claimed." },
  { q: "Is my code safe?", a: "We only read public repositories. Your tests run in an isolated container with no network access, strict time and memory limits, and a read-only copy of your code, and the container is deleted after the session." },
  { q: "Which languages work?", a: "The questions work for any language. Running tests currently supports Python projects with pytest; other repos still get the full panel, just without the sandbox check." },
  { q: "Can I answer by voice?", a: "Yes. In Chrome or Edge, press the mic to speak your answer, and turn on the speaker to hear each examiner in their own voice." },
  { q: "Is the score official?", a: "No. It's practice: a mirror of how a tough panel would see your answers. The point is the report, which shows exactly where you were vague and what to study before the real thing." },
];

export default function Landing() {
  return (
    <div className="relative isolate overflow-x-clip">
      <CodeField className="-z-10" />

      {/* ---------------------------------------------------------- hero */}
      <section className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[760px]"
          style={{ background: "radial-gradient(48% 58% at 50% 12%, rgb(var(--brand) / 0.16), transparent 72%)" }} />
        <div className="mx-auto flex min-h-[100svh] max-w-[1180px] flex-col justify-center px-5 pb-16 pt-[120px] sm:px-8">
          <Stagger className="mx-auto w-full max-w-[860px] text-center">
            <StaggerItem>
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-bg/50 px-4 py-1.5 text-[14px] font-medium text-brand backdrop-blur">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                </span>
                Three AI examiners · your repo · five minutes
              </span>
            </StaggerItem>
            <StaggerItem>
              <h1 className="mt-7 text-[44px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[66px] lg:text-[78px]">
                Can you defend
                <br />
                <span className="bg-gradient-to-r from-prof via-brand to-eng bg-clip-text pr-2 font-serif text-[1.12em] font-normal italic tracking-normal text-transparent">
                  your own code?
                </span>
              </h1>
            </StaggerItem>
            <StaggerItem>
              <p className="mx-auto mt-6 max-w-[640px] text-balance text-[18px] leading-relaxed text-muted sm:text-[19px]">
                Paste your GitHub link. A Professor, an Industry Engineer and a Curious Junior read your project,
                then grill you on it, the way a real viva panel would.
              </p>
            </StaggerItem>
            <StaggerItem className="mx-auto mt-9 max-w-[640px]">
              <RepoInput />
            </StaggerItem>
            <StaggerItem>
              <ul className="mt-7 flex flex-wrap justify-center gap-x-7 gap-y-2 text-[15px] text-muted">
                {["Questions about your actual files", "Claims checked by running your tests", "A study plan for this repo"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="text-brand" />{t}</li>
                ))}
              </ul>
            </StaggerItem>
          </Stagger>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          id="demo"
          className="mx-auto max-w-[1000px] px-5 pb-20 sm:px-8"
        >
          <HeroDemo />
          <p className="mt-6 text-center text-[13px] text-muted">
            A real session, replayed: the Professor catches a vague answer, then the Engineer runs the student's tests to check a claim.
          </p>
        </motion.div>
      </section>

      {/* ---------------------------------------------------------- facts */}
      <section className="mx-auto max-w-[1100px] px-5 sm:px-8">
        <Reveal>
          <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-line bg-surface/70 backdrop-blur lg:grid-cols-4">
            {FACTS.map((f, i) => (
              <div key={f.label} className={`border-line px-6 py-7 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
                <div className="text-[28px] font-bold tracking-tight sm:text-[32px]">{f.value}</div>
                <div className="mt-1 text-[14px] text-muted">{f.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- why */}
      <section id="why" className="scroll-mt-24 pt-28 lg:pt-36">
        <Heading eyebrow="Why Viva Panel" title={<>Practice that <Accent className="text-brand">actually</Accent> prepares you.</>}
          text="Here's what changes when your mock viva has read your code first." />
        <div className="mx-auto mt-14 max-w-[1080px] space-y-6 px-5 sm:px-8">
          <StoryCard index={0} tone="bad" pill="Practising with friends"
            title={<>They go <Accent className="text-bad">easy</Accent> on you.</>}
            text="Friends haven't read your code, so they ask what it does, nod, and move on. Nobody asks why you didn't salt the passwords, or what happens when two users click at once."
            points={[["cross", "“Looks great, what does it do?”"], ["cross", "No one checks if your answers match the code"]]}
            visual={<FriendChat />} />
          <StoryCard index={1} tone="brand" pill="With Viva Panel"
            title={<>A panel that has <Accent className="text-brand">read your code.</Accent></>}
            text="Every question points at a real file and function. Vague answers get a sharper follow-up, the examiners challenge each other's verdicts, and a claim like “my tests cover it” gets checked."
            points={[["check", "Three examiners, three angles, no overlap"], ["check", "Judged against your code, not against buzzwords"]]}
            visual={<FileRefs />} />
          <StoryCard index={2} tone="good" pill="After the session"
            title={<>Know <Accent className="text-good">exactly</Accent> what to study.</>}
            text="Your report scores each topic, quotes your weak answers back to you, shows what the tests proved, and turns it all into a study plan for this repository."
            points={[["check", "Evidence for every finding"], ["check", "A summary you can show a recruiter"]]}
            visual={<MiniReport />} />
        </div>
      </section>

      {/* ---------------------------------------------------------- panel */}
      <section id="panel" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pt-28 sm:px-8 lg:pt-36">
        <Heading wide eyebrow="Meet the panel" title="Three examiners. Three ways to find the gaps."
          text="Each one has a lane, so between them they cover how you designed it, what breaks, and whether you can explain it." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {ORDER.map((s, i) => {
            const ex = EXAMINERS[s];
            const t = TONE[ex.tone];
            return (
              <Reveal key={s} delay={i * 0.08}>
                <div className={`group h-full rounded-[22px] border border-line bg-surface/80 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-brand/40`}>
                  <div className="flex items-center gap-3">
                    <Avatar speaker={s} size={48} />
                    <div>
                      <div className="text-[18px] font-bold">{ex.name}</div>
                      <div className={`text-[13px] font-medium ${t.text}`}>{ex.lane}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted">{ex.blurb}</p>
                  <div className={`mt-5 rounded-2xl border-l-[3px] ${t.border} bg-raised/70 p-4 text-[14px] leading-snug`}>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Asked in a real session</div>
                    “{SAMPLE_Q[s]}”
                  </div>
                  {s === "engineer" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["read_file", "search_code", "run_tests"].map((tool) => (
                        <span key={tool} className="inline-flex items-center gap-1.5 rounded-full border border-eng/30 bg-eng/5 px-2.5 py-1 font-mono text-[11px] text-eng">
                          <Wrench width="11" height="11" />{tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- how */}
      <section id="how" className="mx-auto max-w-[1100px] scroll-mt-24 px-5 pt-28 sm:px-8 lg:pt-36">
        <Heading wide eyebrow="How it works" title="From repo link to study plan in four steps" text="No sign-up, no setup. Just a link to your code." />
        <ol className="relative mt-14 grid gap-5 md:grid-cols-4">
          <div aria-hidden="true" className="absolute left-0 right-0 top-[27px] hidden h-px bg-gradient-to-r from-brand/0 via-line to-brand/0 md:block" />
          {STEPS.map((s, i) => {
            const t = TONE[s.tone];
            return (
              <Reveal key={s.title} delay={i * 0.08}>
                <li className="relative list-none">
                  <span className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border ${t.border} bg-surface text-[20px] font-bold ${t.text}`}>{i + 1}</span>
                  <div className={`mt-5 inline-block rounded-full ${t.soft} px-2.5 py-0.5 text-[12px] font-medium ${t.text}`}>{s.tag}</div>
                  <h3 className="mt-2 text-[19px] font-bold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </section>

      {/* ---------------------------------------------------------- who else */}
      <section className="mx-auto max-w-[1100px] px-5 pt-28 sm:px-8 lg:pt-36">
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <Audience tone="prof" eyebrow="For placement cells" title="Mock vivas for the whole batch"
              text="One link per student, the same rubric for everyone, and a report per student that shows who needs help on what, before the real interviews." />
          </Reveal>
          <Reveal delay={0.08}>
            <Audience tone="eng" eyebrow="For recruiters" title="Screening backed by evidence"
              text="Each report ends with a neutral summary of what the candidate demonstrably understands, citing their own answers and test results instead of a gut feeling." />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section id="faq" className="mt-28 scroll-mt-24 border-y border-line bg-surface/50 backdrop-blur-[2px] lg:mt-36">
        <div className="mx-auto max-w-[820px] px-5 py-28 sm:px-8">
          <Heading eyebrow="FAQ" title="Questions, answered" />
          <Reveal className="mt-12"><Faq /></Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- CTA */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(45% 70% at 50% 60%, rgb(var(--brand) / 0.16), transparent 70%)" }} />
        <Reveal>
          <div className="mx-auto max-w-[760px] px-5 py-32 text-center sm:px-8">
            <span className="inline-block drop-shadow-[0_0_18px_rgb(var(--brand)/0.6)]"><Mark size={56} /></span>
            <h2 className="mt-6 text-[38px] font-bold leading-tight tracking-[-0.02em] sm:text-[56px]">
              Walk into your viva <Accent className="text-brand">ready.</Accent>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[18px] text-muted">Five minutes with the panel now beats being caught out in the real one.</p>
            <div className="mx-auto mt-9 max-w-[600px]"><RepoInput size="md" /></div>
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="border-t border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Logo large />
            <p className="mt-4 text-[14px] leading-relaxed text-muted">
              A multi-agent AI examiner panel that grills you on your own project. Built for the Ziro Hackathon 2026.
            </p>
          </div>
          <div className="flex gap-14 text-[14px]">
            <div className="space-y-2.5">
              <div className="text-[13px] font-semibold">Product</div>
              <a href="#panel" onClick={scrollTo("#panel")} className="block text-muted hover:text-brand">The panel</a>
              <a href="#how" onClick={scrollTo("#how")} className="block text-muted hover:text-brand">How it works</a>
              <a href="#faq" onClick={scrollTo("#faq")} className="block text-muted hover:text-brand">FAQ</a>
            </div>
            <div className="space-y-2.5">
              <div className="text-[13px] font-semibold">Project</div>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="block text-muted hover:text-brand">GitHub ↗</a>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-[1100px] border-t border-line px-5 py-6 text-[13px] text-muted sm:px-8">© 2026 Viva Panel team</div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const scrollTo = (sel) => (e) => {
  e.preventDefault();
  document.querySelector(sel)?.scrollIntoView({ behavior: "smooth" });
};

function Accent({ children, className = "" }) {
  return <span className={`font-serif text-[1.1em] font-normal italic ${className}`}>{children}</span>;
}

function Heading({ eyebrow, title, text, wide = false }) {
  return (
    <Reveal className={`mx-auto ${wide ? "max-w-[1100px]" : "max-w-[720px]"} px-5 text-center sm:px-8`}>
      <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</div>
      <h2 className="mt-3 text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[48px]">{title}</h2>
      {text && <p className="mx-auto mt-4 max-w-[680px] text-balance text-[18px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

const STORY_TONE = {
  bad: { pill: "bg-bad/10 text-bad", border: "border-bad/25", glow: "rgb(var(--bad) / 0.14)" },
  brand: { pill: "bg-brand/10 text-brand", border: "border-brand/30", glow: "rgb(var(--brand) / 0.16)" },
  good: { pill: "bg-good/10 text-good", border: "border-good/30", glow: "rgb(var(--good) / 0.14)" },
};

/** Cards stick and stack as you scroll on desktop; on phones they simply follow each other. */
function StoryCard({ index, tone, pill, title, text, points, visual }) {
  const t = STORY_TONE[tone];
  return (
    <div className="lg:sticky" style={{ top: 110 + index * 26 }}>
      <Reveal>
        <div className={`grid items-center gap-8 overflow-hidden rounded-[28px] border ${t.border} bg-surface p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)] sm:p-10 lg:grid-cols-2`}
          style={{ backgroundImage: `radial-gradient(60% 80% at 0% 0%, ${t.glow}, transparent 70%)` }}>
          <div>
            <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-medium ${t.pill}`}>{pill}</span>
            <h3 className="mt-5 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[40px]">{title}</h3>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">{text}</p>
            <ul className="mt-6 space-y-2.5">
              {points.map(([icon, p]) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px]">
                  {icon === "cross" ? <Cross className="text-bad" /> : <Check className="text-good" />}{p}
                </li>
              ))}
            </ul>
          </div>
          <div>{visual}</div>
        </div>
      </Reveal>
    </div>
  );
}

function FriendChat() {
  const lines = [
    ["them", "So what does your project do?"],
    ["you", "It's a library API, students can borrow books…"],
    ["them", "Nice!! Looks great 👍"],
    ["you", "…should I explain the database part?"],
    ["them", "Nah you'll be fine"],
  ];
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-bg/60 p-5">
      {lines.map(([who, text], i) => (
        <div key={i} className={`max-w-[80%] rounded-2xl px-4 py-2 text-[14px] ${who === "you" ? "ml-auto bg-brand/15" : "bg-raised"}`}>{text}</div>
      ))}
    </div>
  );
}

function FileRefs() {
  const rows = [
    ["app/auth.py", "hash_password", "prof", "Why no salt?"],
    ["app/routes/loans.py", "borrow_book", "eng", "Two requests at once?"],
    ["app/services/fines.py", "calculate_fine", "jun", "Walk me through it"],
    ["tests/test_loans.py", null, "eng", "run_tests → 2 passed"],
  ];
  return (
    <div className="rounded-2xl border border-line bg-bg/60 p-4 font-mono text-[13px]">
      {rows.map(([path, fn, tone, q]) => (
        <div key={path} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-raised/60">
          <span className="flex min-w-0 items-center gap-2 text-ink">
            <File className="shrink-0 text-muted" />
            <span className="truncate">{path}{fn && <span className="text-muted">:{fn}</span>}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-sans text-[12px] font-medium ${TONE[tone].soft} ${TONE[tone].text}`}>{q}</span>
        </div>
      ))}
    </div>
  );
}

function MiniReport() {
  const topics = [["Password hashing", 73, "good"], ["SQLite scalability", 22, "bad"], ["Borrow concurrency", 10, "bad"]];
  return (
    <div className="rounded-2xl border border-line bg-bg/60 p-5">
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-bad/70 text-[20px] font-bold">26</div>
        <div>
          <div className="text-[15px] font-semibold">Not ready yet</div>
          <div className="text-[13px] text-muted">Strong on security basics, weak on concurrency</div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {topics.map(([name, v, tone]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between text-[13px]"><span>{name}</span><span className="text-muted">{v}</span></div>
            <div className="h-2 rounded-full bg-raised"><div className={`h-2 rounded-full ${tone === "good" ? "bg-good" : "bg-bad"}`} style={{ width: `${v}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-raised/70 p-3 text-[13px] text-muted">
        <span className="font-semibold text-ink">Study plan:</span> write a threaded pytest that fires two borrows at once…
      </div>
    </div>
  );
}

function Audience({ tone, eyebrow, title, text }) {
  const t = TONE[tone];
  return (
    <div className="h-full rounded-[22px] border border-line bg-surface/80 p-7 backdrop-blur">
      <div className={`text-[13px] font-semibold uppercase tracking-[0.12em] ${t.text}`}>{eyebrow}</div>
      <h3 className="mt-3 text-[24px] font-bold">{title}</h3>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-line rounded-[20px] border border-line bg-bg/70">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[17px] font-medium transition-colors hover:text-brand">
              {f.q}
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-[18px] leading-none transition-transform duration-300 ${isOpen ? "rotate-45 border-brand/50 text-brand" : ""}`}>+</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <p className="px-6 pb-6 text-[16px] leading-relaxed text-muted">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
