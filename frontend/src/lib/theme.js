import { useEffect, useState } from "react";

const KEY = "viva-theme";

function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => stored() || "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: theme just isn't remembered */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
