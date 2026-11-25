import { describe, expect, it, vi } from "vitest";
import { buildZoomRatioItems, ZOOM_RATIOS } from "./zoom-pill";

describe("zoom ratio menu", () => {
  it("checks the active ratio and applies another ratio", () => {
    const onRatio = vi.fn();
    const items = buildZoomRatioItems(1, onRatio);
    expect(items).toHaveLength(ZOOM_RATIOS.length);
    expect(
      items.find((item) => "label" in item && item.label === "100%"),
    ).toMatchObject({
      checked: true,
    });
    const ratio = items.find(
      (item) => "label" in item && item.label === "200%",
    );
    if (ratio?.type !== "checkbox") throw new Error("Missing zoom ratio");
    ratio.onCheckedChange?.(true);
    expect(onRatio).toHaveBeenCalledWith(2);
  });
});
