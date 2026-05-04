import { useEffect } from "react";
import { usePrefs } from "../../pool/prefs";

/**
 * Applies the persisted theme + cursor preferences to `<html>` so the
 * tokens defined in `styles.css` (which all use `light-dark()` keyed
 * to `color-scheme`) honour the user's choice.
 *
 * Mounts headless inside `<App>` — no DOM output. Runs `data-theme` /
 * `data-pointer-cursors` writes inside an effect so SSR or storybook
 * environments without a real `document` stay safe.
 */
export function ThemeApplier() {
  const [prefs] = usePrefs("preferences");

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", prefs.theme);
    }
    if (prefs.pointerCursors) {
      root.setAttribute("data-pointer-cursors", "true");
    } else {
      root.removeAttribute("data-pointer-cursors");
    }
  }, [prefs.theme, prefs.pointerCursors]);

  return null;
}
