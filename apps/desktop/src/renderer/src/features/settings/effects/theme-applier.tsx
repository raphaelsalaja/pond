import { normalizeTheme, resolveActiveTheme } from "@pond/schema/db";
import { type ShellHint, ShellHintSchema } from "@shared/shell-hint";
import { useEffect } from "react";
import { useMediaMatch } from "rooks";
import { libraryScopedKey } from "@/shared/lib/library-scope";
import { paintTheme } from "@/shared/lib/paint-theme";
import { usePrefs } from "@/shared/state/prefs";

const SHELL_KEY = libraryScopedKey("pondShell");

function readShell(): ShellHint {
  const stored = ShellHintSchema.safeParse(
    JSON.parse(localStorage.getItem(SHELL_KEY) ?? "{}"),
  );
  return stored.success ? stored.data : {};
}

function persistShell(patch: ShellHint) {
  try {
    localStorage.setItem(
      SHELL_KEY,
      JSON.stringify({ ...readShell(), ...patch }),
    );
  } catch {}
}

export function ThemeApplier() {
  const [prefs] = usePrefs("preferences");
  const prefersDark = useMediaMatch("(prefers-color-scheme: dark)");
  const prefersP3 = useMediaMatch("(color-gamut: p3)");
  const prefersReducedMotion = useMediaMatch(
    "(prefers-reduced-motion: reduce)",
  );

  useEffect(() => {
    const { background, foreground, accent, contrast } = normalizeTheme(
      resolveActiveTheme({ preferences: prefs }, prefersDark),
    );
    const def = { background, foreground, accent, contrast };
    const theme = paintTheme(def, prefersP3 ? "p3" : "srgb");
    persistShell({ theme, ...def });
  }, [
    prefs.appearance,
    prefs.light,
    prefs.dark,
    prefs,
    prefersDark,
    prefersP3,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const setReduce = (reduce: boolean) => {
      if (reduce) root.setAttribute("data-reduce-motion", "true");
      else root.removeAttribute("data-reduce-motion");
    };
    if (prefs.reduceMotion === "always") {
      setReduce(true);
      return;
    }
    if (prefs.reduceMotion === "never") {
      setReduce(false);
      return;
    }
    setReduce(prefersReducedMotion);
  }, [prefs.reduceMotion, prefersReducedMotion]);

  return null;
}
