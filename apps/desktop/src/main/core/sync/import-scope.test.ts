import { describe, expect, it } from "vitest";
import {
  collectionCheckDue,
  importScopePatch,
  isImportPending,
  listHarvestPlan,
  subscriptionCheck,
} from "./import-scope";

const BOARD = { id: "915", name: "Design References" };

describe("listHarvestPlan", () => {
  it("walks every list when the scope is omitted", () => {
    expect(listHarvestPlan("instagram", undefined)).toEqual({
      primary: true,
      liked: true,
      subscriptions: false,
      listKinds: [],
      collections: null,
      fileEveryCollection: false,
    });
    expect(listHarvestPlan("pinterest", undefined)).toEqual({
      primary: true,
      liked: false,
      subscriptions: false,
      listKinds: [],
      collections: null,
      fileEveryCollection: false,
    });
    expect(listHarvestPlan("cosmos", undefined)).toEqual({
      primary: true,
      liked: false,
      subscriptions: false,
      listKinds: [],
      collections: null,
      fileEveryCollection: false,
    });
  });

  it("skips the saved list when you import only Likes", () => {
    expect(listHarvestPlan("instagram", { listKinds: ["liked"] })).toEqual({
      primary: false,
      liked: true,
      subscriptions: false,
      listKinds: [],
      collections: null,
      fileEveryCollection: false,
    });
  });

  it("skips Likes when you import only saved items", () => {
    expect(listHarvestPlan("twitter", { listKinds: ["saved"] })).toMatchObject({
      primary: true,
      liked: false,
    });
  });

  it("walks chosen collections instead of the whole saved list", () => {
    expect(listHarvestPlan("pinterest", { collections: [BOARD] })).toEqual({
      primary: false,
      liked: false,
      subscriptions: false,
      listKinds: [],
      collections: [BOARD],
      fileEveryCollection: false,
    });
    expect(listHarvestPlan("youtube", { collections: [BOARD] })).toMatchObject({
      primary: false,
      liked: true,
      collections: [BOARD],
    });
    expect(listHarvestPlan("cosmos", { collections: [BOARD] })).toEqual({
      primary: false,
      liked: false,
      subscriptions: false,
      listKinds: [],
      collections: [BOARD],
      fileEveryCollection: false,
    });
  });

  it("ignores collections when the saved list is left out", () => {
    expect(
      listHarvestPlan("instagram", {
        listKinds: ["liked"],
        collections: [BOARD],
      }),
    ).toMatchObject({ primary: false, liked: true, collections: null });
  });

  it("walks every collection after the list when you file them all", () => {
    expect(listHarvestPlan("twitter", { addToFolders: true })).toMatchObject({
      primary: true,
      collections: null,
      fileEveryCollection: true,
    });
    expect(
      listHarvestPlan("youtube", { addToFolders: true }).fileEveryCollection,
    ).toBe(false);
    expect(
      listHarvestPlan("instagram", {
        listKinds: ["liked"],
        addToFolders: true,
      }).fileEveryCollection,
    ).toBe(false);
    expect(listHarvestPlan("cosmos", { addToFolders: true })).toMatchObject({
      primary: true,
      collections: null,
      fileEveryCollection: true,
    });
  });

  it("treats an empty board list as everything rather than nothing", () => {
    expect(listHarvestPlan("pinterest", { collections: [] }).primary).toBe(
      true,
    );
  });

  it("passes the chosen lists to a combined walk", () => {
    expect(listHarvestPlan("tiktok", { listKinds: ["liked"] })).toEqual({
      primary: true,
      liked: false,
      subscriptions: false,
      listKinds: ["liked"],
      collections: null,
      fileEveryCollection: false,
    });
    expect(listHarvestPlan("reddit", undefined).listKinds).toEqual([
      "saved",
      "liked",
    ]);
  });

  it("reads Substack subscriptions as their own pass", () => {
    expect(listHarvestPlan("substack", undefined)).toMatchObject({
      primary: true,
      subscriptions: true,
      listKinds: ["saved", "liked"],
    });
    expect(
      listHarvestPlan("substack", { listKinds: ["subscription"] }),
    ).toMatchObject({ primary: false, subscriptions: true, listKinds: [] });
    expect(
      listHarvestPlan("substack", { listKinds: ["saved"] }).subscriptions,
    ).toBe(false);
    expect(listHarvestPlan("reddit", undefined).subscriptions).toBe(false);
  });

  it("swaps the saved tab for picked TikTok collections", () => {
    const collections = [{ id: "7", name: "Recipes" }];
    expect(listHarvestPlan("tiktok", { collections })).toEqual({
      primary: true,
      liked: false,
      subscriptions: false,
      listKinds: ["liked"],
      collections,
      fileEveryCollection: false,
    });
    expect(
      listHarvestPlan("tiktok", { listKinds: ["saved"], collections }),
    ).toMatchObject({ primary: false, listKinds: [], collections });
  });

  it("files every TikTok collection when Add to Folders is on", () => {
    expect(listHarvestPlan("tiktok", { addToFolders: true })).toMatchObject({
      primary: true,
      listKinds: ["saved", "liked"],
      fileEveryCollection: true,
    });
  });
});

