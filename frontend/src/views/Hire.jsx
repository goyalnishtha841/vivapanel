import { useState } from "react";
import Ambient from "../components/Ambient.jsx";
import Logo from "../components/Logo.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { Check, Copy } from "../components/Icons.jsx";
import { api } from "../lib/api.js";
import { go } from "../lib/route.js";

const SAVED = "viva-screening-links";

function saved() {
  try {
    return JSON.parse(localStorage.getItem(SAVED) || "[]");
  } catch {
    return [];
  }
}

/** Recruiters: create an interview link for one candidate, and a private link to the results. */
export default function Hire({ theme, onToggleTheme }) {
  const [form, setForm] = useState({ title: "", company: "", focus: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState(null);
  const [recent, setRecent] = useState(saved);

  async function create(e) {
    e.preventDefault();
    if (form.title.trim().length < 2) return setError("Add the role you're hiring for.");
    setBusy(true);
    setError("");
    try {
      const focus = form.focus.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
      const { token, key } = await api.createInvite({ title: form.title.trim(), company: form.company.trim(), focus });
      const base = `${window.location.origin}${window.location.pathname}`;
      const links = { title: form.title.trim(), company: form.company.trim(), candidate: `${base}#/invite/${token}`,
        results: `${base}#/screening/${token}/${key}`, created: new Date().toISOString() };
      setMade(links);
      const next = [links, ...saved()].slice(0, 20);
      try {
        localStorage.setItem(SAVED, JSON.stringify(next));
      } catch {
        // private mode: the links are still on screen
      }
      setRecent(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative isolate min-h-[100svh]">
      <Ambient />
      <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-3 bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
        <button onClick={() => go("/")} aria-label="Back to home"><Logo /></button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <main className="mx-auto max-w-[760px] px-4 pb-24 pt-10 sm:px-6">
        <p className="text-[14px] font-medium text-brand">For recruiters and placement cells</p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight tracking-[-0.02em] sm:text-[44px]">
          Does the candidate understand <span className="font-serif font-normal italic text-brand">their own project?</span>
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-muted">
          Send a candidate an interview link. The panel reads their GitHub project, questions them on it with your role's
          skills in mind, runs their tests to check what they claim, and gives you an evidence-backed summary.
        </p>

        {!made ? (
          <form onSubmit={create} className="mt-8 space-y-5 rounded-[24px] border border-line bg-surface p-6 sm:p-8">
            <Field label="Role" hint="Read by the panel; it steers which topics they probe.">
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={80}
                placeholder="Backend developer intern" className={INPUT} />
            </Field>
            <Field label="Company (optional)" hint="Shown to the candidate.">
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} maxLength={80}
                placeholder="Acme Labs" className={INPUT} />
            </Field>
            <Field label="Skills to probe" hint="Comma-separated, up to 8. Each gets its own score.">
              <input value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })}
                placeholder="backend, REST APIs, testing" className={INPUT} />
            </Field>
            {error && <p role="alert" className="text-[14px] text-bad">{error}</p>}
            <button disabled={busy} className="rounded-full bg-brand px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-60">
              {busy ? "Creating…" : "Create interview link"}
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <LinkBox title="Send this to the candidate" note="One viva per link. They see the role and exactly what will be shared with you." url={made.candidate} />
            <LinkBox title="Your private results link" note="Keep it: it's the only way to open the results. We store only a hash of it." url={made.results} open />
            <button onClick={() => { setMade(null); setForm({ title: form.title, company: form.company, focus: form.focus }); }}
              className="text-[15px] font-medium text-brand hover:underline">Create a link for another candidate</button>
          </div>
        )}

        <p className="mt-8 rounded-2xl border border-line bg-raised/40 p-4 text-[14px] leading-relaxed text-muted">
          The result is one signal for a person to review, not a hiring decision. The panel judges correctness and
          understanding of the candidate's own code, never grammar, accent or fluency, and candidates can answer by typing.
        </p>

        {recent.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[18px] font-bold">Your links on this device</h2>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {recent.map((r) => (
                <li key={r.results} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[14px]">
                  <span>{r.title}{r.company && <span className="text-muted"> · {r.company}</span>}
                    <span className="ml-2 text-[12px] text-muted">{new Date(r.created).toLocaleDateString()}</span></span>
                  <a href={r.results} className="font-medium text-brand hover:underline">Results</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

const INPUT = "mt-1.5 w-full rounded-xl border border-line bg-bg/60 px-4 py-3 text-[16px] placeholder:text-muted/70 focus:border-brand/60 focus:outline-none";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-[15px] font-semibold">{label}</span>
      {children}
      <span className="mt-1 block text-[13px] text-muted">{hint}</span>
    </label>
  );
}

function LinkBox({ title, note, url, open }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked: the link is selectable
    }
  }
  return (
    <div className="rounded-[20px] border border-line bg-surface p-5">
      <div className="text-[16px] font-semibold">{title}</div>
      <p className="mt-1 text-[13px] text-muted">{note}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-bg/70 px-3 py-2 text-[13px]">{url}</code>
        <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-[14px] font-medium hover:border-brand/60">
          {copied ? <><Check /> Copied</> : <><Copy /> Copy</>}
        </button>
        {open && <a href={url} className="rounded-full bg-brand px-4 py-2 text-[14px] font-semibold text-white">Open</a>}
      </div>
    </div>
  );
}
