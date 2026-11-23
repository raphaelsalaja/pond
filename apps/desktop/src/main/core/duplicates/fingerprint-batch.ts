import { stat } from "node:fs/promises";
import type Database from "better-sqlite3";
import { classifyPendingAssets } from "./asset-index";
import type { FingerprintOutcome } from "./fingerprint-compute";
import {
  type FingerprintAlgorithm,
  type FingerprintJob,
  nextFingerprintJobs,
  recordFingerprint,
} from "./fingerprints";

const FINGERPRINT_BATCH_SIZE = 25;

export interface FingerprintBatchDeps {
  resolvePath: (saveId: string, path: string) => string;
  compute: (
    algorithm: FingerprintAlgorithm,
    path: string,
  ) => Promise<FingerprintOutcome>;
  /** Checked between files so a long batch yields as soon as the machine gets busy. */
  shouldStop?: () => boolean;
  now?: () => number;
}

export type FingerprintBatchResult =
  | { state: "classified"; count: number }
  | { state: "fingerprinted"; count: number }
  | { state: "stopped"; count: number }
  | { state: "idle" };

async function fileSize(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

async function runJob(
  sqlite: Database.Database,
  job: FingerprintJob,
  deps: FingerprintBatchDeps,
): Promise<void> {
  const now = deps.now?.() ?? Date.now();
  const path = deps.resolvePath(job.saveId, job.path);
  const size = await fileSize(path);
  if (size === null) {
    recordFingerprint(sqlite, {
      sha256: job.sha256,
      algorithm: job.algorithm,
      status: "missing",
      error: "File not found",
      now,
    });
    return;
  }
  /** A file whose size no longer matches its record is not the content the hash names, so it is never fingerprinted under that hash. */
  if (job.size > 0 && size !== job.size) {
    recordFingerprint(sqlite, {
      sha256: job.sha256,
      algorithm: job.algorithm,
      status: "missing",
      error: "File changed on disk",
      now,
    });
    return;
  }
  let outcome: FingerprintOutcome;
  try {
    outcome = await deps.compute(job.algorithm, path);
  } catch (error) {
    outcome = {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  recordFingerprint(sqlite, {
    sha256: job.sha256,
    algorithm: job.algorithm,
    status: outcome.status,
    value: outcome.status === "ok" ? outcome.value : null,
    error: outcome.error?.slice(0, 500) ?? null,
    now: deps.now?.() ?? Date.now(),
  });
}

/** One unit of background work: tag new files with a media type first, then fingerprint a bounded batch one file at a time. */
export async function runFingerprintBatch(
  sqlite: Database.Database,
  deps: FingerprintBatchDeps,
  limit = FINGERPRINT_BATCH_SIZE,
): Promise<FingerprintBatchResult> {
  const classified = classifyPendingAssets(sqlite);
  if (classified > 0) return { state: "classified", count: classified };
  const jobs = nextFingerprintJobs(sqlite, limit, deps.now?.() ?? Date.now());
  if (jobs.length === 0) return { state: "idle" };
  let count = 0;
  for (const job of jobs) {
    if (deps.shouldStop?.()) return { state: "stopped", count };
    await runJob(sqlite, job, deps);
    count += 1;
  }
  return { state: "fingerprinted", count };
}
