import { type ChildProcess, spawn } from "node:child_process";

type KillableProcess = Pick<ChildProcess, "pid" | "kill">;

type TrackableProcess = KillableProcess & {
  once(event: "close", listener: () => void): void;
};

type ProcessTreeKillDeps = {
  platform?: NodeJS.Platform;
  spawnTaskkill?: (args: string[]) => void;
};

function spawnTaskkill(args: string[]) {
  const taskkill = spawn("taskkill", args, {
    windowsHide: true,
    stdio: "ignore",
  });
  taskkill.on("error", () => {
    /* taskkill is missing or the tree already exited. */
  });
}

/**
 * Windows has no process groups or signals: child.kill() only ends the direct
 * child, so `taskkill /T` is needed to also end processes it started.
 */
export function killProcessTree(
  child: KillableProcess,
  signal: NodeJS.Signals,
  deps: ProcessTreeKillDeps = {},
) {
  const { platform = process.platform, spawnTaskkill: run = spawnTaskkill } =
    deps;
  if (platform === "win32" && child.pid) {
    try {
      run(["/pid", String(child.pid), "/T", "/F"]);
    } catch {
      /* The process may already have exited. */
    }
    return;
  }
  child.kill(signal);
}

const tracked = new Set<KillableProcess>();

/**
 * Remember a running child on Windows, which has no parent-death kill, so quit
 * can end children (and their children) that would otherwise outlive Pond and
 * lock the install directory.
 */
export function trackChildProcess(
  child: TrackableProcess,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform !== "win32" || !child.pid) return;
  tracked.add(child);
  child.once("close", () => tracked.delete(child));
}

export function killTrackedProcessTrees(deps: ProcessTreeKillDeps = {}) {
  for (const child of tracked) killProcessTree(child, "SIGKILL", deps);
  tracked.clear();
}
