/** @type {import('tailwindcss').Config} */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        raised: c("raised"),
        line: c("line"),
        ink: c("ink"),
        muted: c("muted"),
        brand: c("brand"),
        // one colour per examiner, used everywhere that examiner appears
        prof: c("prof"),
        eng: c("eng"),
        jun: c("jun"),
        good: c("good"),
        warn: c("warn"),
        bad: c("bad"),
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        // the red pen: margin notes and marks
        hand: ["Caveat", "cursive"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
