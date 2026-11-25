import { normalizeTheme, resolveActiveTheme } from "@pond/schema/db";
import { ShellHintSchema } from "@shared/shell-hint";
import type { ShellHint } from "@shared/shell-hint";
import { useEffect } from "react";
import { useMediaMatch } from "rooks";
import { libraryScopedKey } from "@/shared/lib/library-scope";
import { paintTheme } from "@/shared/lib/paint-theme";
import { IS_MAC } from "@/shared/lib/platform";
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
  } catch {
    /** Storage can be full or blocked, and the shell hint is only a startup cache. */
  }
}

export function ThemeApplier() {
  const [prefs] = usePrefs("preferences");
  const [windowPrefs] = usePrefs("window");
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
      if (reduce) {
        root.setAttribute("data-reduce-motion", "true");
      } else {
        root.removeAttribute("data-reduce-motion");
      }
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

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ds-font-roundness", String(prefs.fontRoundness));
    root.style.setProperty(
      "--ds-font-optical-size",
      String(prefs.fontOpticalSize),
    );
    if (prefs.fontOpticalSizeAuto) {
      root.removeAttribute("data-font-optical-size");
    } else {
      root.setAttribute("data-font-optical-size", "fixed");
    }
  }, [prefs.fontRoundness, prefs.fontOpticalSizeAuto, prefs.fontOpticalSize]);

  useEffect(() => {
    const root = document.documentElement;
    if (IS_MAC && windowPrefs.translucent) {
      root.setAttribute("data-translucent", "");
    } else {
      root.removeAttribute("data-translucent");
    }
    root.style.setProperty("--window-tint", `${windowPrefs.translucentTint}%`);
  }, [windowPrefs.translucent, windowPrefs.translucentTint]);

  return null;
}
