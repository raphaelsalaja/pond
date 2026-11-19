// Plays native trackpad haptics through the pond-haptics helper; every other platform is a no-op.
// The helper exits when Pond quits and its stdin closes.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import type { HapticPattern } from "../../shared/haptics";

const HELPER = "pond-haptics";

let helper: ChildProcess | null = null;
let unavailable = false;

function helperPath(): string | null {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const path = join(process.resourcesPath, "bin", HELPER);
  return existsSync(path) ? path : null;
}

function running(): ChildProcess | null {
  if (helper || unavailable) return helper;
  const path = helperPath();
  if (!path) {
    unavailable = true;
    return null;
  }
  const child = spawn(path, [], { stdio: ["pipe", "ignore", "ignore"] });
  child.on("error", (err) => {
    log.warn("[pond] haptics helper failed", err);
    unavailable = true;
  });
  child.on("exit", () => {
    if (helper === child) helper = null;
  });
  child.stdin?.on("error", () => {});
  helper = child;
  return child;
}

export function performHaptic(pattern: HapticPattern): void {
  running()?.stdin?.write(`${pattern}\n`);
}
