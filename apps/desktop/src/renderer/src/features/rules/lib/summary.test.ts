import type { Clause } from "@pond/schema/filters/types";
import type { RuleInput } from "@shared/rule-contracts";
import { describe, expect, it } from "vitest";
import { joinList, summarizeRule } from "./summary";
import type { RuleNames } from "./summary";

const names: RuleNames = {
  folder: (id) => (id === "research" ? "Research" : null),
  owner: (id) => (id === "gh" ? "GitHub octocat" : null),
  predicate: (clause: Clause) =>
    "field" in clause ? `${clause.field} is ${String(clause.value)}` : "group",
};

const base: RuleInput = {
  name: "PDFs",
  enabled: true,
  trigger: {
    kind: "newSave",
    channels: ["captures", "imports"],
    ownerId: null,
  },
  conditions: {
    combinator: "and",
    rules: [{ field: "format", operator: "some", value: "pdf" }],
  },
  actions: [
    { kind: "addToFolder", folderId: "research" },
    { kind: "addTags", tags: ["Reading"] },
  ],
};

describe("summarizeRule", () => {
  it("reads as one sentence", () => {
    expect(summarizeRule(base, names)).toBe(
      "When a new Save arrives through Captures or Imports, if format is pdf, add it to Research and tag it Reading.",
    );
  });

  it("names every capture path as any, and the owner", () => {
    expect(
      summarizeRule(
        {
          ...base,
          trigger: {
            kind: "newSave",
            channels: ["captures", "sync", "watches", "imports"],
            ownerId: "gh",
          },
          conditions: { combinator: "and", rules: [] },
        },
        names,
      ),
    ).toBe(
      "When a new Save arrives through any capture path from GitHub octocat, add it to Research and tag it Reading.",
    );
  });

  it("describes a folder trigger and a deleted folder", () => {
    expect(
      summarizeRule(
        {
          ...base,
          trigger: {
            kind: "addedToFolder",
            folderId: "gone",
            includeSubfolders: true,
          },
          conditions: { combinator: "or", rules: [] },
          actions: [{ kind: "favorite" }, { kind: "rating", rating: 1 }],
        },
        names,
      ),
    ).toBe(
      "When a Save is added to a deleted folder or a folder inside it, favorite it and rate it 1 star if it has no rating.",
    );
  });
});

describe("joinList", () => {
  it("uses a serial comma for three or more", () => {
    expect(joinList(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinList(["a", "b"], "or")).toBe("a or b");
  });
});
