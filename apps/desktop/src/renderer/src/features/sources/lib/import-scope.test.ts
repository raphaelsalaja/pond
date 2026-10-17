import { describe, expect, it } from "vitest";
import { importScopeSummary, sinceForPreset } from "./import-scope";

describe("sinceForPreset", () => {
  const now = new Date(2026, 9, 17, 15, 30);

  it("counts back whole months from today", () => {
    expect(sinceForPreset("month", now)).toBe("2026-09-17");
    expect(sinceForPreset("quarter", now)).toBe("2026-07-17");
    expect(sinceForPreset("year", now)).toBe("2025-10-17");
  });

  it("leaves the date empty for any time and a custom date", () => {
    expect(sinceForPreset("any", now)).toBe("");
    expect(sinceForPreset("custom", now)).toBe("");
  });
});

describe("importScopeSummary", () => {
  it("names a single chosen collection", () => {
    expect(
      importScopeSummary("twitter", {
        listKinds: ["saved"],
        collections: [{ id: "1", name: "Design" }],
      }),
    ).toBe("Design");
  });
});
