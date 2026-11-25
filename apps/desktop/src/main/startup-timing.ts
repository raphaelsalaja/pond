import log from "electron-log/main.js";

export type StartupMark =
  | "modules-loaded"
  | "app-ready"
  | "window-created"
  | "window-shown"
  | "renderer-ready";

const marks: Partial<Record<StartupMark, number>> = {};
let logged = false;

/** Node's `performance.now()` counts from process start, so each mark reads as time-to-X. */
export function markStartup(mark: StartupMark): void {
  if (marks[mark] !== undefined) return;
  marks[mark] = Math.round(performance.now());
}

export function logStartupTiming(): void {
  if (logged) return;
  logged = true;
  log.info("[pond startup] ms since process start", marks);
}

const STALL_PROBE_MS = 100;
const STALL_REPORT_MS = 200;
/** Larger gaps are system sleep, not a blocked thread. */
const STALL_IGNORE_MS = 60_000;

/** SQLite and IPC share the main thread, so any stall here freezes every window. */
export function watchMainThreadStalls(): () => void {
  let expected = performance.now() + STALL_PROBE_MS;
  const timer = setInterval(() => {
    const now = performance.now();
    const stall = now - expected;
    expected = now + STALL_PROBE_MS;
    if (stall >= STALL_REPORT_MS && stall < STALL_IGNORE_MS) {
      log.warn("[pond perf] main thread blocked", { ms: Math.round(stall) });
    }
  }, STALL_PROBE_MS);
  timer.unref();
  return () => clearInterval(timer);
}
