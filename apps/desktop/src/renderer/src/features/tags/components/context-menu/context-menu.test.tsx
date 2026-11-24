import { describe, expect, it, vi } from "vitest";
import {
  menuLabels as labels,
  menuLabelsWithoutIcons,
} from "@/shared/test/menu-labels";
import { buildTagMenuItems } from ".";
import type { TagMenuActions } from ".";

function actions(overrides: Partial<TagMenuActions> = {}): TagMenuActions {
  return {
    groups: ["Design", "Reference"],
    mergeTargets: ["Inspiration", "Motion"],
    inGroup: "Design",
    starred: false,
    onFilter: vi.fn(),
    onSetStarred: vi.fn(),
    onAddToGroup: vi.fn(),
    onMoveToGroup: vi.fn(),
    onRemoveFromGroup: vi.fn(),
    onMerge: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}

describe("tag context menu", () => {
  it("gives every searchable action an icon", () => {
    expect(menuLabelsWithoutIcons(buildTagMenuItems(actions()))).toEqual([]);
  });

  it("matches the Eagle tag operations with merge targets", () => {
    const menuLabels = labels(buildTagMenuItems(actions()));

    expect(menuLabels).toEqual([
      "Filter Items with the Tag(s)",
      "Add to Starred",
      "Remove from Starred",
      "Rename Tag",
      "Merge Into",
      "Inspiration",
      "Motion",
      "Add to Group",
      "Reference",
      "Move to Group",
      "Reference",
      "Remove from this Group",
      "Remove Tag",
    ]);
    expect(menuLabels).not.toContain("Convert to Group");
    expect(
      buildTagMenuItems(actions()).find(
        (item) => "label" in item && item.label === "Remove Tag",
      ),
    ).toMatchObject({ variant: "destructive" });
  });

  it("shows both starred actions and disables the inapplicable one", () => {
    const unstarred = buildTagMenuItems(actions());
    const starred = buildTagMenuItems(actions({ starred: true }));

    expect(unstarred[2]).toMatchObject({
      label: "Add to Starred",
      disabled: false,
    });
    expect(unstarred[3]).toMatchObject({
      label: "Remove from Starred",
      disabled: true,
    });
    expect(starred[2]).toMatchObject({ disabled: true });
    expect(starred[3]).toMatchObject({ disabled: false });
  });

  it("disables move and removal when the tag is not in a group", () => {
    const items = buildTagMenuItems(actions({ inGroup: null }));

    expect(
      items.find((item) => "label" in item && item.label === "Move to Group"),
    ).toMatchObject({ disabled: true });
    expect(
      items.find(
        (item) => "label" in item && item.label === "Remove from this Group",
      ),
    ).toMatchObject({
      label: "Remove from this Group",
      disabled: true,
    });
  });

  it("runs the selected merge command", () => {
    const onMerge = vi.fn();
    const merge = buildTagMenuItems(actions({ onMerge })).find(
      (item) => item.type === "submenu" && item.label === "Merge Into",
    );
    if (merge?.type !== "submenu") {
      throw new Error("Missing merge menu");
    }
    const target = merge.items[0];
    if (!target || target.type === "separator" || target.type === "submenu") {
      throw new Error("Missing merge target");
    }
    if ("onClick" in target) {
      target.onClick?.();
    }
    expect(onMerge).toHaveBeenCalledWith("Inspiration");
  });
});
