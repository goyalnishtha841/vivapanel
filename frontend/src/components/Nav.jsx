import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line/80 bg-surface/50 text-muted outline-none transition-colors hover:border-ink/20 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/60"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.25 }} className="flex">
          {theme === "dark" ? <Sun /> : <Moon />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/**
 * A floating glass bar. At the very top it is nearly transparent so it melts into the hero; once the page
 * scrolls it gains blur, a gradient hairline border and a soft shadow. The active section gets a sliding pill.
 */
export default function Nav({ theme, onToggleTheme }) {
  const [scrolled, setScrolled] = useState(false);
  const [current, setCurrent] = useState(null);
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      // nothing is "current" in the hero or once past the FAQ (the closing call to action and footer)
      const nearEnd = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 200;
      if (window.scrollY < 300 || nearEnd) setCurrent(null);
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

  const lit = hover ?? current;
  const startViva = (e) => {
    e.preventDefault();
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => document.querySelector("#repo-input")?.focus(), 500);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={`mx-auto flex h-[60px] max-w-[1200px] items-center justify-between gap-4 rounded-full pl-5 pr-2 transition-all duration-500 ${
          scrolled || open ? "neon neon-quiet bg-surface/70" : "border border-transparent"
        }`}
      >
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Viva Panel home" className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
          <Logo large />
        </button>

        <nav className="hidden items-center rounded-full p-1 lg:flex" aria-label="Sections" onMouseLeave={() => setHover(null)}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={jump(l.href)} onMouseEnter={() => setHover(l.href)}
              aria-current={current === l.href ? "true" : undefined}
              className={`relative rounded-full px-4 py-2 text-[15px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/60 ${current === l.href || hover === l.href ? "text-ink" : "text-muted"}`}>
              {lit === l.href && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-ink/[0.07] ring-1 ring-ink/[0.06]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }} />
              )}
              {l.label}
              {current === l.href && (
                <span className="absolute bottom-[3px] left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF8A3D] shadow-[0_0_8px_rgb(var(--brand))]" />
              )}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="#/hire" className="hidden rounded-full px-3 py-2 text-[15px] font-medium text-muted transition-colors hover:text-ink md:inline">For recruiters</a>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <a href="#top" onClick={startViva}
            className="hidden rounded-full bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_0_24px_-6px_rgb(var(--brand)/0.8)] transition-shadow hover:shadow-[0_0_34px_-2px_rgb(var(--brand)/0.9)] sm:inline">
            Start a viva
          </a>
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink outline-none transition-colors hover:bg-ink/[0.06] focus-visible:ring-2 focus-visible:ring-brand/60 lg:hidden">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="neon neon-quiet mx-auto mt-2 max-w-[1200px] rounded-[24px] p-2 lg:hidden" aria-label="Sections">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={(e) => { jump(l.href)(e); setOpen(false); }}
                className="block rounded-[16px] px-4 py-3 text-[16px] font-medium text-ink hover:bg-ink/[0.06]">
                {l.label}
              </a>
            ))}
            <a href="#/hire" className="block rounded-[16px] px-4 py-3 text-[16px] font-medium text-ink hover:bg-ink/[0.06]">For recruiters</a>
            <a href="#top" onClick={startViva}
              className="mt-1 block rounded-[16px] bg-gradient-to-r from-[#FF4E6A] to-[#FF7A45] px-4 py-3 text-center text-[16px] font-semibold text-white sm:hidden">
              Start a viva
            </a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
