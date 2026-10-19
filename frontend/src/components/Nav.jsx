import { useState } from "react";
import Logo from "./Logo.jsx";
import { Moon, Sun } from "./Icons.jsx";
import { go } from "../lib/route.js";

const LINKS = [
  { href: "#why", label: "Why" },
  { href: "#panel", label: "The panel" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode (better on projectors)" : "Dark mode"}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

/** Floating pill nav for the landing page. */
export default function Nav({ theme, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 rounded-full border border-line/70 bg-surface/70 py-2 pl-5 pr-2 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <button onClick={() => { go("/"); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Viva Panel home">
          <Logo />
        </button>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => { e.preventDefault(); document.querySelector(l.href)?.scrollIntoView({ behavior: "smooth" }); }}
              className="rounded-full px-4 py-2 text-[14px] font-medium text-muted transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <a href="#start" onClick={(e) => { e.preventDefault(); document.querySelector("#repo-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="hidden rounded-full bg-brand px-5 py-2.5 text-[14px] font-semibold text-white transition-shadow hover:shadow-[0_0_28px_-4px_rgb(var(--brand)/0.8)] sm:inline">
            Start a viva
          </a>
          <button onClick={() => setOpen((v) => !v)} aria-label="Menu" className="flex h-10 w-10 items-center justify-center rounded-full border border-line md:hidden">
            <span className="text-lg leading-none">{open ? "×" : "≡"}</span>
          </button>
        </div>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-[1180px] rounded-3xl border border-line bg-surface/95 p-3 backdrop-blur-xl md:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => { e.preventDefault(); setOpen(false); document.querySelector(l.href)?.scrollIntoView({ behavior: "smooth" }); }}
              className="block rounded-2xl px-4 py-3 text-[15px] text-ink hover:bg-raised">
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
