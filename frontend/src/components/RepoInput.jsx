import { useState } from "react";
import { Github } from "./Icons.jsx";
import { api, DEMO_REPO } from "../lib/api.js";
import { go } from "../lib/route.js";

const GITHUB = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?(\.git)?$/i;

/** The main call to action: paste a repo link, start a viva. */
export default function RepoInput({ size = "lg" }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [team, setTeam] = useState(null); // contributors of a team repo: "which one are you?"

  async function begin(repo, student = null) {
    setBusy(true);
    try {
      go(`/session/${await api.createSession(repo, student)}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function start(value = url) {
    const repo = value.trim();
    if (!GITHUB.test(repo)) {
      setError("Paste a public GitHub repository link, like github.com/you/your-project");
      return;
    }
    setError("");
    const full = repo.startsWith("http") ? repo : `https://${repo}`;
    if (value === DEMO_REPO) return begin(full);
    setBusy(true);
    const people = await api.contributors(full).catch(() => []);
    if (people.length >= 2) {
      setBusy(false);
      setTeam({ repo: full, people: people.slice(0, 8) });
      return;
    }
    begin(full);
  }

  if (team) {
    return (
      <div className="w-full rounded-[24px] border border-line bg-surface/90 p-5 text-left backdrop-blur sm:p-6">
        <p className="text-[17px] font-semibold">Team project. Which one are you?</p>
        <p className="mt-1 text-[14px] text-muted">The panel reads the git history and asks you mainly about the code you wrote.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {team.people.map((p) => (
            <button key={p.login} disabled={busy} onClick={() => begin(team.repo, p.login)}
              className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5 text-left transition-colors hover:border-brand/60 disabled:opacity-60">
              {p.avatar_url && <img src={`${p.avatar_url}&s=64`} alt="" width="32" height="32" className="h-8 w-8 rounded-full" />}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium">@{p.login}</span>
                <span className="block text-[12px] text-muted">{p.commits} commit{p.commits === 1 ? "" : "s"}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <button disabled={busy} onClick={() => begin(team.repo)} className="font-medium text-brand hover:underline">
            {busy ? "Starting…" : "Skip: examine me on the whole project"}
          </button>
          <button disabled={busy} onClick={() => setTeam(null)} className="text-muted hover:text-ink">Change repo</button>
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
      </div>
    );
  }

  const big = size === "lg";
  return (
    <div className="w-full">
      <form
        onSubmit={(e) => { e.preventDefault(); start(); }}
        className={`group flex items-center gap-2 rounded-full border bg-surface/80 p-1.5 pl-5 shadow-[0_24px_70px_-36px_rgb(var(--brand)/0.55)] backdrop-blur transition-colors focus-within:border-brand/70 ${error ? "border-bad/60" : "border-line"}`}
      >
        <Github className="shrink-0 text-muted" />
        <input
          id="repo-input"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
          placeholder="github.com/you/your-project"
          aria-label="GitHub repository link"
          aria-invalid={Boolean(error)}
          className={`min-w-0 flex-1 bg-transparent text-ink placeholder:text-muted/70 focus:outline-none ${big ? "py-3 text-[15px]" : "py-2 text-[14px]"}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`group/btn inline-flex shrink-0 items-center gap-2 rounded-full bg-brand font-semibold text-white transition-all hover:shadow-[0_0_32px_-4px_rgb(var(--brand)/0.7)] active:scale-[0.98] disabled:opacity-60 ${big ? "px-6 py-3 text-[15px]" : "px-5 py-2.5 text-[14px]"}`}
        >
          {busy ? "Starting…" : "Start my viva"}
          <span className="transition-transform group-hover/btn:translate-x-1">→</span>
        </button>
      </form>
      <div className="mt-3 flex min-h-[22px] items-center justify-center text-[14px]">
        {error ? (
          <span role="alert" className="text-bad">{error}</span>
        ) : (
          <button type="button" onClick={() => { setUrl(DEMO_REPO); start(DEMO_REPO); }} className="text-muted transition-colors hover:text-ink">
            or try it on our <span className="font-medium text-brand underline decoration-brand/40 underline-offset-4">sample project</span>
          </button>
        )}
      </div>
    </div>
  );
}
