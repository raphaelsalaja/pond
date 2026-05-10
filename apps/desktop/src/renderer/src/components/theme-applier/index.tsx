import { useEffect } from "react";
import { usePrefs } from "@/pool/prefs";

/**
 * Applies the persisted theme + cursor preferences to `<html>`.
 *
 * Two switches are needed for "dark" to actually flip everything in
 * the tree:
 *
 *   1. `data-theme` (and the matching `color-scheme` block in
 *      `styles.css`) drives every `light-dark()` swatch — including
 *      `--ds-background-color` in `@pond/ui/theme.css` and any
 *      ad-hoc `light-dark()` colours in component CSS.
 *   2. `.dark` / `.light` class on `<html>` drives the Radix Themes
 *      colour tokens we import in `@pond/ui/theme.css`. Radix gates its
 *      `--gray-*`, `--sky-*`, … overrides to `:root, .light,
 *      .light-theme` and `.dark, .dark-theme` — `color-scheme` alone
 *      doesn't move them, so without this class the `--ds-*` tokens
 *      stay locked to their light defaults (visible as white cards
 *      on a dark page in the Settings view).
 *
 * For "system" we resolve the OS preference live via `matchMedia`
 * so the class stays in sync if the user flips appearance while
 * Pond is open.
 */
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
