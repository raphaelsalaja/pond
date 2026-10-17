import { describe, expect, it } from "vitest";
import { createAuthLimiter, tokensMatch } from "./auth";

describe("tokensMatch", () => {
  it("accepts only the exact token, whatever the lengths", () => {
    expect(tokensMatch("abc123", "abc123")).toBe(true);
    expect(tokensMatch("abc123", "abc124")).toBe(false);
    expect(tokensMatch("abc123", "abc")).toBe(false);
    expect(tokensMatch("abc", "abc123")).toBe(false);
    expect(tokensMatch("abc123", "")).toBe(false);
  });
});

describe("createAuthLimiter", () => {
  it("blocks a client after repeated failures and unblocks after the window", () => {
    let time = 1_000;
    const limiter = createAuthLimiter(() => time);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(limiter.recordFailure("127.0.0.1")).toBe(false);
    }
    expect(limiter.isBlocked("127.0.0.1")).toBe(false);
    expect(limiter.recordFailure("127.0.0.1")).toBe(true);
    expect(limiter.isBlocked("127.0.0.1")).toBe(true);
    expect(limiter.isBlocked("127.0.0.2")).toBe(false);

    time += 5 * 60_000 + 1;
    expect(limiter.isBlocked("127.0.0.1")).toBe(false);
  });

  it("forgets failures after a success", () => {
    const limiter = createAuthLimiter();
    for (let attempt = 0; attempt < 11; attempt++) {
      limiter.recordFailure("::1");
    }
    limiter.clear("::1");
    expect(limiter.isBlocked("::1")).toBe(false);
  });
});
