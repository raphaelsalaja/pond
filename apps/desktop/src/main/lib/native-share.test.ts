import type { SharingItem } from "electron";
import { describe, expect, it, vi } from "vitest";
import { showNativeShareMenu } from "./native-share";

describe("showNativeShareMenu", () => {
  it("opens the macOS share menu for the selected file", () => {
    const popup = vi.fn();
    const shared: Array<SharingItem> = [];
    const createShareMenu = (item: SharingItem) => {
      shared.push(item);
      return { popup };
    };

    showNativeShareMenu(
      "/tmp/pond-share/image.png",
      undefined,
      createShareMenu,
    );

    expect(shared).toEqual([{ filePaths: ["/tmp/pond-share/image.png"] }]);
    expect(popup).toHaveBeenCalledOnce();
    expect(popup.mock.calls[0]?.[0]).toMatchObject({
      callback: expect.any(Function),
    });
  });
});
