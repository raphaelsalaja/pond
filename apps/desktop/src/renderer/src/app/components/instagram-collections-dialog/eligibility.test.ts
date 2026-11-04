import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_COLLECTIONS_NOTICE,
  instagramAccountsToNotify,
  instagramCollectionsNoticeStep,
} from "./eligibility";

describe("instagramCollectionsNoticeStep", () => {
  it("shows the notice when an Account is waiting for a collection choice", () => {
    expect(
      instagramCollectionsNoticeStep({ seen: [], accountIds: ["ig"] }),
    ).toBe("show");
  });

  it("records the notice without showing it when no Account is affected", () => {
    expect(instagramCollectionsNoticeStep({ seen: [], accountIds: [] })).toBe(
      "mark-seen",
    );
  });

  it("never shows again once seen", () => {
    expect(
      instagramCollectionsNoticeStep({
        seen: ["fish-intro", INSTAGRAM_COLLECTIONS_NOTICE],
        accountIds: ["ig"],
      }),
    ).toBe("skip");
  });
});

describe("instagramAccountsToNotify", () => {
  it("names an Instagram Account still waiting for its import choice", () => {
    expect(
      instagramAccountsToNotify(
        [{ id: "ig", source: "instagram", sync: {} }],
        9,
      ),
    ).toEqual(["ig"]);
  });

  it("names an Instagram Account that imports every saved post", () => {
    expect(
      instagramAccountsToNotify(
        [
          {
            id: "ig",
            source: "instagram",
            sync: { importScope: { mediaKinds: ["image"] } },
          },
        ],
        9,
      ),
    ).toEqual(["ig"]);
  });

  it("skips Accounts that already picked or file every collection", () => {
    expect(
      instagramAccountsToNotify(
        [
          {
            id: "picked",
            source: "instagram",
            sync: {
              importScope: { collections: [{ id: "17", name: "Recipes" }] },
            },
          },
          {
            id: "every",
            source: "instagram",
            sync: { importScope: { addToFolders: true } },
          },
        ],
        9,
      ),
    ).toEqual([]);
  });

  it("skips an Account that leaves its saved posts out", () => {
    expect(
      instagramAccountsToNotify(
        [
          {
            id: "liked-only",
            source: "instagram",
            sync: { importScope: { listKinds: ["liked"] } },
          },
        ],
        9,
      ),
    ).toEqual([]);
  });

  it("skips other Sources", () => {
    expect(
      instagramAccountsToNotify(
        [{ id: "pin", source: "pinterest", sync: {} }],
        9,
      ),
    ).toEqual([]);
  });

  it("stays out of the way of setup in an empty library", () => {
    expect(
      instagramAccountsToNotify(
        [{ id: "ig", source: "instagram", sync: {} }],
        0,
      ),
    ).toEqual([]);
  });
});
