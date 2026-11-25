import type { FishRun } from "@shared/fish-contracts";
import { describe, expect, it } from "vitest";
import { lastRunText, nextRunText, nextRunValue } from "./runs";

const now = new Date(2026, 10, 16, 12, 0);
const hoursAgo = (hours: number) => now.getTime() - hours * 3_600_000;

function run(patch: Partial<FishRun> = {}): FishRun {
  return {
    chatId: "chat",
    at: hoursAgo(1),
    status: "done",
    changes: 0,
    seen: false,
    ...patch,
  };
}

function time(at: number) {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

describe("next and last run copy", () => {
  it("reads the next run as a moment, or soon once it's due", () => {
    const later = now.getTime() + 3 * 3_600_000;
    expect(nextRunText(later, now)).toBe(`Next today at ${time(later)}`);
    expect(nextRunValue(later, now)).toBe(`Today at ${time(later)}`);
    expect(nextRunText(hoursAgo(1), now)).toBe("Next run soon");
    expect(nextRunText(null, now)).toBeNull();
  });

  it("reads the last run with its outcome", () => {
    const at = hoursAgo(24);
    expect(lastRunText(run({ at, changes: 1 }), now)).toBe(
      `Ran yesterday at ${time(at)}, 1 change`,
    );
    expect(lastRunText(run({ at, status: "failed" }), now)).toBe(
      `Failed yesterday at ${time(at)}`,
    );
  });
});
