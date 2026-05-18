import type { TaskStatus } from "@pond/schema/db";
import {
  AuthRequiredError,
  ExtractorError,
  GeoRestrictedError,
  RateLimitedError,
  TerminalError,
  TransientError,
  UnsupportedError,
} from "./extractors/errors";

export interface RetryDecision {
  status: TaskStatus;
  nextRunAt: Date;
  recordAttempt: boolean;
  lastError: string;
}

const BACKOFF_SCHEDULE_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

// ±20% jitter. Without it, a synchronised failure burst (e.g. 30 saves
// hit the same host blip) all retry on the exact same tick and stampede
// the host again. Spreading the herd across a window avoids the
// thundering-retry pattern.
const JITTER_FRACTION = 0.2;

function backoffFor(attempts: number): number {
  const idx = Math.min(attempts, BACKOFF_SCHEDULE_MS.length - 1);
  const base = BACKOFF_SCHEDULE_MS[idx] ?? BACKOFF_SCHEDULE_MS.at(-1) ?? 60_000;
  const spread = base * JITTER_FRACTION;
  const jitter = (Math.random() * 2 - 1) * spread;
  return Math.max(1_000, Math.round(base + jitter));
}

export function classifyError(
  err: unknown,
  ctx: { attempts: number; maxAttempts: number },
): RetryDecision {
  const now = Date.now();
  const lastError =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);

  if (err instanceof AuthRequiredError) {
    return {
      status: "blocked",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: false,
      lastError,
    };
  }
  if (err instanceof RateLimitedError) {
    const ms = (err.retryAfterSec ?? 60) * 1000;
    return {
      status: "pending",
      nextRunAt: new Date(now + ms),
      recordAttempt: false,
      lastError,
    };
  }
  if (err instanceof GeoRestrictedError) {
    return {
      status: "failed",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: true,
      lastError,
    };
  }
  if (err instanceof UnsupportedError || err instanceof TerminalError) {
    return {
      status: "failed",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: true,
      lastError,
    };
  }
  // Treat plain Errors and ExtractorError->TransientError as transient
  // (network blips, 5xx, timeouts). Give up after maxAttempts.
  const isTransient =
    err instanceof TransientError || !(err instanceof ExtractorError);
  if (isTransient) {
    const nextAttempts = ctx.attempts + 1;
    if (nextAttempts >= ctx.maxAttempts) {
      return {
        status: "failed",
        nextRunAt: new Date(now + 60 * 60_000),
        recordAttempt: true,
        lastError,
      };
    }
    return {
      status: "pending",
      nextRunAt: new Date(now + backoffFor(nextAttempts)),
      recordAttempt: true,
      lastError,
    };
  }
  return {
    status: "failed",
    nextRunAt: new Date(now + 24 * 60 * 60_000),
    recordAttempt: true,
    lastError,
  };
}

export interface BlockReason {
  reason: string;
  retryAfterMs: number;
}

export function blockDecision(reason: BlockReason): RetryDecision {
  return {
    status: "blocked",
    nextRunAt: new Date(Date.now() + reason.retryAfterMs),
    recordAttempt: false,
    lastError: reason.reason,
  };
}
