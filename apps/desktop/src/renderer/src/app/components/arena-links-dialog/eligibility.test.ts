import { describe, expect, it } from "vitest";
import { ARENA_LINKS_NOTICE, arenaLinksNoticeStep } from "./eligibility";

describe("arenaLinksNoticeStep", () => {
  it("shows the notice when Link saves are waiting to convert", () => {
    expect(arenaLinksNoticeStep({ seen: [], pending: 3 })).toBe("show");
  });

  it("records the notice without showing it when nothing needs converting", () => {
    expect(arenaLinksNoticeStep({ seen: [], pending: 0 })).toBe("mark-seen");
  });

  it("never shows again once seen, whatever is still waiting", () => {
    expect(
      arenaLinksNoticeStep({ seen: [ARENA_LINKS_NOTICE], pending: 3 }),
    ).toBe("skip");
    expect(
      arenaLinksNoticeStep({ seen: ["other", ARENA_LINKS_NOTICE], pending: 0 }),
    ).toBe("skip");
  });
});
