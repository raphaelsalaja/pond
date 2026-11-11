import { describe, expect, it } from "vitest";
import { keyboardSiblingReorderKind, planSmartFolderReorder } from "./reorder";

const rows = [
  { id: "alpha", parentId: null },
  { id: "beta", parentId: null },
  { id: "group", parentId: null },
  { id: "child", parentId: "group" },
  { id: "sibling", parentId: "group" },
];

describe("smart folder reorder planning", () => {
  it("reorders a smart folder before or after a sibling", () => {
    expect(planSmartFolderReorder("beta", "alpha", "before", rows)).toEqual([
      "beta",
      "alpha",
      "group",
    ]);
    expect(planSmartFolderReorder("alpha", "group", "after", rows)).toEqual([
      "beta",
      "group",
      "alpha",
    ]);
    expect(planSmartFolderReorder("sibling", "child", "before", rows)).toEqual([
      "sibling",
      "child",
    ]);
  });

  it("skips a no-op and refuses nesting or a different parent", () => {
    expect(planSmartFolderReorder("alpha", "beta", "before", rows)).toBeNull();
    expect(planSmartFolderReorder("alpha", "group", "into", rows)).toBeNull();
    expect(planSmartFolderReorder("child", "alpha", "before", rows)).toBeNull();
    expect(planSmartFolderReorder("alpha", "child", "after", rows)).toBeNull();
  });

  it("moves the keyboard target among siblings only", () => {
    expect(keyboardSiblingReorderKind("alpha", "beta", rows)).toBe("after");
    expect(keyboardSiblingReorderKind("sibling", "child", rows)).toBe("before");
    expect(keyboardSiblingReorderKind("child", "alpha", rows)).toBeNull();
  });
});
