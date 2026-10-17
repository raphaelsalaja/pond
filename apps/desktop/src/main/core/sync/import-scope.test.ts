import { describe, expect, it } from "vitest";
import {
  importScopePatch,
  isImportPending,
  listHarvestPlan,
} from "./import-scope";

const BOARD = { id: "915", name: "Design References" };

describe("listHarvestPlan", () => {
  it("walks every list when the scope is omitted", () => {
    expect(listHarvestPlan("instagram", undefined)).toEqual({
      primary: true,
      liked: true,
      listKinds: [],
      collections: null,
    });
    expect(listHarvestPlan("pinterest", undefined)).toEqual({
      primary: true,
      liked: false,
      listKinds: [],
      collections: null,
    });
  });

  it("skips the saved list when you import only Likes", () => {
    expect(listHarvestPlan("instagram", { listKinds: ["liked"] })).toEqual({
      primary: false,
      liked: true,
      listKinds: [],
      collections: null,
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
      listKinds: [],
      collections: [BOARD],
    });
    expect(listHarvestPlan("youtube", { collections: [BOARD] })).toMatchObject({
      primary: false,
      liked: true,
      collections: [BOARD],
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

  it("treats an empty board list as everything rather than nothing", () => {
    expect(listHarvestPlan("pinterest", { collections: [] }).primary).toBe(
      true,
    );
  });

  it("passes the chosen lists to a combined walk", () => {
    expect(listHarvestPlan("tiktok", { listKinds: ["liked"] })).toEqual({
      primary: true,
      liked: false,
      listKinds: ["liked"],
      collections: null,
    });
    expect(listHarvestPlan("reddit", undefined).listKinds).toEqual([
      "saved",
      "liked",
    ]);
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
