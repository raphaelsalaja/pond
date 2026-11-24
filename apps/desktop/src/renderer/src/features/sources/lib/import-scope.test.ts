import { describe, expect, it } from "vitest";
import { sinceCopy, sinceForPreset } from "./import-scope";
import { listKindDescription, listKindLabel } from "./list-kind-copy";

describe("listKindLabel", () => {
  it("names Vimeo's saved list Watch Later", () => {
    expect(listKindLabel("vimeo", "saved")).toBe("Watch Later");
    expect(listKindLabel("vimeo", "liked")).toBe("Likes");
    expect(listKindDescription("vimeo", "saved")).toBe(
      "Videos you've added to Watch Later on Vimeo.",
    );
  });
});

describe("sinceForPreset", () => {
  const now = new Date(2026, 9, 17, 15, 30);

  it("counts back whole months from today", () => {
    expect(sinceForPreset("month", now)).toBe("2026-09-17");
    expect(sinceForPreset("quarter", now)).toBe("2026-07-17");
    expect(sinceForPreset("year", now)).toBe("2025-10-17");
  });

  it("starts from today for only new items", () => {
    expect(sinceForPreset("today", now)).toBe("2026-10-17");
  });

  it("leaves the date empty for any time and a custom date", () => {
    expect(sinceForPreset("any", now)).toBe("");
    expect(sinceForPreset("custom", now)).toBe("");
  });
});

describe("sinceCopy", () => {
  it("offers From Today where the limit compares the day you saved", () => {
    const copy = sinceCopy("github");
    expect(copy.title).toBe("Saved Since");
    expect(copy.presets.map((p) => p.value)).toContain("today");
  });

  it("explains page-sized save dates only where a page carries them", () => {
    expect(sinceCopy("github").info).toBe(
      "Dates are read a page of 30 at a time, so up to 30 older items can come in.",
    );
    expect(sinceCopy("savee").title).toBe("Saved Since");
    expect(sinceCopy("savee").info).toBeUndefined();
  });

  it("keeps publish-date presets for posts", () => {
    const copy = sinceCopy("twitter");
    expect(copy.title).toBe("Posted Since");
    expect(copy.presets.map((p) => p.value)).not.toContain("today");
  });
});
