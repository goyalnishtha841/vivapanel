import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import HeroDemo from "../components/HeroDemo.jsx";
import RepoInput from "../components/RepoInput.jsx";
import Avatar from "../components/Avatar.jsx";
import Logo, { Mark } from "../components/Logo.jsx";
import { Circle, Note, Underline } from "../components/RedPen.jsx";
import { Reveal, Stagger, StaggerItem } from "../components/Motion.jsx";
import { EXAMINERS, ORDER, TONE, VERDICT } from "../lib/examiners.js";
import survive from "../mock/survive.json";

/*
 * Landing page, for a final-year student before their viva.
 * Every claim matches what the system does (docs/architecture.md); every quoted
 * question and verdict comes from a live session (docs/evidence/).
 */

const REPO_URL = "https://github.com/goyalnishtha841/vivapanel";

const FACTS = [
  { value: "3", label: "examiners, three angles" },
  { value: "5 min", label: "for a full viva" },
  { value: "Your tests", label: "run in a sandbox" },
  { value: "0", label: "made-up quotes in your report" },
];

// Exact questions from live sessions on the sample project (docs/evidence/2026-10-20-day4-eval-*.json).
const SAMPLE_Q = {
  professor: "Why did you choose plain SHA‑256 without a salt for hashing passwords, and what security drawbacks does this design have?",
  engineer: "If two students hit borrow_book for the same copy_id at the same millisecond, what race condition could occur, and how would you modify the SQL to prevent double‑borrowing?",
  junior: "When a user returns a book 7 days late, what integer does calculate_fine return and why?",
};

const STEPS = [
  { tone: "brand", title: "Paste your repo link", body: "Any public GitHub repository: your final-year project, a hackathon build, anything you'll have to defend." },
  { tone: "prof", title: "The panel reads your code", body: "The moderator maps your files and README, then splits the topics so no two examiners ask the same thing." },
  { tone: "eng", title: "Answer three examiners", body: "Type or speak. Vague answers get sharper follow-ups, and a claim like “my tests cover it” gets tested." },
  { tone: "jun", title: "Get your report", body: "Scores per topic, your weak answers quoted back to you, what the tests showed, and a study plan." },
];

const FAQS = [
  { q: "Who is Viva Panel for?", a: "Final-year and pre-final-year engineering students preparing for project vivas and placement interviews. Placement cells can run mock vivas for a whole batch, and recruiters can read the evidence-backed summary at the end of each report." },
  { q: "Do I need an account?", a: "No. Paste a public repo link and start. Your report has its own link, so you can come back to it or share it." },
  { q: "What kind of questions does it ask?", a: "Questions about your actual code, never textbook trivia. Every question names a file or function in your repo: why you designed it that way, what breaks under load or bad input, and how it works in plain words." },
  { q: "How does it check what I say?", a: "Each answer is judged against your real code. When you claim something your tests could prove, the Engineer runs those tests in an isolated sandbox and reads them to see whether they actually test what you claimed." },
  { q: "Is my code safe?", a: "We only read public repositories. Tests run in an isolated container with no network, strict time and memory limits and a read-only copy of your code, and the container is deleted after the session." },
  { q: "Which languages work?", a: "Questions work for any language. Running tests currently supports Python projects with pytest; other repos get the full panel without the sandbox check." },
  { q: "Is the score official?", a: "No. It's practice: how a tough panel would see your answers today. The useful part is the report, which shows exactly where you were vague and what to study next." },
];

