import { renameSync } from "node:fs";
import { rename } from "node:fs/promises";
import { z } from "zod";

/**
 * Windows reports EPERM/EBUSY/EACCES when antivirus, indexers or cloud-sync
 * clients briefly hold a file that is being replaced. Other platforms rename
 * atomically and keep their existing behavior.
 */
const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const ATTEMPTS = 5;

export interface RenameRetryDeps {
  platform?: NodeJS.Platform;
  sleep?: (ms: number) => Promise<void>;
}

export interface RenameSyncRetryDeps {
  platform?: NodeJS.Platform;
  rename?: (from: string, to: string) => void;
  sleep?: (ms: number) => void;
}

const ErrorCodeSchema = z.object({ code: z.string() });

function shouldRetry(
  code: string | undefined,
  attempt: number,
  platform: NodeJS.Platform,
): boolean {
  if (platform !== "win32" || attempt >= ATTEMPTS) return false;
  return code !== undefined && RETRYABLE_CODES.has(code);
}

function delayFor(attempt: number): number {
  return Math.min(500, 100 * attempt);
}

/** Rename that survives short-lived Windows locks (about 1 s in total). */
export async function renameWithRetry(
  from: string,
  to: string,
  deps: RenameRetryDeps & {
    rename?: (from: string, to: string) => Promise<void>;
  } = {},
): Promise<void> {
  const {
    rename: move = rename,
    platform = process.platform,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = deps;
  for (let attempt = 1; ; attempt++) {
    try {
      return await move(from, to);
    } catch (error) {
      if (
        !shouldRetry(
          ErrorCodeSchema.safeParse(error).data?.code,
          attempt,
          platform,
        )
      )
        throw error;
      await sleep(delayFor(attempt));
    }
  }
}

function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Synchronous variant for the few writers that cannot await. */
export function renameSyncWithRetry(
  from: string,
  to: string,
  deps: RenameSyncRetryDeps = {},
): void {
  const {
    rename: move = renameSync,
    platform = process.platform,
    sleep = blockingSleep,
  } = deps;
  for (let attempt = 1; ; attempt++) {
    try {
      move(from, to);
      return;
    } catch (error) {
      if (
        !shouldRetry(
          ErrorCodeSchema.safeParse(error).data?.code,
          attempt,
          platform,
        )
      )
        throw error;
      sleep(delayFor(attempt));
    }
  }
}
