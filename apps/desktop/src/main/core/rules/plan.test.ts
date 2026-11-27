import type { Rule } from "@shared/rule-contracts";
import { describe, expect, it } from "vitest";
import { planActions, planBatch } from "./plan";
import type { RuleTarget } from "./plan";

const target: RuleTarget = {
  id: "s1",
  tags: ["Reading"],
  folderIds: ["inbox"],
  favorite: false,
  rating: null,
  inboxState: "review",
  inboxUntil: null,
  deleted: false,
};

const exists = (id: string) => id !== "gone";

function rule(id: string, createdAt: number, actions: Rule["actions"]): Rule {
  return {
    id,
    name: id,
    enabled: true,
    trigger: { kind: "newSave", channels: ["captures"], ownerId: null },
    conditions: { combinator: "and", rules: [] },
    actions,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("planActions", () => {
  it("only adds what the Save is missing", () => {
    const plan = planActions(
      [
        { kind: "addToFolder", folderId: "inbox" },
        { kind: "addToFolder", folderId: "research" },
        { kind: "addTags", tags: ["reading", "GitHub"] },
      ],
      target,
      exists,
    );
    expect(plan.changes).toEqual([
      { kind: "folder", folderId: "research" },
      { kind: "tag", tag: "GitHub" },
    ]);
    expect(plan.already).toEqual([
      { kind: "folder", folderId: "inbox" },
      { kind: "tag", tag: "reading" },
    ]);
    expect(plan.next.folderIds).toEqual(["inbox", "research"]);
    expect(plan.next.tags).toEqual(["Reading", "GitHub"]);
  });

  it("is idempotent", () => {
    const actions: Rule["actions"] = [
      { kind: "addToFolder", folderId: "research" },
      { kind: "addTags", tags: ["GitHub"] },
      { kind: "favorite" },
      { kind: "rating", rating: 4 },
      { kind: "inbox", state: "processed" },
    ];
    const first = planActions(actions, target, exists);
    const second = planActions(actions, first.next, exists);
    expect(first.changes).toHaveLength(5);
    expect(second.changes).toEqual([]);
  });

  it("never overrides a rating you set", () => {
    const plan = planActions(
      [{ kind: "rating", rating: 2 }],
      { ...target, rating: 5 },
      exists,
    );
    expect(plan.changes).toEqual([]);
    expect(plan.next.rating).toBe(5);
  });

  it("only processes Saves waiting in the Inbox", () => {
    const plan = planActions(
      [{ kind: "inbox", state: "processed" }],
      { ...target, inboxState: null },
      exists,
    );
    expect(plan.changes).toEqual([]);
  });

  it("skips a deleted folder without failing the other actions", () => {
    const plan = planActions(
      [{ kind: "addToFolder", folderId: "gone" }, { kind: "favorite" }],
      target,
      exists,
    );
    expect(plan.skipped).toHaveLength(1);
    expect(plan.changes).toEqual([{ kind: "favorite" }]);
  });
});

describe("planBatch", () => {
  it("runs every matching Rule and credits a shared change to the older one", () => {
    const older = rule("older", 1, [{ kind: "addTags", tags: ["GitHub"] }]);
    const newer = rule("newer", 2, [
      { kind: "addTags", tags: ["GitHub", "Code"] },
    ]);
    const batch = planBatch(
      [newer, older],
      new Map([
        ["older", new Set(["s1"])],
        ["newer", new Set(["s1"])],
      ]),
      new Map([["s1", target]]),
      exists,
    );
    expect(batch.outcomes.map((outcome) => outcome.ruleId)).toEqual([
      "older",
      "newer",
    ]);
    expect(batch.outcomes[0]?.changes).toEqual([
      { kind: "tag", tag: "GitHub" },
    ]);
    expect(batch.outcomes[1]?.changes).toEqual([{ kind: "tag", tag: "Code" }]);
    expect(batch.targets.get("s1")?.after.tags).toEqual([
      "Reading",
      "GitHub",
      "Code",
    ]);
  });

  it("leaves Saves no Rule matched alone", () => {
    const batch = planBatch(
      [rule("a", 1, [{ kind: "favorite" }])],
      new Map([["a", new Set<string>()]]),
      new Map([["s1", target]]),
      exists,
    );
    expect(batch.outcomes).toEqual([]);
    expect(batch.targets.size).toBe(0);
  });
});
