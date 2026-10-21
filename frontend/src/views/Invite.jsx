import { useEffect, useState } from "react";
import Ambient from "../components/Ambient.jsx";
import Logo from "../components/Logo.jsx";
import RepoInput from "../components/RepoInput.jsx";
import { ThemeToggle } from "../components/Nav.jsx";
import { api } from "../lib/api.js";
import { go } from "../lib/route.js";

/** The candidate's side of an interview link: the role, what happens, and exactly what is shared. */
export default function Invite({ token, theme, onToggleTheme }) {
  const [inv, setInv] = useState(null);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    api.invite(token).then(setInv).catch((e) => setError(e.message));
  }, [token]);

  const who = inv?.company || "The recruiter";
  return (
    <div className="relative isolate min-h-[100svh]">
      <Ambient />
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5"><div className="neon neon-quiet mx-auto flex h-[60px] max-w-[1100px] items-center justify-between gap-3 rounded-full bg-surface/70 pl-5 pr-2">
        <Logo />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div></header>
      <main className="mx-auto max-w-[720px] px-4 pb-24 pt-10 sm:px-6">
        {error && <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 p-5 text-bad">{error}</p>}
        {inv && (
          <>
            <p className="text-[14px] font-medium text-brand">Technical viva</p>
            <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-[-0.02em] sm:text-[40px]">
              {who} invited you to talk through <span className="font-serif font-normal italic text-brand">your project.</span>
            </h1>
            <p className="mt-3 text-[17px] text-muted">
              Role: <span className="font-medium text-ink">{inv.title}</span>
              {inv.focus.length > 0 && <> · Skills: {inv.focus.join(", ")}</>}
            </p>

            {inv.used ? (
              <div className="mt-8 rounded-[22px] neon neon-quiet p-6">
                <p className="text-[17px]">This link has already been used for a viva.</p>
                {inv.session_id && (
                  <button onClick={() => go(`/session/${inv.session_id}`)} className="mt-4 rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] shadow-[0_0_24px_-6px_rgb(var(--brand)/0.8)] px-5 py-2.5 text-[15px] font-semibold text-white">
                    Continue my viva
                  </button>
                )}
              </div>
            ) : (
              <>
                <ol className="mt-8 space-y-3 text-[16px] leading-relaxed">
                  <li><b>1.</b> Paste the GitHub link of a project you built. It must be public.</li>
                  <li><b>2.</b> Three examiners ask you 10–12 questions on your own code. Type or speak; typing is fine.</li>
                  <li><b>3.</b> They may run your project's tests to check something you say. It takes about 10 minutes.</li>
                </ol>

                <div className="mt-8 rounded-[22px] border border-brand/30 bg-brand/[0.05] p-5 sm:p-6">
                  <h2 className="text-[17px] font-semibold">What {who} will see</h2>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-muted">
                    <li>Your full transcript: every question and your answers.</li>
                    <li>The panel's judgement of each answer, scores per topic and per skill, and the files it asked about.</li>
                    <li>Analysis of your repository and the results of any tests the panel ran.</li>
                    <li>How answers were given: whether text was pasted, and how long each answer took.</li>
                  </ul>
                  <p className="mt-3 text-[14px] text-muted">
                    It's one signal for a person to review, not an automatic decision. Grammar, accent and fluency are not graded.
                  </p>
                  <label className="mt-4 flex items-start gap-3 text-[15px]">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--brand))]" />
                    <span>I understand and agree to share this with {who}.</span>
                  </label>
                </div>

                <div className={`mt-8 transition-opacity ${agreed ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!agreed}>
                  <RepoInput invite={token} disabled={!agreed} />
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
