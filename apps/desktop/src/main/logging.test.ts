import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { App } from "electron";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLogFile } from "./logging";

const roots: Array<string> = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pond-logging-"));
  roots.push(root);
  const logs = join(root, "system-logs");
  const userData = join(root, "app-data");
  let selected: string | null = null;
  const app = {
    getPath: (name) => (name === "logs" ? logs : userData),
    setAppLogsPath: (path) => {
      selected = path ?? null;
    },
  } satisfies Pick<App, "getPath" | "setAppLogsPath">;
  return { logs, userData, app, selected: () => selected };
}

describe("resolveLogFile", () => {
  it("keeps the system logs location and preserves existing content", () => {
    const test = fixture();
    mkdirSync(test.logs);
    const file = join(test.logs, "main.log");
    writeFileSync(file, "previous launch\n");
    expect(resolveLogFile(test.app)).toBe(file);
    expect(test.selected()).toBe(test.logs);
    expect(readFileSync(file, "utf8")).toBe("previous launch\n");
  });

  it("falls back when Electron cannot resolve the logs path", () => {
    const test = fixture();
    const file = resolveLogFile({
      ...test.app,
      getPath: (name) => {
        if (name === "logs") throw new Error("Failed to get 'logs' path");
        return test.userData;
      },
    });
    expect(file).toBe(join(test.userData, "logs", "main.log"));
    expect(test.selected()).toBe(join(test.userData, "logs"));
  });

  it("falls back when the logs directory cannot be created", () => {
    const test = fixture();
    writeFileSync(test.logs, "blocked");
    expect(resolveLogFile(test.app)).toBe(
      join(test.userData, "logs", "main.log"),
    );
    expect(readFileSync(test.logs, "utf8")).toBe("blocked");
  });

  it("falls back when an existing log file cannot be opened", () => {
    const test = fixture();
    mkdirSync(join(test.logs, "main.log"), { recursive: true });
    expect(resolveLogFile(test.app)).toBe(
      join(test.userData, "logs", "main.log"),
    );
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "falls back when directory permissions deny access",
    () => {
      const test = fixture();
      mkdirSync(test.logs);
      chmodSync(test.logs, 0o500);
      try {
        expect(resolveLogFile(test.app)).toBe(
          join(test.userData, "logs", "main.log"),
        );
      } finally {
        chmodSync(test.logs, 0o700);
      }
    },
  );

  it("returns null when neither location is usable", () => {
    const test = fixture();
    writeFileSync(test.logs, "blocked");
    writeFileSync(test.userData, "blocked");
    expect(resolveLogFile(test.app)).toBeNull();
    expect(test.selected()).toBeNull();
  });
});
