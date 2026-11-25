import { describe, expect, it, vi } from "vitest";
import { menuLabels } from "@/shared/test/menu-labels";
import { buildTagSortItems } from "./sort-menu";

describe("tag sort menu", () => {
  it("checks and applies the selected order", () => {
    const onChange = vi.fn();
    const items = buildTagSortItems({
      sort: "count",
      direction: "desc",
      onChange,
    });
    expect(menuLabels(items)).toEqual([
      "Name: A to Z",
      "Name: Z to A",
      "Most Used",
      "Least Used",
      "Recently Used",
    ]);
    expect(items[2]).toMatchObject({ checked: true });
    const least = items[3];
    if (least?.type !== "checkbox") throw new Error("Missing tag order");
    least.onCheckedChange?.(true);
    expect(onChange).toHaveBeenCalledWith("count", "asc");
  });
});
