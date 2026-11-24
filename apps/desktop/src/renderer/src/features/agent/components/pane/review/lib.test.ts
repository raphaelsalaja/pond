import type { AssistantChange } from "@shared/assistant";
import { describe, expect, it } from "vitest";
import {
  changeSummary,
  chipDiff,
  reviewOutcome,
  reviewQuestion,
  reviewSummary,
  reviewTitle,
  summaryParts,
} from "./lib";

function change(
  status: AssistantChange["status"],
): AssistantChange & { field: "tags" } {
  return {
    id: `${status}-${Math.random()}`,
    saveId: "save",
    title: "Save",
    reason: "",
    status,
    field: "tags",
    before: [],
    after: ["Clock"],
  };
}

describe("chipDiff", () => {
  it("keeps, adds, and removes values in reading order", () => {
    expect(chipDiff(["Design", "Old"], ["Design", "Clock"])).toEqual([
      { value: "Design", tone: "tag" },
      { value: "Clock", tone: "added" },
      { value: "Old", tone: "removed" },
    ]);
  });
});

describe("reviewTitle", () => {
  it("drops links that crowd tweet titles", () => {
    expect(
      reviewTitle(
        "HomeView clock for any screen size! https://t.co/0zh7hNTsQv",
      ),
    ).toBe("HomeView clock for any screen size!");
  });

  it("falls back when only a link remains", () => {
    expect(reviewTitle("https://t.co/abc")).toBe("Untitled");
  });
});

describe("changeSummary", () => {
  it("lists only what a tag change adds or removes", () => {
    expect(
      changeSummary({
        ...change("pending"),
        before: ["Design", "Old"],
        after: ["Design", "AI", "Analytics"],
      }),
    ).toBe("+AI +Analytics −Old");
  });

  it("names folders instead of ids", () => {
    expect(
      changeSummary(
        {
          id: "folders",
          saveId: "save",
          title: "Save",
          reason: "",
          status: "pending",
          field: "folders",
          before: [],
          after: ["f1"],
        },
        () => "Inspiration",
      ),
    ).toBe("+Inspiration");
  });

  it("tones additions and removals for the row summary", () => {
    expect(
      summaryParts({
        ...change("pending"),
        before: ["Old"],
        after: ["AI"],
      }).map((part) => part.tone),
    ).toEqual(["added", "removed"]);
  });
});

describe("reviewQuestion", () => {
  it("asks about what still waits on you", () => {
    expect(reviewQuestion(2)).toBe("Apply 2 changes to your library?");
    expect(reviewQuestion(1)).toBe("Apply 1 change to your library?");
  });
});

describe("reviewSummary", () => {
  it("groups changes by what they do", () => {
    expect(
      reviewSummary([
        change("pending"),
        change("pending"),
        { ...change("pending"), field: "title", before: "A", after: "B" },
      ] satisfies Array<AssistantChange>),
    ).toBe("Retags 2 Saves, renames 1 Save");
  });

  it("names a lone library action in its own words", () => {
    expect(
      reviewSummary([
        {
          id: "op",
          saveId: "",
          title: "Library",
          reason: "",
          status: "pending",
          field: "action",
          action: "runOperation",
          before: "",
          after: "Create folder Design",
        } satisfies AssistantChange,
      ]),
    ).toBe("Create folder Design");
  });
});

describe("reviewOutcome", () => {
  it("names a single outcome with its count", () => {
    expect(reviewOutcome([change("applied"), change("applied")])).toEqual({
      text: "Applied 2 changes",
      tone: "default",
    });
  });

  it("lists mixed outcomes and mutes reviews with nothing applied", () => {
    expect(reviewOutcome([change("applied"), change("dismissed")]).text).toBe(
      "Applied 1, dismissed 1",
    );
    expect(reviewOutcome([change("dismissed")])).toEqual({
      text: "Dismissed 1 change",
      tone: "muted",
    });
  });
});