describe("isImportPending", () => {
  it("only waits for Accounts marked pending", () => {
    expect(isImportPending({ importPending: true })).toBe(true);
    expect(isImportPending({ importPending: false })).toBe(false);
    expect(isImportPending({})).toBe(false);
  });
});

describe("importScopePatch", () => {
  it("confirms a pending Account and stores the omitted form for everything", () => {
    expect(importScopePatch("pinterest", {}, {})).toEqual({
      importScope: undefined,
      importPending: false,
    });
  });

  it("resets the full-walk watermark when the selection changes", () => {
    expect(importScopePatch("pinterest", {}, { collections: [BOARD] })).toEqual(
      {
        importScope: { collections: [BOARD] },
        importPending: false,
        lastFullSyncAt: null,
        resumeCursor: null,
      },
    );
  });

  it("walks again in full when Add to Folders turns back on", () => {
    expect(
      importScopePatch(
        "pinterest",
        { importScope: { collections: [BOARD], addToFolders: false } },
        { collections: [BOARD] },
      ),
    ).toMatchObject({ lastFullSyncAt: null, resumeCursor: null });
  });

  it("keeps filing every collection and walks again in full to file older saves", () => {
    expect(importScopePatch("twitter", {}, { addToFolders: true })).toEqual({
      importScope: { addToFolders: true },
      importPending: false,
      lastFullSyncAt: null,
      resumeCursor: null,
    });
  });

  it("keeps the watermark when the same selection is saved again", () => {
    const scope = {
      collections: [BOARD, { id: "88", name: "Type" }],
      listKinds: undefined,
    };
    const reordered = { collections: [{ id: "88", name: "Type" }, BOARD] };
    expect(
      importScopePatch("pinterest", { importScope: scope }, reordered),
    ).toEqual({
      importScope: reordered,
      importPending: false,
    });
  });

  it("treats a new filter or going back to everything as a change", () => {
    expect(
      importScopePatch("reddit", { importScope: { listKinds: ["saved"] } }, {}),
    ).toMatchObject({ importScope: undefined, lastFullSyncAt: null });
    expect(
      importScopePatch("reddit", {}, { since: "2024-01-01" }),
    ).toMatchObject({ lastFullSyncAt: null });
  });

  it("retires the old X Likes switch when a scope is saved", () => {
    expect(
      importScopePatch(
        "twitter",
        { syncLikes: false },
        { listKinds: ["saved"] },
      ),
    ).toEqual({
      importScope: { listKinds: ["saved"] },
      importPending: false,
      syncLikes: undefined,
    });
  });
});

describe("collectionCheckDue", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const picked = { collections: [BOARD], fileEveryCollection: false };
  const every = { collections: null, fileEveryCollection: true };
  const hoursAgo = (hours: number) => ({
    lastCollectionCheckAt: new Date(now - hours * 3_600_000).toISOString(),
  });

  it("never reads to the end without collection walks", () => {
    expect(
      collectionCheckDue(
        { collections: null, fileEveryCollection: false },
        {},
        true,
        now,
      ),
    ).toBe(false);
  });

  it("reads to the end on a full run and on the first incremental run", () => {
    expect(collectionCheckDue(picked, hoursAgo(1), true, now)).toBe(true);
    expect(collectionCheckDue(every, {}, false, now)).toBe(true);
  });

  it("reads to the end once a day", () => {
    expect(collectionCheckDue(picked, hoursAgo(6), false, now)).toBe(false);
    expect(collectionCheckDue(every, hoursAgo(23), false, now)).toBe(false);
    expect(collectionCheckDue(every, hoursAgo(24), false, now)).toBe(true);
  });
});

describe("subscriptionCheck", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();

  it("reaches back a week the first time", () => {
    expect(subscriptionCheck({}, now)).toEqual({
      due: true,
      since: iso(now - 7 * 24 * 3_600_000),
    });
  });

  it("reads new posts since the last check, a few times a day", () => {
    const last = iso(now - 5 * 3_600_000);
    expect(subscriptionCheck({ lastSubscriptionCheckAt: last }, now)).toEqual({
      due: false,
      since: last,
    });
    expect(
      subscriptionCheck(
        { lastSubscriptionCheckAt: iso(now - 6 * 3_600_000) },
        now,
      ).due,
    ).toBe(true);
  });
});
