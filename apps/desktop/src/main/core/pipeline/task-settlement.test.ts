import { describe, expect, it } from "vitest";
import {
  CaptureIncompleteError,
  RateLimitedError,
  TransientError,
  UnsupportedError,
} from "./extractors/errors";
import { WorkerWatchdogError } from "./reconciler-config";
import { countsTowardSourceBreaker } from "./task-settlement";

describe("countsTowardSourceBreaker", () => {
  it("ignores a capture that only missed a secondary field", () => {
    expect(
      countsTowardSourceBreaker(
        new CaptureIncompleteError("capture_tweet: reply parent still pending"),
      ),
    ).toBe(false);
  });

  it("counts real source failures", () => {
    expect(countsTowardSourceBreaker(new TransientError("offline"))).toBe(true);
    expect(
      countsTowardSourceBreaker(new WorkerWatchdogError("capture_tweet", 1)),
    ).toBe(true);
  });

  it("does not count errors the breaker never counted", () => {
    expect(countsTowardSourceBreaker(new RateLimitedError(60))).toBe(false);
    expect(countsTowardSourceBreaker(new UnsupportedError("nope"))).toBe(false);
    expect(countsTowardSourceBreaker(new Error("boom"))).toBe(false);
  });
});
