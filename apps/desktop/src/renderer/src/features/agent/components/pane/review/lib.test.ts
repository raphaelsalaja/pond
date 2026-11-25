import type { AssistantChange } from "@shared/assistant";
import { describe, expect, it } from "vitest";
import {
  changeSummary,
  chipDiff,
  groupChanges,
  proposalClauses,
  proposalList,
  reviewOutcome,
  reviewQuestion,
  reviewSummary,
  reviewTitle,
  shortTitle,
  summaryParts,
} from "./lib";
import type { ProposalClause } from "./lib";

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

describe("groupChanges", () => {
  const tag = (
    id: string,
    after: Array<string>,
    before: Array<string> = [],
  ) => ({
    ...change("pending"),
    id,
    saveId: id,
    before,
    after,
  });

  it("puts changes with the same effect in one group, in proposal order", () => {
    const groups = groupChanges([
      tag("a", ["Clock"]),
      tag("b", ["Wood"]),
      tag("c", ["Clock"]),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "tags:+Clock",
      "tags:+Wood",
    ]);
    expect(groups[0]?.changes.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("keeps a combined edit apart from its single parts", () => {
    const groups = groupChanges([
      tag("a", ["Clock"]),
      tag("b", ["Clock"], ["Old"]),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "tags:+Clock",
      "tags:+Clock −Old",
    ]);
  });

  it("groups renames together although each name differs", () => {
    const rename = (id: string, after: string): AssistantChange => ({
      id,
      saveId: id,
      title: id,
      reason: "",
      status: "pending",
      field: "title",
      before: id,
      after,
    });
    const [group] = groupChanges([rename("a", "One"), rename("b", "Two")]);
    expect(group?.parts).toEqual([{ text: "Rename", tone: "neutral" }]);
    expect(group?.changes).toHaveLength(2);
  });
});

describe("proposalClauses", () => {
  const words = (clause: ProposalClause) =>
    clause
      .map((segment) =>
        segment.kind === "saves"
          ? `[${segment.changes.map((item) => item.saveId).join(",")}]`
          : segment.kind === "places"
            ? segment.items.map((item) => item.name).join(" and ")
            : segment.text,
      )
      .join("");
  const tags = (
    id: string,
    after: Array<string>,
    before: Array<string> = [],
  ) => ({
    ...change("pending"),
    id,
    saveId: id,
    before,
    after,
  });

  it("says each distinct change once, with every Save it touches", () => {
    expect(
      proposalClauses([
        tags("a", ["Clock"]),
        tags("b", ["Clock"]),
        tags("c", [], ["Old"]),
      ]).map(words),
    ).toEqual(["tag [a,b] with Clock", "remove Old from [c]"]);
  });

  it("names folders and keeps one rename per Save", () => {
    const folders: AssistantChange = {
      ...change("pending"),
      id: "f",
      saveId: "f",
      field: "folders",
      before: ["1"],
      after: ["2"],
    };
    const rename = (id: string, after: string): AssistantChange => ({
      ...change("pending"),
      id,
      saveId: id,
      field: "title",
      before: id,
      after,
    });
    expect(
      proposalClauses([folders, rename("r", "One"), rename("s", "Two")], (id) =>
        id === "1" ? "Inbox" : "Cabin",
      ).map(words),
    ).toEqual([
      "move [f] from Inbox to Cabin",
      "rename [r] to One",
      "rename [s] to Two",
    ]);
  });
});

describe("shortTitle", () => {
  it("keeps short titles and cuts long ones at a word", () => {
    expect(shortTitle("Recipes that taste like Thanksgiving")).toBe(
      "Recipes that taste like Thanksgiving",
    );
    expect(
      shortTitle(
        "Workout Tips and Tricks Easy In GTA 6 how to increase health #gaming",
      ),
    ).toBe("Workout Tips and Tricks Easy In GTA 6…");
  });
});

describe("proposalList", () => {
  const tagClause = (id: string): ProposalClause => [
    { kind: "text", text: "tag " },
    { kind: "saves", changes: [{ ...change("pending"), id }] },
  ];

  it("says a shared verb once in the lead", () => {
    const { lead, items } = proposalList([tagClause("a"), tagClause("b")]);
    expect(lead).toBe("Here's how I'll tag them:");
    expect(items.every((item) => item[0]?.kind === "saves")).toBe(true);
  });

  it("keeps every verb when they differ", () => {
    const { lead, items } = proposalList([
      tagClause("a"),
      [{ kind: "text", text: "move " }],
    ]);
    expect(lead).toBe("Here's what I'll change:");
    expect(items[1]?.[0]).toEqual({ kind: "text", text: "move " });
  });
});
