import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializePondSchema } from "../db";
import { bulkEditSaves } from "./bulk-saves";

function nativeAvailable() {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}
const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function fixture() {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  const db = Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
  const insert = raw.prepare(
    "insert into saves(id,source,source_id,url,tags,suggested_tags,rating) values(?,'local',?,'','[\"original\"]','[\"Suggested\"]',1)",
  );
  const ids = Array.from({ length: 1301 }, (_, i) => `save-${i}`);
  raw.transaction(() => {
    for (const id of ids) insert.run(id, id);
  })();
  const batches: Transaction[][] = [];
  const undo: Transaction[][] = [];
  const commit = async (transactions: Transaction[]) => {
    batches.push(transactions);
  };
  return {
    db,
    raw,
    ids,
    batches,
    undo,
    commit,
    recordUndo: (transactions: Transaction[]) => undo.push(transactions),
  };
}
describe.skipIf(!nativeAvailable())("complete bulk selections", () => {
  it("builds one rating/tag/trash/purge operation across SQL chunks without renderer metadata", async () => {
    const f = fixture();
    for (const operation of [
      { kind: "rating", rating: 5 },
      { kind: "tags", tags: ["#Reviewed", "Reviewed"] },
      { kind: "suggested-tags" },
      { kind: "trash" },
      { kind: "purge" },
    ] as const) {
      const result = await bulkEditSaves(
        {
          ids: [...f.ids, "save-0"],
          operation:
            operation.kind === "tags"
              ? { ...operation, tags: [...operation.tags] }
              : operation,
        },
        f.db,
        f.commit,
        f.recordUndo,
      );
      expect(result.changed).toBe(1301);
      const batch = f.batches.at(-1);
      if (!batch) throw new Error("Expected a committed batch");
      expect(
        new Set(batch.filter((tx) => tx.model === "save").map((tx) => tx.id)),
      ).toEqual(new Set(f.ids));
      if (operation.kind !== "purge") expect(f.undo.at(-1)).toEqual(batch);
      else expect(f.undo).toHaveLength(f.batches.length - 1);
      if (operation.kind === "tags")
        expect(
          batch.filter((tx) => tx.kind === "create" && tx.model === "tag"),
        ).toHaveLength(2);
    }
  });
  it("does not silently commit a partial selection when a cold ID vanished", async () => {
    const f = fixture();
    await expect(
      bulkEditSaves(
        { ids: [...f.ids, "missing"], operation: { kind: "trash" } },
        f.db,
        f.commit,
        f.recordUndo,
      ),
    ).rejects.toThrow("no longer available");
    expect(f.batches).toEqual([]);
    expect(f.undo).toEqual([]);
  });
  it("replaces tags across the complete selection", async () => {
    const f = fixture();
    const result = await bulkEditSaves(
      {
        ids: f.ids,
        operation: { kind: "tags", tags: [], mode: "replace" },
      },
      f.db,
      f.commit,
      f.recordUndo,
    );
    expect(result).toEqual({ changed: f.ids.length });
    expect(
      f.batches[0]?.filter(
        (tx) =>
          tx.kind === "update" &&
          tx.model === "save" &&
          tx.patch.tags?.length === 0,
      ),
    ).toHaveLength(f.ids.length);
  });
  it("replaces notes and removes only the requested tags with undo snapshots", async () => {
    const f = fixture();
    f.raw.exec(
      "update saves set notes='previous', tags='[\"original\",\"Keep\"]'",
    );
    await bulkEditSaves(
      { ids: f.ids, operation: { kind: "notes", notes: "Reviewed" } },
      f.db,
      f.commit,
      f.recordUndo,
    );
    expect(f.undo[0]?.[0]).toMatchObject({
      before: { notes: "previous" },
      patch: { notes: "Reviewed" },
    });
    await bulkEditSaves(
      {
        ids: f.ids,
        operation: { kind: "tags", tags: ["ORIGINAL"], mode: "remove" },
      },
      f.db,
      f.commit,
      f.recordUndo,
    );
    expect(f.undo[1]?.filter((tx) => tx.model === "save")).toHaveLength(
      f.ids.length,
    );
    expect(f.undo[1]?.find((tx) => tx.model === "save")).toMatchObject({
      before: { tags: ["original", "Keep"] },
      patch: { tags: ["Keep"] },
    });
  });
  it("restores every selected trashed Save and records nothing when commit fails", async () => {
    const f = fixture();
    f.raw.exec("update saves set deleted_at=1");
    expect(
      await bulkEditSaves(
        { ids: f.ids, operation: { kind: "untrash" } },
        f.db,
        f.commit,
        f.recordUndo,
      ),
    ).toEqual({ changed: 1301 });
    expect(f.batches[0]).toHaveLength(1301);
    f.undo.length = 0;
    await expect(
      bulkEditSaves(
        { ids: f.ids, operation: { kind: "purge" } },
        f.db,
        async () => {
          throw new Error("Disk full");
        },
        f.recordUndo,
      ),
    ).rejects.toThrow("Disk full");
    expect(f.undo).toEqual([]);
  });
  it("moves Saves through Inbox states with undo snapshots and clears the snooze time", async () => {
    const f = fixture();
    const ids = f.ids.slice(0, 3);
    f.raw.exec("update saves set deleted_at=1 where id='save-2'");
    await bulkEditSaves(
      { ids, operation: { kind: "inbox", state: "snoozed", until: 5000 } },
      f.db,
      f.commit,
      f.recordUndo,
    );
    expect(f.undo[0]).toHaveLength(2);
    expect(f.undo[0]?.[0]).toMatchObject({
      before: { inboxState: null, inboxUntil: null },
      patch: { inboxState: "snoozed", inboxUntil: 5000 },
    });
    f.raw.exec(
      "update saves set inbox_state='snoozed', inbox_until=5000 where id in ('save-0','save-1')",
    );
    await bulkEditSaves(
      { ids, operation: { kind: "inbox", state: "processed", until: 9000 } },
      f.db,
      f.commit,
      f.recordUndo,
    );
    expect(f.undo[1]?.[0]).toMatchObject({
      before: { inboxState: "snoozed", inboxUntil: 5000 },
      patch: { inboxState: "processed", inboxUntil: null },
    });
    await expect(
      bulkEditSaves(
        { ids, operation: { kind: "inbox", state: "snoozed" } },
        f.db,
        f.commit,
        f.recordUndo,
      ),
    ).rejects.toThrow("snoozed");
    expect(f.batches).toHaveLength(2);
  });
});
