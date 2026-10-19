import { useState } from "react";
import { Github } from "./Icons.jsx";
import { api, DEMO_REPO, MODE } from "../lib/api.js";
import { go } from "../lib/route.js";

const GITHUB = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?(\.git)?$/i;

/** The main call to action: paste a repo link, start a viva. */
export default function RepoInput({ size = "lg" }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(value = url) {
    const repo = value.trim();
    if (!GITHUB.test(repo)) {
      setError("Paste a public GitHub repository link, like github.com/you/your-project");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const id = await api.createSession(repo.startsWith("http") ? repo : `https://${repo}`);
      go(`/session/${id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const big = size === "lg";
  return (
    <div className="w-full">
      <form
        onSubmit={(e) => { e.preventDefault(); start(); }}
        className={`group flex items-center gap-2 rounded-full border bg-surface/80 p-1.5 pl-5 shadow-[0_20px_60px_-30px_rgb(var(--brand)/0.7)] backdrop-blur transition-colors focus-within:border-brand/70 ${error ? "border-bad/60" : "border-line"}`}
      >
        <Github className="shrink-0 text-muted" />
        <input
          id="repo-input"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); }}
          placeholder="github.com/you/your-project"
          aria-label="GitHub repository link"
          aria-invalid={Boolean(error)}
          className={`min-w-0 flex-1 bg-transparent font-mono text-ink placeholder:text-muted/70 focus:outline-none ${big ? "py-3 text-[15px]" : "py-2 text-[14px]"}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`group/btn inline-flex shrink-0 items-center gap-2 rounded-full bg-brand font-semibold text-white transition-all hover:shadow-[0_0_36px_-4px_rgb(var(--brand)/0.85)] active:scale-[0.98] disabled:opacity-60 ${big ? "px-6 py-3 text-[15px]" : "px-5 py-2.5 text-[14px]"}`}
        >
          {busy ? "Starting…" : "Start my viva"}
          <span className="transition-transform group-hover/btn:translate-x-1">→</span>
        </button>
      </form>
      <div className="mt-3 flex min-h-[22px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px]">
        {error ? (
          <span role="alert" className="text-bad">{error}</span>
        ) : (
          <>
            <span className="text-muted">No repo handy?</span>
            <button type="button" onClick={() => { setUrl(DEMO_REPO); start(DEMO_REPO); }} className="font-medium text-brand underline-offset-4 hover:underline">
              Try the sample project
            </button>
            {MODE === "demo" && <span className="text-muted">· demo mode replays a recorded session</span>}
          </>
        )}
      </div>
    </div>
  );
}
