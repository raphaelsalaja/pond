import { describe, expect, it, vi } from "vitest";
import { menuLabels } from "@/shared/test/menu-labels";
import { buildGifMenuItems } from "./gif-menu";

describe("GIF context menu", () => {
  it("keeps the dedicated menu slim and executable", () => {
    const onSetThumbnail = vi.fn();
    const items = buildGifMenuItems({
      hasLoop: false,
      onResetLoop: vi.fn(),
      onSetThumbnail,
    });
    expect(menuLabels(items)).toEqual([
      "Set Current Frame as Thumbnail",
      "Reset Loop Range",
    ]);
    expect(items[1]).toMatchObject({ disabled: true });
    const thumbnail = items[0];
    if (!thumbnail || thumbnail.type !== undefined) {
      throw new Error("Missing thumbnail command");
    }
    thumbnail.onClick?.();
    expect(onSetThumbnail).toHaveBeenCalledOnce();
  });
});
