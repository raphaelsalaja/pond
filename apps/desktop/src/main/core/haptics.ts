/** Plays trackpad haptics through the macOS `pond-haptics` helper; other platforms no-op. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import type { HapticPattern } from "../../shared/haptics";
import { createHapticPlayer, type HelperProcess } from "./haptic-player";

const HELPER = "pond-haptics";

function helperPath(): string | null {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const path = join(process.resourcesPath, "bin", HELPER);
  return existsSync(path) ? path : null;
}

function launchHelper(): HelperProcess | null {
  const path = helperPath();
  if (!path) return null;
  const child = spawn(path, [], { stdio: ["pipe", "ignore", "ignore"] });
  child.on("error", (err) => log.warn("[pond] haptics helper failed", err));
  child.on("exit", (code, signal) => {
    if (code !== 0) log.warn("[pond] haptics helper exited", { code, signal });
  });
  return child;
}

const player = createHapticPlayer(launchHelper);

export function performHaptic(pattern: HapticPattern): void {
  player.play(pattern);
}
