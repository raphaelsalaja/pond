import type { MediaIndexStatus } from "@shared/media-index";
import { describe, expect, it } from "vitest";
import { mediaIndexCopy } from "./media-index";

function status(patch: Partial<MediaIndexStatus> = {}): MediaIndexStatus {
  return {
    state: "idle",
    prepared: 0,
    remaining: 12,
    currentTitle: null,
    pauseReason: null,
    lastError: null,
    ...patch,
  };
}

describe("media index toolbar copy", () => {
  it("offers indexing, pause, and resume actions for the matching states", () => {
    expect(mediaIndexCopy(status())).toMatchObject({
      action: "start",
      actionLabel: "Index now",
    });
    expect(mediaIndexCopy(status({ state: "indexing" }))).toMatchObject({
      title: "Preparing media",
      action: "pause",
    });
    expect(mediaIndexCopy(status({ state: "paused-user" }))).toMatchObject({
      title: "Indexing paused",
      action: "resume",
    });
  });

  it("explains each automatic pause", () => {
    expect(
      mediaIndexCopy(status({ state: "paused-system", pauseReason: "battery" }))
        .detail,
    ).toBe("Waiting for power");
    expect(
      mediaIndexCopy(status({ state: "paused-system", pauseReason: "active" }))
        .detail,
    ).toBe("Waiting until your Mac is idle");
    expect(
      mediaIndexCopy(status({ state: "paused-system", pauseReason: "thermal" }))
        .detail,
    ).toBe("Waiting for your Mac to cool down");
  });

  it("offers check and recovery actions after completion or failure", () => {
    expect(mediaIndexCopy(status({ state: "complete" }))).toMatchObject({
      title: "All media prepared",
      actionLabel: "Check again",
    });
    expect(
      mediaIndexCopy(status({ state: "error", lastError: "Preview failed" })),
    ).toMatchObject({
      title: "Indexing stopped",
      detail: "Preview failed",
      actionLabel: "Retry",
    });
  });
});
