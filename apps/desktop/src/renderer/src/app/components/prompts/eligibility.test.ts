import { describe, expect, it } from "vitest";
import {
  type PromptChoice,
  type PromptSignals,
  pickPrompt,
  promptsSettledBy,
} from "./eligibility";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 11, 1);

function signals(overrides: Partial<PromptSignals> = {}): PromptSignals {
  return {
    now: NOW,
    saves: 0,
    firstSeenAt: NOW,
    updated: false,
    importedFrom: null,
    xSynced: false,
    hasAccounts: true,
    extensionSeen: true,
    mcp: [],
    ...overrides,
  };
}

const none = () => false;

describe("pickPrompt", () => {
  it("asks nothing on a fresh install", () => {
    expect(pickPrompt(signals(), none)).toBeNull();
  });

  it("celebrates the highest milestone after a week of use", () => {
    const week = { firstSeenAt: NOW - 7 * DAY };
    expect(pickPrompt(signals({ ...week, saves: 12_000 }), none)).toBe(
      "milestone-10000",
    );
    expect(pickPrompt(signals({ ...week, saves: 1_200 }), none)).toBe(
      "milestone-1000",
    );
    expect(pickPrompt(signals({ saves: 12_000 }), none)).toBeNull();
  });

  it("skips prompts already shown and falls through to the next", () => {
    const asked = (id: PromptChoice) => id === "friend";
    expect(
      pickPrompt(
        signals({ importedFrom: "eagle", updated: true, xSynced: true }),
        asked,
      ),
    ).toBe("github");
  });

  it("offers the extension only to people with no Sources and no extension", () => {
    const later = { firstSeenAt: NOW - 3 * DAY };
    expect(
      pickPrompt(
        signals({ ...later, hasAccounts: false, extensionSeen: false }),
        none,
      ),
    ).toBe("extension");
    expect(
      pickPrompt(
        signals({ ...later, hasAccounts: false, extensionSeen: true }),
        none,
      ),
    ).toBeNull();
  });

  it("offers MCP setup only for installed clients without Pond", () => {
    const later = { firstSeenAt: NOW - 3 * DAY };
    expect(
      pickPrompt(
        signals({
          ...later,
          mcp: [
            { id: "cursor", installed: true, connected: true },
            { id: "claude-desktop", installed: true, connected: false },
          ],
        }),
        none,
      ),
    ).toBe("mcp-claude");
  });

  it("asks for feedback after two weeks", () => {
    expect(
      pickPrompt(signals({ firstSeenAt: NOW - 14 * DAY }), none),
    ).toBe("feedback");
  });
});

describe("promptsSettledBy", () => {
  it("retires the smaller milestone with the larger one", () => {
    expect(promptsSettledBy("milestone-10000")).toEqual([
      "milestone-10000",
      "milestone-1000",
    ]);
    expect(promptsSettledBy("x")).toEqual(["x"]);
  });
});
