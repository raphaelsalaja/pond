import type { TaskDeferredReason, TaskStatus } from "@pond/schema/db";
import {
  AuthRequiredError,
  ExtractorError,
  GeoRestrictedError,
  RateLimitedError,
  TerminalError,
  TransientError,
  UnsupportedError,
} from "./extractors/errors";

interface RetryDecision {
  status: TaskStatus;
  nextRunAt: Date;
  recordAttempt: boolean;
  lastError: string;
  deferredReason: TaskDeferredReason | null;
}

const BACKOFF_SCHEDULE_MS = [
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
];

const JITTER_FRACTION = 0.2;

function backoffFor(attempts: number): number {
  const idx = Math.min(attempts, BACKOFF_SCHEDULE_MS.length - 1);
  const base = BACKOFF_SCHEDULE_MS[idx] ?? BACKOFF_SCHEDULE_MS.at(-1) ?? 60_000;
  const spread = base * JITTER_FRACTION;
  const jitter = (Math.random() * 2 - 1) * spread;
  return Math.max(1000, Math.round(base + jitter));
}

export function classifyError(
  cause: unknown,
  ctx: { attempts: number; maxAttempts: number },
): RetryDecision {
  const now = Date.now();
  const lastError =
    cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);

  if (cause instanceof AuthRequiredError) {
    return {
      status: "blocked",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: false,
      lastError,
      deferredReason: null,
    };
  }
  if (cause instanceof RateLimitedError) {
    const ms = (cause.retryAfterSec ?? 60) * 1000;
    return {
      status: "deferred",
      nextRunAt: new Date(now + ms),
      recordAttempt: false,
      lastError,
      deferredReason: "source_budget",
    };
  }
  if (cause instanceof GeoRestrictedError) {
    return {
      status: "dead",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: true,
      lastError,
      deferredReason: null,
    };
  }
  if (cause instanceof UnsupportedError || cause instanceof TerminalError) {
    return {
      status: "dead",
      nextRunAt: new Date(now + 24 * 60 * 60_000),
      recordAttempt: true,
      lastError,
      deferredReason: null,
    };
  }
  const isTransient =
    cause instanceof TransientError || !(cause instanceof ExtractorError);
  if (isTransient) {
    const nextAttempts = ctx.attempts + 1;
    if (nextAttempts >= ctx.maxAttempts) {
      return {
        status: "dead",
        nextRunAt: new Date(now + 60 * 60_000),
        recordAttempt: true,
        lastError,
        deferredReason: null,
      };
    }
    return {
      status: "deferred",
      nextRunAt: new Date(now + backoffFor(nextAttempts)),
      recordAttempt: true,
      lastError,
      deferredReason: "retry_backoff",
    };
  }
  return {
    status: "dead",
    nextRunAt: new Date(now + 24 * 60 * 60_000),
    recordAttempt: true,
    lastError,
    deferredReason: null,
  };
}
