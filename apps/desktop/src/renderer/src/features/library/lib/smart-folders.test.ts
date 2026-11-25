import type { SavedView } from "@pond/schema/db";
import { matches } from "@pond/schema/filters/match";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import { describe, expect, it } from "vitest";
import {
  combineQueries,
  groupMoveChoices,
  inheritedQueryFor,
  selectedViewRoots,
} from "./smart-folders";

function view(
  id: string,
  parentId: string | null,
  kind: SavedView["kind"] = "group",
): SavedView {
  return {
    id,
    parentId,
    kind,
    name: id,
    query: EMPTY_QUERY,
    question: null,
    sortKey: "savedAt",
    sortDir: "desc",
    layout: null,
    sortOrder: 0,
    createdAt: new Date(0),
  };
}

describe("group ancestry", () => {
  it("offers only groups outside the moved item's descendants", () => {
    const views = [
      view("parent", null),
      view("child", "parent"),
      view("grandchild", "child"),
      view("other", null),
      view("folder", null, "smart_folder"),
      view("saved", null, "saved_view"),
    ];
    expect(groupMoveChoices("parent", views).map((entry) => entry.id)).toEqual([
      "other",
    ]);
    expect(groupMoveChoices("child", views).map((entry) => entry.id)).toEqual([
      "parent",
      "other",
    ]);
  });

  it("stops safely at missing parents and malformed cycles", () => {
    const orphan = view("orphan", "missing");
    expect(inheritedQueryFor(orphan, [orphan])).toEqual(EMPTY_QUERY);
    const parent = view("parent", "child");
    const child = view("child", "parent");
    expect(groupMoveChoices("parent", [parent, child])).toEqual([]);
    expect(inheritedQueryFor(child, [parent, child])).toEqual(EMPTY_QUERY);
  });
});

describe("combining shared and local conditions", () => {
  const branding: Query = {
    combinator: "and",
    rules: [{ field: "tags", operator: "some", value: ["branding"] }],
  };
  const instagram: Query = {
    combinator: "and",
    rules: [{ field: "source", operator: "eq", value: "instagram.com" }],
  };

  it("flattens nested AND groups into editable top-level predicates", () => {
    const nested: Query = {
      combinator: "and",
      rules: [{ combinator: "and", rules: branding.rules }],
    };
    const combined = combineQueries([nested, instagram]);
    expect(combined.rules).toEqual([...branding.rules, ...instagram.rules]);
    expect(
      matches(combined, {
        id: "save",
        source: "instagram",
        url: "https://instagram.com/p/1",
        tags: ["branding"],
      }),
    ).toBe(true);
    expect(
      matches(combined, {
        id: "save",
        source: "instagram",
        url: "https://instagram.com/p/1",
        tags: [],
      }),
    ).toBe(false);
  });

  it("retains negated groups and OR alternatives inside the conjunction", () => {
    const excluded: Query = { ...branding, not: true };
    const alternatives: Query = {
      combinator: "or",
      rules: [
        ...instagram.rules,
        { field: "source", operator: "eq", value: "x.com" },
      ],
    };
    const combined = combineQueries([excluded, alternatives]);
    expect(combined.rules).toEqual([excluded, alternatives]);
    const save = {
      id: "save",
      source: "instagram",
      url: "https://instagram.com/p/1",
      tags: [],
    };
    expect(matches(combined, save)).toBe(true);
    expect(matches(combined, { ...save, tags: ["branding"] })).toBe(false);
    expect(
      matches(combined, {
        ...save,
        source: "twitter",
        url: "https://x.com/a/status/1",
      }),
    ).toBe(true);
    expect(
      matches(combined, {
        ...save,
        source: "pinterest",
        url: "https://pinterest.com/pin/1",
      }),
    ).toBe(false);
  });
});

it("moves selected Groups with their selected descendants intact", () => {
  const views = [
    view("parent", null),
    view("child", "parent", "smart_folder"),
    view("other", null, "saved_view"),
  ];
  expect(
    selectedViewRoots(["parent", "child", "other"], views).map(
      (view) => view.id,
    ),
  ).toEqual(["parent", "other"]);
});