export default function Landing() {
  return (
    <div id="top" className="relative isolate overflow-x-clip">
      <Ambient />

      {/* ---------------------------------------------------------- hero */}
      <section className="mx-auto flex min-h-[100svh] max-w-[1180px] flex-col justify-center px-5 pb-16 pt-[120px] sm:px-8">
        <Stagger className="mx-auto w-full max-w-[880px] text-center">
          <StaggerItem>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-4 py-1.5 text-[14px] font-medium text-muted backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-brand" />
              A mock viva that has read your code
            </span>
          </StaggerItem>
          <StaggerItem>
            <h1 className="mt-7 text-[46px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[68px] lg:text-[80px]">
              Can you defend
              <br />
              <span className="relative inline-block font-serif text-[1.1em] font-normal italic tracking-normal text-brand">
                your own code?
                <Underline className="-bottom-3 left-0 h-6 w-full sm:-bottom-4" />
                <Note className="absolute -right-[118px] bottom-1 hidden whitespace-nowrap text-[36px] not-italic lg:inline-block" rotate={-6} delay={1.5}>
                  they will ask.
                </Note>
              </span>
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="mx-auto mt-8 max-w-[620px] text-balance text-[19px] leading-relaxed text-muted">
              A Professor, an Industry Engineer and a Curious Junior read your GitHub project, then question you on it
              the way a real viva panel would.
            </p>
          </StaggerItem>
          <StaggerItem className="mx-auto mt-10 max-w-[640px]">
            <RepoInput />
          </StaggerItem>
        </Stagger>
      </section>

      <motion.div
        initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-[1000px] px-5 pb-24 sm:px-8"
      >
        <HeroDemo />
      </motion.div>

      {/* ---------------------------------------------------------- facts */}
      <section className="mx-auto max-w-[1100px] px-5 sm:px-8">
        <Reveal>
          <div className="grid grid-cols-2 gap-y-10 lg:grid-cols-4">
            {FACTS.map((f) => (
              <div key={f.label} className="text-center">
                <div className="text-[40px] font-extrabold tracking-tight sm:text-[48px]">{f.value}</div>
                <div className="mt-1 text-[15px] text-muted">{f.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- try one */}
      <section id="try" className="scroll-mt-24 pt-28 lg:pt-36">
        <Heading title={<>Would your answer <Accent>survive?</Accent></>}
          text="One real question from the Professor, about real code. Pick an answer and see the verdict the panel actually gave it." />
        <div className="mx-auto mt-14 max-w-[1100px] px-5 sm:px-8">
          <TryOne />
        </div>
      </section>

      {/* ---------------------------------------------------------- why */}
      <section id="why" className="scroll-mt-24 pt-28 lg:pt-36">
        <Heading title={<>Practice that <Accent>actually</Accent> prepares you</>} />
        <div className="mx-auto mt-14 max-w-[1080px] space-y-6 px-5 sm:px-8">
          <StoryCard index={0} tone="bad" pill="Practising with friends"
            title={<>They go <Accent>easy</Accent> on you.</>}
            text="Friends haven't read your code, so they ask what it does, nod, and move on. Nobody asks why you didn't salt the passwords, or what happens when two users click at once."
            visual={<FriendChat />} />
          <StoryCard index={1} tone="brand" pill="With Viva Panel"
            title={<>A panel that has <Accent>read your code.</Accent></>}
            text="Every question points at a real file and function. Vague answers get a sharper follow-up, the examiners challenge each other's verdicts, and claims get checked against your tests."
            visual={<FileRefs />} />
          <StoryCard index={2} tone="good" pill="After the session"
            title={<>Know <Accent>exactly</Accent> what to study.</>}
            text="Your report scores each topic, quotes your weak answers back to you, shows what the tests proved, and turns it into a study plan for this repository."
            visual={<MiniReport />} />
        </div>
      </section>

      {/* ---------------------------------------------------------- panel */}
      <section id="panel" className="mx-auto max-w-[1180px] scroll-mt-24 px-5 pt-28 sm:px-8 lg:pt-36">
        <Heading title="Three examiners. Three ways to find the gaps."
          text="Each has a lane: how you designed it, what breaks, and whether you can explain it. These questions were asked in real sessions." />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {ORDER.map((s, i) => {
            const ex = EXAMINERS[s];
            const t = TONE[ex.tone];
            return (
              <Reveal key={s} delay={i * 0.08}>
                <div className="flex h-full flex-col rounded-[24px] border border-line bg-surface/70 p-7 backdrop-blur transition-transform duration-300 hover:-translate-y-1">
                  <div className="flex items-center gap-3">
                    <Avatar speaker={s} size={48} />
                    <div>
                      <div className="text-[19px] font-bold">{ex.name}</div>
                      <div className={`text-[14px] font-medium ${t.text}`}>{ex.lane}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-[16px] leading-relaxed text-muted">{ex.blurb}</p>
                  <blockquote className="mt-auto pt-6 font-serif text-[21px] italic leading-snug text-ink">
                    “{SAMPLE_Q[s]}”
                  </blockquote>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- how */}
      <section id="how" className="mx-auto max-w-[1100px] scroll-mt-24 px-5 pt-28 sm:px-8 lg:pt-36">
        <Heading title="From repo link to study plan" />
        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <li className="list-none">
                <span className={`font-serif text-[56px] italic leading-none ${TONE[s.tone].text}`}>{i + 1}</span>
                <h3 className="mt-3 text-[20px] font-bold">{s.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-muted">{s.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------- who else */}
      <section className="mx-auto max-w-[1100px] px-5 pt-28 sm:px-8 lg:pt-36">
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <Audience title="For placement cells" text="Mock vivas for the whole batch: one link per student, the same rubric for everyone, and a report that shows who needs help on what before interviews start." />
          </Reveal>
          <Reveal delay={0.08}>
            <Audience title="For recruiters" text="Each report ends with a neutral summary of what the candidate demonstrably understands, citing their own answers and test results instead of a gut feeling." />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section id="faq" className="mx-auto max-w-[820px] scroll-mt-24 px-5 py-28 sm:px-8 lg:py-36">
        <Heading title="Questions, answered" />
        <Reveal className="mt-12"><Faq /></Reveal>
      </section>

      {/* ---------------------------------------------------------- CTA */}
      <section className="mx-auto max-w-[760px] px-5 pb-32 text-center sm:px-8">
        <Reveal>
          <Mark size={52} />
          <h2 className="mt-6 text-[40px] font-bold leading-tight tracking-[-0.02em] sm:text-[58px]">
            Walk into your viva <Accent>ready.</Accent>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[18px] text-muted">Five minutes with the panel now beats being caught out in the real one.</p>
          <div className="mx-auto mt-10 max-w-[600px]"><RepoInput size="md" /></div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
          <Logo />
          <div className="flex gap-6 text-[14px] text-muted">
            <a href="#how" onClick={jump("#how")} className="hover:text-ink">How it works</a>
            <a href="#faq" onClick={jump("#faq")} className="hover:text-ink">FAQ</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub ↗</a>
          </div>
          <div className="text-[13px] text-muted">Built for the Ziro Hackathon 2026</div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const jump = (sel) => (e) => {
  e.preventDefault();
  document.querySelector(sel)?.scrollIntoView({ behavior: "smooth" });
};

function Accent({ children }) {
  return <span className="font-serif text-[1.08em] font-normal italic text-brand">{children}</span>;
}

function Heading({ title, text }) {
  return (
    <Reveal className="mx-auto max-w-[860px] px-5 text-center sm:px-8">
      <h2 className="text-balance text-[36px] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[52px]">{title}</h2>
      {text && <p className="mx-auto mt-5 max-w-[640px] text-balance text-[18px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

/* ------------------------------------------------- "would your answer survive?" */

function TryOne() {
  const [pick, setPick] = useState(null);
  const chosen = survive.answers.find((a) => a.id === pick);
  const lines = survive.code.split("\n");
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* the code and the question */}
      <Reveal>
        <div className="h-full rounded-[24px] border border-line bg-surface/80 p-6 backdrop-blur sm:p-7">
          <div className="text-[14px] font-medium text-muted">{survive.file}</div>
          <pre className="mt-3 overflow-x-auto rounded-2xl bg-bg/70 p-4 font-mono text-[13px] leading-[1.75] [font-variant-ligatures:none]">
            {lines.map((l, i) => (
              <div key={i} className={survive.highlight.includes(i + 1) ? "-mx-4 bg-brand/10 px-4 text-ink" : "text-muted"}>{l || " "}</div>
            ))}
          </pre>
          <div className="mt-6 flex gap-3">
            <Avatar speaker="professor" size={40} />
            <div>
              <div className={`text-[14px] font-semibold ${TONE.prof.text}`}>The Professor asks</div>
              <p className="mt-1 text-[18px] leading-snug">{survive.question}</p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* the answers */}
      <Reveal delay={0.08}>
        <div className="flex h-full flex-col gap-3">
          {survive.answers.map((a) => {
            const on = pick === a.id;
            return (
              <button key={a.id} onClick={() => setPick(a.id)} aria-pressed={on}
                className={`relative rounded-[20px] border p-5 text-left transition-all duration-300 ${on ? "border-brand/50 bg-surface" : "border-line bg-surface/60 hover:border-ink/25"} ${pick && !on ? "opacity-55" : ""}`}>
                <div className="text-[13px] font-medium text-muted">{a.label}</div>
                <p className="mt-1.5 text-[16px] leading-relaxed">“{a.text}”</p>
                {on && (
                  <span className={`absolute -right-2 -top-3 rotate-[8deg] font-hand text-[30px] font-bold leading-none ${a.verdict === "strong" ? "text-good" : "text-brand"}`}>
                    <Circle className="-inset-x-4 -inset-y-2 h-[calc(100%+16px)] w-[calc(100%+32px)]" />
                    {VERDICT[a.verdict].label.toLowerCase()}
                  </span>
                )}
              </button>
            );
          })}

          <AnimatePresence mode="wait">
            {chosen ? (
              <motion.div key={chosen.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="rounded-[20px] border border-line bg-surface p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-semibold">The panel's verdict</span>
                  <Note className="text-[22px]" rotate={-3}>{chosen.mark}</Note>
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{chosen.judgement}</p>
                <div className="mt-4 border-t border-line pt-4 text-[15px] leading-relaxed">
                  {chosen.next ? (
                    <><span className={`font-semibold ${TONE.prof.text}`}>So the Professor follows up: </span>{chosen.next}</>
                  ) : (
                    <span className="text-good">Topic closed. The Professor hands over to the Engineer.</span>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 pt-2 text-[15px] text-muted">
                Pick the answer you'd give.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------- story cards */

const STORY_TONE = {
  bad: { pill: "bg-bad/10 text-bad", glow: "rgb(var(--bad) / 0.12)" },
  brand: { pill: "bg-brand/10 text-brand", glow: "rgb(var(--prof) / 0.14)" },
  good: { pill: "bg-good/10 text-good", glow: "rgb(var(--good) / 0.12)" },
};

/** Cards stick and stack as you scroll on desktop; on phones they follow each other. */
function StoryCard({ index, tone, pill, title, text, visual }) {
  const t = STORY_TONE[tone];
  return (
    <div className="lg:sticky" style={{ top: 100 + index * 24 }}>
      <Reveal>
        <div className="grid items-center gap-8 overflow-hidden rounded-[28px] border border-line bg-surface p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)] sm:p-10 lg:grid-cols-2"
          style={{ backgroundImage: `radial-gradient(60% 80% at 0% 0%, ${t.glow}, transparent 70%)` }}>
          <div>
            <span className={`inline-block rounded-full px-3 py-1 text-[14px] font-medium ${t.pill}`}>{pill}</span>
            <h3 className="mt-5 text-[34px] font-bold leading-[1.08] tracking-[-0.02em] sm:text-[42px]">{title}</h3>
            <p className="mt-4 text-[17px] leading-relaxed text-muted">{text}</p>
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
    ["you", "Should I explain the database part?"],
    ["them", "Nah you'll be fine"],
  ];
  return (
    <div className="space-y-2.5 rounded-2xl bg-bg/60 p-5">
      {lines.map(([who, text], i) => (
        <div key={i} className={`w-fit max-w-[80%] rounded-2xl px-4 py-2 text-[15px] ${who === "you" ? "ml-auto bg-brand/15" : "bg-raised"}`}>{text}</div>
      ))}
    </div>
  );
}

function FileRefs() {
  const rows = [
    ["app/auth.py", "hash_password", "prof", "Why no salt?"],
    ["app/routes/loans.py", "borrow_book", "eng", "Two requests at once?"],
    ["app/services/fines.py", "calculate_fine", "jun", "Walk me through it"],
  ];
  return (
    <div className="space-y-2 rounded-2xl bg-bg/60 p-4">
      {rows.map(([path, fn, tone, q]) => (
        <div key={path} className="flex items-center justify-between gap-3 rounded-xl px-3 py-3">
          <span className="min-w-0 truncate font-mono text-[13px]">{path}<span className="text-muted">:{fn}</span></span>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${TONE[tone].soft} ${TONE[tone].text}`}>{q}</span>
        </div>
      ))}
    </div>
  );
}

function MiniReport() {
  const topics = [["Password hashing", 73], ["SQLite scalability", 22], ["Borrow concurrency", 10]];
  return (
    <div className="rounded-2xl bg-bg/60 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-bad/70 text-[22px] font-extrabold">26</div>
        <div>
          <div className="text-[17px] font-semibold">Not ready yet</div>
          <div className="text-[14px] text-muted">Strong on security basics, weak on concurrency</div>
        </div>
      </div>
      <div className="mt-5 space-y-3.5">
        {topics.map(([name, v]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between text-[14px]"><span>{name}</span><span className="text-muted">{v}</span></div>
            <div className="h-2 rounded-full bg-raised"><div className={`h-2 rounded-full ${v >= 60 ? "bg-good" : "bg-bad"}`} style={{ width: `${v}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Audience({ title, text }) {
  return (
    <div className="h-full rounded-[24px] border border-line bg-surface/70 p-8 backdrop-blur">
      <h3 className="text-[24px] font-bold">{title}</h3>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-line border-y border-line">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q}>
            <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-6 py-6 text-left text-[18px] font-medium transition-colors hover:text-brand">
              {f.q}
              <span className={`text-[24px] font-light leading-none transition-transform duration-300 ${isOpen ? "rotate-45 text-brand" : "text-muted"}`}>+</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                  <p className="pb-6 pr-10 text-[17px] leading-relaxed text-muted">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
