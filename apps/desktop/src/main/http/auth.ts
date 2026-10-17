import { createHash, timingSafeEqual } from "node:crypto";

const AUTH_WINDOW_MS = 5 * 60_000;
const AUTH_MAX_FAILURES = 10;

/** Constant-time comparison; hashing first hides the token length. */
export function tokensMatch(expected: string, presented: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(expected), digest(presented));
}

/**
 * Failure limiter keyed on the socket address. Request headers such as
 * `X-Forwarded-For` are client-controlled, so they must never choose the key.
 */
export function createAuthLimiter(now: () => number = Date.now) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    isBlocked(key: string): boolean {
      const entry = failures.get(key);
      return (
        entry !== undefined &&
        entry.resetAt > now() &&
        entry.count > AUTH_MAX_FAILURES
      );
    },
    /** Returns true once the key has exceeded the allowed failures. */
    recordFailure(key: string): boolean {
      const entry = failures.get(key);
      if (!entry || entry.resetAt < now()) {
        failures.set(key, { count: 1, resetAt: now() + AUTH_WINDOW_MS });
        return false;
      }
      entry.count += 1;
      return entry.count > AUTH_MAX_FAILURES;
    },
    clear(key: string): void {
      failures.delete(key);
    },
  };
}
