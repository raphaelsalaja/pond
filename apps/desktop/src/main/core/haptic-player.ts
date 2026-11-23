import type { Writable } from "node:stream";
import type { HapticPattern } from "../../shared/haptics";

/** The helper only exits when Pond closes its stdin, so every other exit is a crash. */
const MAX_LAUNCHES = 3;

export interface HelperProcess {
  readonly stdin: Writable | null;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "exit", listener: () => void): void;
}

export interface HapticPlayer {
  play(pattern: HapticPattern): void;
}

export function createHapticPlayer(
  launch: () => HelperProcess | null,
): HapticPlayer {
  let helper: HelperProcess | null = null;
  let launches = 0;
  let unavailable = false;

  function running(): HelperProcess | null {
    if (helper || unavailable) return helper;
    if (launches >= MAX_LAUNCHES) {
      unavailable = true;
      return null;
    }
    launches += 1;
    const child = launch();
    if (!child) {
      unavailable = true;
      return null;
    }
    /** A failed spawn emits `error` without `exit`, and its stdin is already destroyed. */
    child.on("error", () => {
      if (helper === child) helper = null;
      unavailable = true;
    });
    child.on("exit", () => {
      if (helper === child) helper = null;
    });
    child.stdin?.on("error", () => {});
    helper = child;
    return child;
  }

  return {
    play(pattern) {
      running()?.stdin?.write(`${pattern}\n`);
    },
  };
}
