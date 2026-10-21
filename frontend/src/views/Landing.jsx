import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Ambient from "../components/Ambient.jsx";
import HeroDemo from "../components/HeroDemo.jsx";
import HeroDeco from "../components/HeroDeco.jsx";
import CodeLines from "../components/CodeLines.jsx";
import RepoInput from "../components/RepoInput.jsx";
import Avatar from "../components/Avatar.jsx";
import Logo, { Mark } from "../components/Logo.jsx";
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

const PANEL_NEON = { prof: "neon-blue", eng: "neon-teal", jun: "neon-gold" };
const STEP_NEON = { brand: "neon-sunset", prof: "neon-blue", eng: "neon-teal", jun: "neon-gold" };

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
      <div className="relative">
      <HeroDeco />
      <section className="relative mx-auto flex min-h-[100svh] max-w-[1180px] flex-col justify-center px-5 pb-16 pt-[120px] sm:px-8">
        <Stagger className="mx-auto w-full max-w-[880px] text-center">
          <StaggerItem>
            <span className="neon neon-quiet inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-medium text-ink/85">
              <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_10px_rgb(var(--brand))]" />
              A mock viva that has read your code
            </span>
          </StaggerItem>
          <StaggerItem>
            <h1 className="mt-7 text-[46px] font-extrabold leading-[1.08] tracking-[-0.035em] [text-shadow:0_0_40px_rgb(var(--ink)/0.12)] sm:text-[68px] lg:text-[80px]">
              Can you defend
              <br />
              <span className="relative inline-block font-serif text-[1.1em] font-normal italic tracking-normal text-brand [text-shadow:0_0_36px_rgb(var(--brand)/0.45)]">
                your own code?
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
      </div>

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
          <div className="grid grid-cols-2 gap-y-10 lg:grid-cols-4 lg:divide-x lg:divide-line">
            {FACTS.map((f) => (
              <div key={f.label} className="px-4 text-center">
                <div className="whitespace-nowrap text-[34px] font-extrabold tracking-tight [text-shadow:0_0_30px_rgb(var(--ink)/0.18)] sm:text-[46px] xl:text-[52px]">{f.value}</div>
                <div className="mt-1 text-[16px] text-ink/75">{f.label}</div>
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
            visual={<FriendChat />} extra={<FriendIcons />} />
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
                <div className={`neon ${PANEL_NEON[ex.tone]} neon-hover flex h-full flex-col rounded-[24px] p-7`}>
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
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="h-full list-none">
              <Reveal delay={i * 0.08} className="h-full">
                <div className={`neon ${STEP_NEON[s.tone]} neon-hover h-full rounded-[22px] p-6`}>
                  <span aria-hidden="true" className={`font-serif text-[52px] italic leading-none ${TONE[s.tone].text} [text-shadow:0_0_24px_currentColor]`}>{i + 1}</span>
                  <h3 className="mt-3 text-[20px] font-bold"><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-muted">{s.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------- who else */}
      <section id="teams" className="mx-auto max-w-[1100px] scroll-mt-24 px-5 pt-28 sm:px-8 lg:pt-36">
        <div className="grid gap-5 md:grid-cols-2">
          <Reveal>
            <Audience tone="neon-violet" title="For placement cells" text="Mock vivas for the whole batch: one link per student, the same rubric for everyone, and a report that shows who needs help on what before interviews start." />
          </Reveal>
          <Reveal delay={0.08}>
            <Audience tone="neon-teal" title="For recruiters" text="Each report ends with a neutral summary of what the candidate demonstrably understands, citing their own answers and test results instead of a gut feeling." />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- faq */}
      <section id="faq" className="mx-auto max-w-[820px] scroll-mt-24 px-5 py-28 sm:px-8 lg:py-36">
        <Heading title="Questions, answered" />
        <Reveal className="mt-12"><Faq /></Reveal>
      </section>

      {/* ---------------------------------------------------------- CTA */}
      <section className="mx-auto max-w-[860px] px-5 pb-32 sm:px-8">
        <Reveal className="neon neon-sunset rounded-[32px] px-6 py-14 text-center sm:px-12">
          <div className="flex justify-center"><Mark size={52} /></div>
          <h2 className="mt-6 text-[40px] font-bold leading-tight tracking-[-0.02em] sm:text-[58px]">
            Walk into your viva <Accent>ready.</Accent>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[18px] text-muted">Five minutes with the panel now beats being caught out in the real one.</p>
          <div className="mx-auto mt-10 max-w-[600px] text-left"><RepoInput size="md" /></div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- footer */}
      <Footer />
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
      <h2 className="text-balance text-[36px] font-bold leading-[1.16] tracking-[-0.025em] sm:text-[52px]">{title}</h2>
      {text && <p className="mx-auto mt-5 max-w-[640px] text-balance text-[18px] leading-relaxed text-muted">{text}</p>}
    </Reveal>
  );
}

/* ------------------------------------------------- "would your answer survive?" */

const ANSWER_TONE = {
  a: { card: "neon-rose", dot: "bg-[#FF4E6A]" },
  b: { card: "neon-violet", dot: "bg-[#9E70FF]" },
  c: { card: "neon-teal", dot: "bg-eng" },
};

