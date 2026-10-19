import Nav from "./components/Nav.jsx";
import Landing from "./views/Landing.jsx";
import Session from "./views/Session.jsx";
import Report from "./views/Report.jsx";
import { useRoute } from "./lib/route.js";
import { useTheme } from "./lib/theme.js";

export default function App() {
  const { page, id } = useRoute();
  const [theme, toggleTheme] = useTheme();

  if (page === "session" && id) return <Session id={id} theme={theme} onToggleTheme={toggleTheme} />;
  if (page === "report" && id) return <Report id={id} theme={theme} onToggleTheme={toggleTheme} />;
  return (
    <>
      <Nav theme={theme} onToggleTheme={toggleTheme} />
      <Landing />
    </>
  );
}
