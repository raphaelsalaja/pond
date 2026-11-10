import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializePondSchema } from "../db";
import {
  createView,
  deleteView,
  listViews,
  renameViewsBatch,
  reorderViews,
  updateView,
} from "./saved-views";

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const databases: Database.Database[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...eventsSchema } }),
    { $raw: sqlite },
  );
  const batches: Transaction[][] = [];
  const runtime = {
    getDb: async () => db,
    async commit(transactions: Transaction[]) {
      sqlite.transaction(() => {
        for (const transaction of transactions) {
          if (transaction.model !== "saved_view")
            throw new Error("Unexpected model");
          switch (transaction.kind) {
            case "create":
              db.insert(schema.savedViews).values(transaction.data).run();
              break;
            case "update":
              db.update(schema.savedViews)
                .set(transaction.patch)
                .where(eq(schema.savedViews.id, transaction.id))
                .run();
              break;
            case "delete":
              db.delete(schema.savedViews)
                .where(eq(schema.savedViews.id, transaction.id))
                .run();
              break;
          }
        }
      })();
      batches.push(transactions);
    },
  };
  async function create(input: Parameters<typeof createView>[0]) {
    const result = await createView(input, runtime);
    if (!result.ok || !result.id) throw new Error("Fixture create failed");
    return result.id;
  }
  return { db, sqlite, runtime, batches, create };
}

const invalidParent = {
  ok: false,
  error: "Choose a different parent group.",
};

