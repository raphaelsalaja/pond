import { closeSync, fstatSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import type { App } from "electron";

/** Logging is optional: a denied system logs directory must not prevent startup. */
export function resolveLogFile(
  app: Pick<App, "getPath" | "setAppLogsPath">,
): string | null {
  for (const directory of [
    () => app.getPath("logs"),
    () => join(app.getPath("userData"), "logs"),
  ]) {
    try {
      const root = directory();
      mkdirSync(root, { recursive: true });
      const file = join(root, "main.log");
      /** Opening a directory can succeed on Windows, so the descriptor must be checked for a file. */
      const descriptor = openSync(file, "a");
      try {
        if (!fstatSync(descriptor).isFile()) continue;
      } finally {
        closeSync(descriptor);
      }
      app.setAppLogsPath(root);
      return file;
    } catch {
      /** An unwritable directory falls through to the next candidate. */
    }
  }
  return null;
}
