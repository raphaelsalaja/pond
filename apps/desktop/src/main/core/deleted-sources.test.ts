import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  deletedSourceKeys,
  knownIdsForFetch,
  remembersDeletedSource,
  trashedBaselineWhere,
} from "./deleted-sources";

describe("knownIdsForFetch", () => {
  const liveIds = new Set(["kept"]);
  const dismissedIds = new Set(["trashed", "purged"]);

  it("keeps deleted source ids out of an automatic fetch", () => {
    const known = knownIdsForFetch({
      forceFull: false,
      liveIds,
      dismissedIds,
    });
    expect(known).toEqual(new Set(["kept", "trashed", "purged"]));
    expect(["trashed", "purged", "new"].filter((id) => !known.has(id))).toEqual(
      ["new"],
    );
  });

  it("leaves deleted source ids eligible for Fetch Older Saves", () => {
    expect(
      knownIdsForFetch({ forceFull: true, liveIds, dismissedIds }),
    ).toEqual(liveIds);
  });
});

describe("remembersDeletedSource", () => {
  const deleted = {
    status: "complete" as const,
    deletedAt: new Date(1),
    rawJson: null,
  };

  it("remembers a Save emptied from Trash", () => {
    expect(remembersDeletedSource(deleted, "empty-trash")).toBe(true);
    expect(remembersDeletedSource(deleted, "trash-auto-empty")).toBe(true);
    expect(remembersDeletedSource(deleted, null)).toBe(true);
  });

  it("does not remember a release that the next fetch must import again", () => {
    const skipped = {
      status: "skipped" as const,
      deletedAt: null,
      rawJson: { importFilter: "list" },
    };
    expect(remembersDeletedSource(skipped, "sync:import-filter:release")).toBe(
      false,
    );
    expect(remembersDeletedSource(skipped, "redo")).toBe(false);
    expect(remembersDeletedSource(deleted, "split-save:rollback")).toBe(false);
    expect(remembersDeletedSource(deleted, "eagle-package-rollback")).toBe(
      false,
    );
  });

  it("remembers a filtered Save the user moved to Trash before deleting it", () => {
    expect(
      remembersDeletedSource(
        {
          status: "skipped",
          deletedAt: new Date(1),
          rawJson: { importFilter: "media" },
        },
        "empty-trash",
      ),
    ).toBe(true);
  });
});

describe("deletedSourceKeys", () => {
  it("records a split slide and the post id sync harvests", () => {
    expect(
      deletedSourceKeys({
        source: "instagram",
        sourceId: "post-2 3f9a1c",
        rawJson: { split: { sourceId: "post-2" } },
      }),
    ).toEqual([
      { source: "instagram", sourceId: "post-2 3f9a1c" },
      { source: "instagram", sourceId: "post-2" },
    ]);
  });
});

describe("trashedBaselineWhere", () => {
  it("selects trashed source ids for the account automatic fetch is reading", () => {
    const where = trashedBaselineWhere({ id: "acc", source: "twitter" });
    if (!where) throw new Error("Expected a Trash filter.");
    const query = new SQLiteSyncDialect().sqlToQuery(where);
    expect(query.sql).toContain('"saves"."deleted_at" is not null');
    expect(query.sql).toContain('"saves"."source" = ?');
    expect(query.params).toEqual(["twitter", "acc"]);
  });
});
