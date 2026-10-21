import Nav from "./components/Nav.jsx";
import Landing from "./views/Landing.jsx";
import Session from "./views/Session.jsx";
import Report from "./views/Report.jsx";
import Hire from "./views/Hire.jsx";
import Invite from "./views/Invite.jsx";
import Screening from "./views/Screening.jsx";
import { useRoute } from "./lib/route.js";
import { useTheme } from "./lib/theme.js";

/** First thing a keyboard user reaches: jumps past the header to the repo box. Invisible until focused. */
function SkipLink() {
  return (
    <a href="#repo-input"
      onClick={(e) => { e.preventDefault(); document.querySelector("#repo-input")?.focus(); }}
      className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-bg transition-transform focus:translate-y-0">
      Skip to the repo box
    </a>
  );
}

export default function App() {
  const { page, id, extra } = useRoute();
  const [theme, toggleTheme] = useTheme();

  if (page === "session" && id) return <Session id={id} theme={theme} onToggleTheme={toggleTheme} />;
  if (page === "report" && id) return <Report id={id} theme={theme} onToggleTheme={toggleTheme} />;
  if (page === "hire") return <Hire theme={theme} onToggleTheme={toggleTheme} />;
  if (page === "invite" && id) return <Invite token={id} theme={theme} onToggleTheme={toggleTheme} />;
  if (page === "screening" && id) return <Screening token={id} secret={extra} theme={theme} onToggleTheme={toggleTheme} />;
  return (
    <>
      <SkipLink />
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <Landing />
    </>
  );
}