describe.skipIf(!nativeSqliteAvailable())("saved view hierarchy", () => {
  it("rejects the second of concurrent reciprocal moves", async () => {
    const { runtime, create } = setup();
    const first = await create({ name: "First", kind: "group" });
    const second = await create({ name: "Second", kind: "group" });
    expect(
      await Promise.all([
        updateView(first, { parentId: second }, runtime),
        updateView(second, { parentId: first }, runtime),
      ]),
    ).toEqual([{ ok: true }, invalidParent]);
    expect(await listViews(runtime)).toEqual([
      expect.objectContaining({ id: first, parentId: second }),
      expect.objectContaining({ id: second, parentId: null }),
    ]);
  });

  it("promotes a concurrently created child before deleting its group", async () => {
    const { runtime, create } = setup();
    const group = await create({ name: "Branding", kind: "group" });
    const [created, deleted] = await Promise.all([
      createView({ name: "Reference", parentId: group }, runtime),
      deleteView(group, runtime),
    ]);
    if (!created.ok) throw new Error(created.error);
    expect(deleted.ok).toBe(true);
    expect(await listViews(runtime)).toEqual([
      expect.objectContaining({ id: created.id, parentId: null }),
    ]);
  });

  it("rejects child creation queued after deleting its group", async () => {
    const { runtime, create } = setup();
    const group = await create({ name: "Branding", kind: "group" });
    expect(
      await Promise.all([
        deleteView(group, runtime),
        createView({ name: "Reference", parentId: group }, runtime),
      ]),
    ).toEqual([{ ok: true }, invalidParent]);
    expect(await listViews(runtime)).toEqual([]);
  });

  it("creates the three kinds, retaining a saved view's query and display preferences", async () => {
    const { runtime, create } = setup();
    const group = await create({ name: " Branding ", kind: "group" });
    const smartFolder = await create({
      name: "Images",
      kind: "smart_folder",
      parentId: group,
    });
    const savedView = await create({
      name: "Reference",
      parentId: group,
      query: EMPTY_QUERY,
      sortKey: "title",
      sortDir: "asc",
      layout: "grid",
    });
    expect(await listViews(runtime)).toEqual([
      expect.objectContaining({
        id: group,
        name: "Branding",
        kind: "group",
        parentId: null,
      }),
      expect.objectContaining({
        id: smartFolder,
        kind: "smart_folder",
        parentId: group,
      }),
      expect.objectContaining({
        id: savedView,
        kind: "saved_view",
        parentId: group,
        query: EMPTY_QUERY,
        sortKey: "title",
        sortDir: "asc",
        layout: "grid",
      }),
    ]);
  });

  it("batch renames Smart Folders and Groups in selection order", async () => {
    const { runtime, create } = setup();
    const group = await create({ name: "Branding", kind: "group" });
    const smartFolder = await create({ name: "Images", kind: "smart_folder" });
    expect(
      await renameViewsBatch(
        { ids: [smartFolder, group], pattern: "{n:2} {original}" },
        runtime,
      ),
    ).toEqual({ ok: true, renamed: 2 });
    expect(await listViews(runtime)).toEqual([
      expect.objectContaining({ id: group, name: "02 Branding" }),
      expect.objectContaining({ id: smartFolder, name: "01 Images" }),
    ]);
  });

  it("rejects missing parents, leaf parents and moves that create cycles", async () => {
    const { runtime, create, batches } = setup();
    const group = await create({ name: "Branding", kind: "group" });
    const childGroup = await create({
      name: "Projects",
      kind: "group",
      parentId: group,
    });
    const view = await create({ name: "Reference", parentId: childGroup });
    const smartFolder = await create({ name: "Images", kind: "smart_folder" });
    const before = await listViews(runtime);
    const committed = batches.length;
    expect(
      await createView({ name: "Missing", parentId: "missing" }, runtime),
    ).toEqual(invalidParent);
    expect(
      await createView({ name: "Invalid", parentId: view }, runtime),
    ).toEqual(invalidParent);
    expect(
      await createView({ name: "Invalid", parentId: smartFolder }, runtime),
    ).toEqual(invalidParent);
    expect(await updateView(group, { parentId: group }, runtime)).toEqual(
      invalidParent,
    );
    expect(await updateView(group, { parentId: childGroup }, runtime)).toEqual(
      invalidParent,
    );
    expect(await updateView(view, { parentId: "missing" }, runtime)).toEqual(
      invalidParent,
    );
    expect(
      await updateView(childGroup, { parentId: smartFolder }, runtime),
    ).toEqual(invalidParent);
    expect(await listViews(runtime)).toEqual(before);
    expect(batches).toHaveLength(committed);
    expect(await updateView(view, { parentId: null }, runtime)).toEqual({
      ok: true,
    });
    expect(
      (await listViews(runtime)).find((row) => row.id === view)?.parentId,
    ).toBeNull();
  });

  it("deletes a group and promotes its children in one batch without deleting descendants or Saves", async () => {
    const { runtime, create, db, batches } = setup();
    const root = await create({ name: "Root", kind: "group" });
    const group = await create({
      name: "Branding",
      kind: "group",
      parentId: root,
    });
    const childGroup = await create({
      name: "Projects",
      kind: "group",
      parentId: group,
    });
    const view = await create({
      name: "Reference",
      parentId: group,
      layout: "grid",
    });
    const descendant = await create({
      name: "Images",
      kind: "smart_folder",
      parentId: childGroup,
    });
    db.insert(schema.saves)
      .values({
        id: "kept",
        source: "web",
        sourceId: "kept",
        url: "https://example.com",
      })
      .run();
    expect(await deleteView(group, runtime)).toEqual({ ok: true });
    expect(await listViews(runtime)).toEqual([
      expect.objectContaining({ id: root, parentId: null }),
      expect.objectContaining({ id: childGroup, parentId: root }),
      expect.objectContaining({ id: view, parentId: root, layout: "grid" }),
      expect.objectContaining({ id: descendant, parentId: childGroup }),
    ]);
    expect(batches.at(-1)).toEqual([
      expect.objectContaining({
        kind: "update",
        id: childGroup,
        patch: { parentId: root },
      }),
      expect.objectContaining({
        kind: "update",
        id: view,
        patch: { parentId: root },
      }),
      expect.objectContaining({ kind: "delete", id: group }),
    ]);
    expect(db.select({ id: schema.saves.id }).from(schema.saves).all()).toEqual(
      [{ id: "kept" }],
    );
    expect(await deleteView(root, runtime)).toEqual({ ok: true });
    expect(
      (await listViews(runtime)).find((row) => row.id === childGroup)?.parentId,
    ).toBeNull();
  });

  it("leaves the whole hierarchy unchanged if a grouped deletion fails", async () => {
    const { runtime, create, sqlite } = setup();
    const group = await create({ name: "Branding", kind: "group" });
    await create({ name: "Reference", parentId: group });
    const before = await listViews(runtime);
    sqlite.exec(
      "CREATE TRIGGER reject_delete BEFORE DELETE ON saved_views BEGIN SELECT RAISE(ABORT, 'Delete rejected'); END",
    );
    await expect(deleteView(group, runtime)).rejects.toThrow("Delete rejected");
    expect(await listViews(runtime)).toEqual(before);
    expect(await updateView(group, { name: "Updated" }, runtime)).toEqual({
      ok: true,
    });
  });

  it("persists a smart folder reorder as sibling sort order that can be undone", async () => {
    const { runtime, create } = setup();
    const undo = vi.fn();
    const recording = { ...runtime, recordUndo: undo };
    const first = await create({ name: "Alpha", kind: "smart_folder" });
    const second = await create({ name: "Beta", kind: "smart_folder" });
    expect(await reorderViews([second, first], recording)).toEqual({
      ok: true,
    });
    expect(
      (await listViews(runtime)).map((view) => [view.id, view.sortOrder]),
    ).toEqual([
      [second, 0],
      [first, 1],
    ]);
    expect(undo).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: "update",
        id: second,
        patch: { sortOrder: 0 },
        before: { sortOrder: 1 },
      }),
      expect.objectContaining({
        kind: "update",
        id: first,
        patch: { sortOrder: 1 },
        before: { sortOrder: 0 },
      }),
    ]);
  });
});
