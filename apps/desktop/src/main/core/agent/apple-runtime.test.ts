import { describe, expect, it, vi } from "vitest";
import {
  appleErrorMessage,
  appleStatus,
  parseHelperReply,
} from "./apple-runtime";
import type { AppleRequest } from "./apple-runtime";

describe("parseHelperReply", () => {
  it("reads a success", () => {
    expect(parseHelperReply('{"ok":true,"contextSize":4096}')).toEqual({
      ok: true,
      contextSize: 4096,
    });
  });

  it("treats junk as failed", () => {
    expect(parseHelperReply("boom")).toEqual({ ok: false, error: "failed" });
  });
});

describe("appleErrorMessage", () => {
  it("tells the user what to do for each reason", () => {
    expect(appleErrorMessage("appleIntelligenceNotEnabled")).toBe(
      "Turn on Apple Intelligence in System Settings, then try again.",
    );
    expect(appleErrorMessage("modelNotReady")).toBe(
      "Apple Intelligence is still downloading. Try again when it's ready.",
    );
    expect(appleErrorMessage("contextSizeExceeded")).toBe(
      "This chat is too long for Apple Intelligence. Start a new chat or choose another model.",
    );
  });
});

describe("appleStatus", () => {
  it("reports unavailable off macOS without spawning", async () => {
    const run = vi.fn();
    expect(await appleStatus({ platform: "linux", run })).toEqual({
      ok: false,
      error: "Apple Intelligence is only on Mac.",
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns the context size when ready", async () => {
    const calls: Array<[AppleRequest, AbortSignal | undefined]> = [];
    const run = async (request: AppleRequest, signal?: AbortSignal) => {
      calls.push([request, signal]);
      return { ok: true as const, contextSize: 4096 };
    };
    expect(await appleStatus({ platform: "darwin", run })).toEqual({
      ok: true,
      contextSize: 4096,
    });
    expect(calls).toEqual([[{ command: "status" }, undefined]]);
  });
});
