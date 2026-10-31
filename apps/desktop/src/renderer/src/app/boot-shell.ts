import { type ShellHint, ShellHintSchema } from "@shared/shell-hint";
import { libraryScopedKey } from "@/shared/lib/library-scope";
import { displayGamut, paintTheme } from "@/shared/lib/paint-theme";

/** Runs from the bundle because the packaged CSP blocks inline <script>. */

const BOOT_FAILSAFE_MS = 4000;

function readStoredShell(): ShellHint {
  try {
    const stored = ShellHintSchema.safeParse(
      JSON.parse(localStorage.getItem(libraryScopedKey("pondShell")) ?? "{}"),
    );
    return stored.success ? stored.data : {};
  } catch {
    return {};
  }
}

function paintShell(): void {
  const shell: ShellHint = {
    ...readStoredShell(),
    ...window.__pondShell,
  };
  const doc = document.documentElement;

  const theme =
    shell.theme ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  doc.setAttribute("data-theme", theme);
  doc.classList.add(theme);

  const { background, foreground, accent, contrast } = shell;
  if (background && foreground && accent) {
    paintTheme({ background, foreground, accent, contrast }, displayGamut());
  }
  doc.setAttribute(
    "data-platform",
    /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "mac" : "other",
  );

  performance.mark("pondAppStart");
}

function armBootFailsafe(): void {
  window.setTimeout(() => {
    const el = document.getElementById("boot");
    if (!el || el.dataset.state === "out") return;
    el.dataset.state = "out";
    el.setAttribute("aria-busy", "false");
    window.setTimeout(() => el.remove(), 220);
  }, BOOT_FAILSAFE_MS);
}

paintShell();
armBootFailsafe();
