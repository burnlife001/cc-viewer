import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "cc-viewer-theme";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(THEME_KEY) !== "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((prev) => !prev), []);

  return { dark, toggle };
}
