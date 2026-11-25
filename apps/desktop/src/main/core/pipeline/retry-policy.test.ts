import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RateLimitedError, TransientError } from "./extractors/errors";
import { classifyError } from "./retry-policy";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

it("parks a 429 until its Retry-After deadline without spending an attempt", () => {
  const decision = classifyError(new RateLimitedError(180), {
    attempts: 2,
    maxAttempts: 5,
  });

  expect(decision).toMatchObject({
    status: "deferred",
    recordAttempt: false,
    deferredReason: "source_budget",
  });
  expect(decision.nextRunAt.getTime()).toBe(Date.now() + 180_000);
});

it("bounds retry backoff and moves exhausted work to dead", () => {
  expect(
    classifyError(
      new TransientError("offline"),
      {
        attempts: 0,
        maxAttempts: 5,
      },
      () => 0.5,
    ),
  ).toMatchObject({
    status: "deferred",
    recordAttempt: true,
    deferredReason: "retry_backoff",
    nextRunAt: new Date(Date.now() + 120_000),
  });
  expect(
    classifyError(new TransientError("offline"), {
      attempts: 4,
      maxAttempts: 5,
    }),
  ).toMatchObject({
    status: "dead",
    recordAttempt: true,
    deferredReason: null,
  });
});
