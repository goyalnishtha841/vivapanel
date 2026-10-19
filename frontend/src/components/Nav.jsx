import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Logo from "./Logo.jsx";
import { Moon, Sun } from "./Icons.jsx";

const LINKS = [
  { href: "#try", label: "Try a question" },
  { href: "#panel", label: "The panel" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const jump = (href) => (e) => {
  e.preventDefault();
  document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
};

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode (better on projectors)" : "Dark mode"}
      className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

/** Full-width and borderless at the top so it melts into the hero; a soft blur appears once the page scrolls. */
export default function Nav({ theme, onToggleTheme }) {
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      if (window.scrollY < 300) setCurrent(null);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setCurrent(`#${e.target.id}`)),
      { rootMargin: "-35% 0px -60% 0px" }
    );
    LINKS.forEach((l) => {
      const el = document.querySelector(l.href);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter] duration-300 ${scrolled || open ? "bg-bg/75 backdrop-blur-xl" : "bg-transparent"}`}>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-6 px-5 sm:px-8">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Viva Panel home" className="shrink-0">
          <Logo large />
        </button>
        <div className="flex items-center gap-1.5">
          <nav className="mr-3 hidden items-center gap-1 lg:flex" aria-label="Sections">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={jump(l.href)}
                className={`relative px-3.5 py-2 text-[15px] font-medium transition-colors ${current === l.href ? "text-ink" : "text-muted hover:text-ink"}`}>
                {l.label}
                {current === l.href && (
                  <motion.span layoutId="nav-dot" className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }} />
                )}
              </a>
            ))}
          </nav>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => document.querySelector("#repo-input")?.focus(), 500); }}
            className="hidden rounded-full bg-brand px-5 py-2.5 text-[15px] font-semibold text-white transition-shadow hover:shadow-[0_0_28px_-4px_rgb(var(--brand)/0.7)] sm:inline">
            Start a viva
          </a>
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/[0.06] lg:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[1240px] px-3 pb-3 lg:hidden" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={(e) => { jump(l.href)(e); setOpen(false); }}
              className="block rounded-[14px] px-4 py-3 text-[16px] font-medium text-ink hover:bg-ink/[0.06]">
              {l.label}
            </a>
          ))}
        </motion.nav>
      )}
    </header>
  );
}