function TryOne() {
  const [pick, setPick] = useState(null);
  const chosen = survive.answers.find((a) => a.id === pick);
  return (
    // code stays on top on phones and tablets; side by side from lg up
    <div className="grid gap-6 lg:grid-cols-2">
      {/* the code and the question */}
      <Reveal>
        <div className="neon neon-blue h-full rounded-[24px] p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[14px] font-medium text-ink">{survive.file}</span>
            <span className="win-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
          <div className="mt-4 rounded-2xl border border-line/70 bg-bg/70 p-4">
            <CodeLines code={survive.code} marked={survive.highlight} className="text-[12px] sm:text-[12.5px]" />
          </div>
          <div className="mt-6 flex gap-3">
            <Avatar speaker="professor" size={44} />
            <div className="min-w-0">
              <div className={`text-[15px] font-semibold ${TONE.prof.text}`}>The Professor asks</div>
              <p className="mt-1 text-[18px] leading-snug sm:text-[20px]">{survive.question}</p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* the answers: real buttons; picking one reveals the verdict the panel gave it */}
      <Reveal delay={0.08}>
        <div className="flex h-full flex-col gap-4" role="group" aria-label="Pick the answer you'd give">
          {survive.answers.map((a) => {
            const on = pick === a.id;
            const t = ANSWER_TONE[a.id] || ANSWER_TONE.a;
            return (
              <button key={a.id} type="button" onClick={() => setPick(a.id)} aria-pressed={on}
                className={`neon ${t.card} neon-hover rounded-[20px] p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 ${pick && !on ? "opacity-50 hover:opacity-80" : ""} ${on ? "scale-[1.01]" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink/80">
                    <span className={`h-2.5 w-2.5 rounded-full ${t.dot} shadow-[0_0_10px_currentColor]`} />{a.label}
                  </span>
                  {on && (
                    <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                      className={`shrink-0 rounded-full px-3 py-0.5 text-[13px] font-semibold ${VERDICT[a.verdict].cls}`}>
                      {VERDICT[a.verdict].label}
                    </motion.span>
                  )}
                </div>
                <p className="mt-2 text-[16px] leading-relaxed sm:text-[17px]">“{a.text}”</p>
              </button>
            );
          })}

          <AnimatePresence mode="wait">
            {chosen ? (
              <motion.div key={chosen.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} aria-live="polite"
                className={`neon ${chosen.verdict === "strong" ? "neon-teal" : "neon-sunset"} rounded-[20px] p-5`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-[15px] font-semibold">The panel's verdict</span>
                  <span className={`font-hand text-[22px] leading-none ${chosen.verdict === "strong" ? "text-good" : "text-brand"}`}>{chosen.mark}</span>
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
              <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1 pt-1 text-[15px] text-muted">
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
  bad: { card: "neon-sunset", pill: "bg-[#FF4E6A]/15 text-[#E5395A] dark:text-[#FF6F86] ring-1 ring-[#FF4E6A]/30" },
  brand: { card: "neon-teal", pill: "bg-eng/15 text-eng ring-1 ring-eng/30" },
  good: { card: "neon-violet", pill: "bg-violet/15 text-violet ring-1 ring-violet/30" },
};

/** One story card; they follow each other (no sticky stacking, so glass cards never cover each other's text). */
function StoryCard({ index, tone, pill, title, text, visual, extra }) {
  const t = STORY_TONE[tone];
  return (
    <div>
      <Reveal delay={index * 0.05}>
        <div className={`neon ${t.card} grid items-center gap-8 rounded-[28px] p-6 sm:p-10 lg:grid-cols-2`}>
          <div className="min-w-0">
            <span className={`inline-block rounded-full px-3 py-1 text-[14px] font-medium ${t.pill}`}>{pill}</span>
            <h3 className="mt-5 text-[32px] font-bold leading-[1.14] tracking-[-0.02em] sm:text-[44px]">{title}</h3>
            <p className="mt-4 text-[17px] leading-relaxed text-muted">{text}</p>
            {extra}
          </div>
          <div className="min-w-0">{visual}</div>
        </div>
      </Reveal>
    </div>
  );
}

/** Two small neon line icons under the "friends" card: a group, and a chat that goes nowhere. */
function FriendIcons() {
  return (
    <div className="mt-6 flex items-center gap-3" aria-hidden="true">
      <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="#FF8A3D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(255,138,61,0.7)]">
        <rect x="4" y="8" width="40" height="32" rx="10" stroke="#FF4E8A" />
        <circle cx="18" cy="21" r="4" /><circle cx="30" cy="21" r="4" />
        <path d="M11 33c1.5-4 4-6 7-6s5.5 2 7 6M23 33c1.5-4 4-6 7-6s5.5 2 7 6" />
      </svg>
      <svg width="62" height="44" viewBox="0 0 64 46" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(139,92,255,0.8)]">
        <path d="M6 6h34a5 5 0 0 1 5 5v14a5 5 0 0 1-5 5H22l-8 7v-7H6a5 5 0 0 1-5-5V11a5 5 0 0 1 5-5z" stroke="#8B5CFF" />
        <path d="M24 16h34a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-6v6l-7-6H24a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5z" stroke="#4F9BFF" />
        <path d="M30 27h4M38 27h4M46 27h4" stroke="#4F9BFF" />
      </svg>
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
    <div className="space-y-3 rounded-2xl border border-line/60 bg-bg/60 p-5">
      {lines.map(([who, text], i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
          className={`w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] ${who === "you" ? "bubble-you ml-auto rounded-br-md text-ink" : "rounded-bl-md bg-raised text-ink/90"}`}>
          {text}
        </motion.div>
      ))}
    </div>
  );
}

// The same function the Professor asks about, with the questions it draws pinned to it.
const AUTH_SNIPPET = `def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def verify_password(pw: str, hashed: str) -> bool:
    return hash_password(pw) == hashed`;

function FileRefs() {
  return (
    <div className="rounded-2xl border border-line/60 bg-bg/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[13px]">app/auth.py<span className="text-muted">:hash_password</span></span>
        <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${TONE.prof.soft} ${TONE.prof.text} ring-1 ring-prof/30`}>Why no salt?</span>
      </div>
      <div className="mt-2 flex justify-end">
        <span className={`rounded-full px-3 py-1 text-[13px] font-medium ${TONE.eng.soft} ${TONE.eng.text} ring-1 ring-eng/30`}>Two requests at once?</span>
      </div>
      <div className="mt-3 rounded-xl border border-line/60 bg-bg/80 p-3">
        <CodeLines code={AUTH_SNIPPET} marked={[2]} className="text-[11px] sm:text-[11.5px]" />
      </div>
    </div>
  );
}

function MiniReport() {
  const topics = [["Password hashing", 73], ["SQLite scalability", 22], ["Borrow concurrency", 10]];
  return (
    <div className="rounded-2xl border border-line/60 bg-bg/60 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-bad/70 text-[22px] font-extrabold shadow-[0_0_24px_-4px_rgb(var(--bad)/0.7)]">26</div>
        <div className="min-w-0">
          <div className="text-[17px] font-semibold">Not ready yet</div>
          <div className="text-[14px] text-muted">Strong on security basics, weak on concurrency</div>
        </div>
      </div>
      <div className="mt-5 space-y-3.5">
        {topics.map(([name, v]) => (
          <div key={name}>
            <div className="mb-1 flex justify-between gap-3 text-[14px]"><span>{name}</span><span className="text-muted">{v}</span></div>
            <div className="h-2 rounded-full bg-raised">
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className={`h-2 rounded-full ${v >= 60 ? "bg-good shadow-[0_0_12px_rgb(var(--good)/0.7)]" : "bg-bad shadow-[0_0_12px_rgb(var(--bad)/0.7)]"}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const YEAR = new Date().getFullYear();
const TEAM = ["Nishtha Goyal", "Asmita Roy", "Akshita"];

function Footer() {
  const cols = [
    { title: "Product", links: [["Try a question", "#try"], ["The panel", "#panel"], ["How it works", "#how"], ["FAQ", "#faq"]] },
    { title: "For teams", links: [["Placement cells", "#teams"], ["Recruiters", "#teams"], ["Create an interview link", "#/hire"]] },
    { title: "Project", links: [["Source on GitHub ↗", REPO_URL], ["Architecture ↗", `${REPO_URL}/blob/main/docs/architecture.md`]] },
  ];
  return (
    <footer className="relative mt-4 border-t border-line/80 bg-surface/50 backdrop-blur-xl">
      {/* a thin gradient line along the top edge */}
      <div aria-hidden="true" className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
      <div className="mx-auto grid max-w-[1140px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-[320px]">
          <Logo />
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Three AI examiners read your GitHub project and question you on it, so the real viva holds no surprises.
          </p>
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-[13px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Built for the Ziro Agentic AI Hackathon 2026
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/80">{c.title}</div>
            <ul className="mt-4 space-y-3">
              {c.links.map(([label, href]) => {
                const external = href.startsWith("http");
                const onClick = href.startsWith("#") && !href.startsWith("#/") ? jump(href) : undefined;
                return (
                  <li key={label}>
                    <a href={href} onClick={onClick} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                      className="text-[15px] text-muted transition-colors hover:text-ink">{label}</a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line/80">
        <div className="mx-auto flex max-w-[1140px] flex-col gap-3 px-5 py-6 text-[13px] text-muted sm:px-8 md:flex-row md:items-center md:justify-between">
          <p>© {YEAR} Viva Panel · Team Triple Threat AI ({TEAM.join(", ")}). All rights reserved.</p>
          <p>Viva Panel is a practice tool; its scores are not official grades.</p>
        </div>
      </div>
    </footer>
  );
}

function Audience({ title, text, tone = "neon-blue" }) {
  return (
    <div className={`neon ${tone} neon-hover h-full rounded-[24px] p-8`}>
      <h3 className="text-[24px] font-bold">{title}</h3>
      <p className="mt-3 text-[17px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="neon neon-quiet divide-y divide-line rounded-[24px] px-6 sm:px-8">
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
