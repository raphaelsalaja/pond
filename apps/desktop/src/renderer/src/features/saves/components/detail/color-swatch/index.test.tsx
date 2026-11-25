import { describe, expect, it, vi } from "vitest";
import { menuLabels, menuLabelsWithoutIcons } from "@/shared/test/menu-labels";
import { buildColorSwatchMenu } from ".";

describe("color swatch menu", () => {
  it("checks and applies the primary color command", () => {
    const setPrimary = vi.fn();
    const items = buildColorSwatchMenu("#112233", true, setPrimary, vi.fn());
    expect(menuLabelsWithoutIcons(items)).toEqual([]);
    expect(menuLabels(items)).toContain("Set Primary Color");
    const primary = items.find(
      (item) => "label" in item && item.label === "Set Primary Color",
    );
    expect(primary).toMatchObject({ type: "checkbox", checked: true });
    if (primary?.type !== "checkbox") throw new Error("Missing primary color");
    primary.onCheckedChange?.(false);
    expect(setPrimary).toHaveBeenCalledWith(false);
  });
});
