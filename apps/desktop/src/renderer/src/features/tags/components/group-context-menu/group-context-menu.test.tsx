import { describe, expect, it, vi } from "vitest";
import { topLevelMenuLabels as labels } from "@/shared/test/menu-labels";
import { buildTagGroupMenuItems } from ".";
import type { TagGroupMenuActions } from ".";

function actions(
  overrides: Partial<TagGroupMenuActions> = {},
): TagGroupMenuActions {
  return {
    color: null,
    tagCount: 2,
    onFilter: vi.fn(),
    onRename: vi.fn(),
    onChangeColor: vi.fn(),
    mergeTargets: ["Places"],
    onMerge: vi.fn(),
    onRequestDelete: vi.fn(),
    ...overrides,
  };
}

describe("tag group context menu", () => {
  it("filters first, then rename, then remove last", () => {
    const items = buildTagGroupMenuItems(actions());
    expect(labels(items)).toEqual([
      "Filter Items with the Tag(s)",
      "Rename",
      "Merge Into",
      "Remove",
    ]);
    expect(items.at(-1)).toMatchObject({ variant: "destructive" });
  });

  it("merges the group into the chosen target", () => {
    const onMerge = vi.fn();
    const items = buildTagGroupMenuItems(actions({ onMerge }));
    const merge = items.find(
      (item) => item.type === "submenu" && item.label === "Merge Into",
    );
    if (merge?.type !== "submenu") {
      throw new Error("Missing Merge Into");
    }
    const target = merge.items[0];
    if (!target || !("onClick" in target)) {
      throw new Error("Missing merge target");
    }
    target.onClick?.();
    expect(onMerge).toHaveBeenCalledWith("Places");
  });

  it("disables filter when the group has no tags", () => {
    const items = buildTagGroupMenuItems(actions({ tagCount: 0 }));
    expect(items[0]).toMatchObject({
      label: "Filter Items with the Tag(s)",
      disabled: true,
    });
  });
});
