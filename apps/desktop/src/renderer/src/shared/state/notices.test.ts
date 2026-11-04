import { describe, expect, it } from "vitest";
import { carouselsIntroDialog } from "./carousels-intro";
import { anotherDialogOpen, claimNoticeSlot, withNoticeSeen } from "./notices";

describe("first-open notices", () => {
  it("lets one notice claim each launch, so a second waits for the next one", () => {
    expect(claimNoticeSlot("arena-links-web-pages")).toBe(true);
    expect(claimNoticeSlot("arena-links-web-pages")).toBe(true);
    expect(claimNoticeSlot("fish-intro")).toBe(false);
  });

  it("adds a seen notice once and keeps the others", () => {
    expect(withNoticeSeen(["fish-intro"], "arena-links-web-pages")).toEqual([
      "fish-intro",
      "arena-links-web-pages",
    ]);
    expect(
      withNoticeSeen(["arena-links-web-pages"], "arena-links-web-pages"),
    ).toEqual(["arena-links-web-pages"]);
  });

  it("holds other notices while the carousels dialog is open", () => {
    expect(anotherDialogOpen()).toBe(false);
    carouselsIntroDialog.open(3);
    expect(anotherDialogOpen()).toBe(true);
    carouselsIntroDialog.close();
    expect(anotherDialogOpen()).toBe(false);
  });
});
