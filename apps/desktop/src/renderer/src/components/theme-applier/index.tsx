import { useEffect } from "react";
import { usePrefs } from "@/pool/prefs";

export function ThemeApplier() {
  const [prefs] = usePrefs("preferences");

  useEffect(() => {
    const root = document.documentElement;

    const apply = (resolved: "light" | "dark") => {
      root.setAttribute("data-theme", resolved);
      root.classList.toggle("dark", resolved === "dark");
      root.classList.toggle("light", resolved === "light");
    };

    if (prefs.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const sync = () => apply(mq.matches ? "dark" : "light");
      sync();
      mq.addEventListener("change", sync);
      return () => mq.removeEventListener("change", sync);
    }

    apply(prefs.theme);
  }, [prefs.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.pointerCursors) {
      root.setAttribute("data-pointer-cursors", "true");
    } else {
      root.removeAttribute("data-pointer-cursors");
    }
  }, [prefs.pointerCursors]);

  return null;
}
