import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import { EMPTY_QUERY } from "@pond/schema/filters";
import type { Transaction } from "@pond/schema/tx";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { app } from "electron";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { BulkEdit } from "../../../shared/bulk-contracts";
import { migratePond } from "../../database/migrations";
import { closeDb, getDb, initializePondSchema } from "../../db";
import { infoDocFromSave } from "../../lib/library-format";
import { invalidatePaths, resolvePaths } from "../../paths";
import { bulkEditSaves } from "../bulk-saves";
import { executeBatch } from "../executor";
import { queryLibraryPage } from "../library-query";
import { createMutationQueue } from "../mutation-queue";
import { enqueue } from "../pipeline/enqueue";
import { invalidatePrefs, setPrefs } from "../prefs";
import { reconcileLibraryIndex } from "../scan";
import { querySidebarCounts } from "../sidebar-counts";
import { returnDueSnoozes } from "./snooze";

function nativeAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const InboxRowSchema = z.object({
  inbox_state: z.string().nullable(),
  inbox_until: z.number().nullable(),
});
const DROP_INBOX = [
  "DROP INDEX saves_inbox_idx",
  "ALTER TABLE saves DROP COLUMN inbox_state",
  "ALTER TABLE saves DROP COLUMN inbox_until",
].join(";");
const INSERT_STATE =
  "INSERT INTO saves (id, source, source_id, url, status, inbox_state, inbox_until, deleted_at) VALUES (?, 'local', ?, 'pond:test', 'complete', ?, ?, ?)";
const SYNC = { trigger: "sync:github" };
const QUICK_ADD = { trigger: "user:quickAdd" };
const github = (path: string, opts: { trigger: string }) =>
  enqueue(`https://github.com/${path}`, opts);

const roots: string[] = [];
const opened: Database.Database[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function memoryDb() {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  return Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
}

describe.skipIf(!nativeAvailable())("inbox storage", () => {
  it("adds the Inbox columns to an older index without sending any Save to it", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      db.exec(DROP_INBOX);
      const insert = db.prepare(
        "INSERT INTO saves (id, source, source_id, url) VALUES (?, ?, ?, ?)",
      );
      insert.run("old", "local", "old", "pond:local/old");

      migratePond(db);
      migratePond(db);

      const select = db.prepare("SELECT inbox_state, inbox_until FROM saves");
      expect(InboxRowSchema.parse(select.get())).toEqual({
        inbox_state: null,
        inbox_until: null,
      });
      const index = db
        .prepare("SELECT name FROM sqlite_master WHERE name = ?")
        .get("saves_inbox_idx");
      expect(index).toEqual({ name: "saves_inbox_idx" });
    } finally {
      db.close();
    }
  });

  it("rebuilds Inbox state from info.json on rescan and writes it back the same way", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-inbox-scan-"));
    roots.push(root);
    const db = memoryDb();
    const mutate = createMutationQueue().run;
    const scan = () =>
      reconcileLibraryIndex({ root, db, mutate, changed() {} });
    const until = "2030-01-02T03:04:05.000Z";
    const directory = join(root, "items", "note.info");
    const path = join(directory, "info.json");
    await mkdir(directory, { recursive: true });
    const metadata = {
      schema: 4,
      id: "note",
      source: "local",
      sourceId: "note",
      url: "pond:local/note",
      title: "Note",
      tags: [],
      folderIds: [],
      mediaType: "text",
      coverIndex: 0,
      files: [],
      savedAt: "2020-01-02T00:00:00Z",
      createdAt: "2020-01-02T00:00:00Z",
      inbox: { state: "snoozed", until },
    };
    await writeFile(path, JSON.stringify(metadata));

    await scan();
    const row = db.select().from(schema.saves).get();
    expect(row).toMatchObject({
      inboxState: "snoozed",
      inboxUntil: Date.parse(until),
    });
    if (!row) throw new Error("scan did not index the Save");
    expect(infoDocFromSave(row, [], []).inbox).toEqual({
      state: "snoozed",
      until,
    });

    const { inbox: _inbox, ...withoutInbox } = metadata;
    await writeFile(path, JSON.stringify(withoutInbox));
    const future = new Date(Date.now() + 5000);
    await utimes(path, future, future);
    await scan();
    expect(db.select().from(schema.saves).get()).toMatchObject({
      inboxState: null,
      inboxUntil: null,
    });
  });

  it("lists and counts Saves by Inbox state, leaving snoozed ones out of the badge", async () => {
    const db = memoryDb();
    const insert = db.$raw.prepare(INSERT_STATE);
    insert.run("first", "first", "review", null, null);
    insert.run("second", "second", "review", null, null);
    insert.run("later", "later", "snoozed", 5, null);
    insert.run("done", "done", "processed", null, null);
    insert.run("never", "never", null, null, null);
    insert.run("trashed", "trashed", "review", null, 1);
    const matching = (operator: "eq" | "nin", value: string | string[]) =>
      queryLibraryPage(db, "library", {
        query: {
          combinator: "and",
          rules: [{ field: "inbox", operator, value }],
        },
      });

    expect(querySidebarCounts(db)).toMatchObject({
      inbox: 2,
      inboxSnoozed: 1,
    });
    const review = await queryLibraryPage(db, "library", {
      query: EMPTY_QUERY,
      scope: { inbox: "review" },
    });
    expect([...review.ids].sort()).toEqual(["first", "second"]);
    expect((await matching("eq", "processed")).ids).toEqual(["done"]);
    const states = ["review", "snoozed", "processed"];
    expect((await matching("nin", states)).ids).toEqual(["never"]);
  });

  it("moves Saves through the Inbox and keeps the previous state for Undo", async () => {
    const db = memoryDb();
    const insert = db.$raw.prepare(INSERT_STATE);
    insert.run("never", "never", null, null, null);
    insert.run("review", "review", "review", null, null);
    insert.run("snoozed", "snoozed", "snoozed", 5, null);
    insert.run("processed", "processed", "processed", null, null);
    insert.run("trashed", "trashed", null, null, 1);
    const ids = ["never", "review", "snoozed", "processed", "trashed"];
    const run = async (operation: BulkEdit["operation"]) => {
      let committed: Transaction[] = [];
      let undone: Transaction[] = [];
      await bulkEditSaves(
        { ids, operation },
        db,
        async (transactions) => {
          committed = transactions;
        },
        (transactions) => {
          undone = transactions;
        },
      );
      expect(undone).toBe(committed);
      return Object.fromEntries(
        committed.flatMap((tx) =>
          tx.kind === "update" && tx.model === "save"
            ? [[tx.id, { before: tx.before, patch: tx.patch }]]
            : [],
        ),
      );
    };

    expect(await run({ kind: "inbox", state: "review" })).toEqual({
      never: {
        before: { inboxState: null, inboxUntil: null },
        patch: { inboxState: "review", inboxUntil: null },
      },
      snoozed: {
        before: { inboxState: "snoozed", inboxUntil: 5 },
        patch: { inboxState: "review", inboxUntil: null },
      },
      processed: {
        before: { inboxState: "processed", inboxUntil: null },
        patch: { inboxState: "review", inboxUntil: null },
      },
    });
    const processed = await run({ kind: "inbox", state: "processed" });
    expect(Object.keys(processed).sort()).toEqual(["review", "snoozed"]);
    const removed = await run({ kind: "inbox", state: null });
    expect(Object.keys(removed).sort()).toEqual([
      "processed",
      "review",
      "snoozed",
    ]);
    expect(await run({ kind: "snooze", until: 9 })).toMatchObject({
      never: { patch: { inboxState: "snoozed", inboxUntil: 9 } },
      review: { patch: { inboxState: "snoozed", inboxUntil: 9 } },
      snoozed: { patch: { inboxState: "snoozed", inboxUntil: 9 } },
      processed: { patch: { inboxState: "snoozed", inboxUntil: 9 } },
    });
  });
});

describe.skipIf(!nativeAvailable())("inbox intake", () => {
  let dir = "";

  async function inboxOf(id: string) {
    const db = await getDb();
    return db
      .select({
        inboxState: schema.saves.inboxState,
        inboxUntil: schema.saves.inboxUntil,
      })
      .from(schema.saves)
      .where(eq(schema.saves.id, id))
      .get();
  }

  afterAll(async () => {
    await closeDb();
    vi.restoreAllMocks();
    invalidatePaths();
    if (!dir) return;
    try {
      await rm(dir, { recursive: true, force: true });
    } catch (error) {
      /** Windows keeps the closed SQLite files locked until the process exits. */
      if (process.platform !== "win32") throw error;
    }
  });

  it("sends one-off captures to the Inbox and keeps Sync out until it is switched on", async () => {
    dir = await mkdtemp(join(tmpdir(), "pond-inbox-intake-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
    invalidatePrefs();
    resolvePaths(join(dir, "Inbox.pond"));

    const captured = await github("vercel/next.js", QUICK_ADD);
    expect(await inboxOf(captured.id)).toEqual({
      inboxState: "review",
      inboxUntil: null,
    });

    const synced = await github("octocat/hello-world", SYNC);
    expect(await inboxOf(synced.id)).toEqual({
      inboxState: null,
      inboxUntil: null,
    });

    await setPrefs({ inbox: { channels: { sync: true } } });
    const opted = await github("octocat/spoon-knife", SYNC);
    expect((await inboxOf(opted.id))?.inboxState).toBe("review");

    await setPrefs({ inbox: { enabled: false } });
    const off = await github("octocat/linguist", QUICK_ADD);
    expect((await inboxOf(off.id))?.inboxState).toBeNull();
  });

  it("returns a snoozed Save to review once its time comes", async () => {
    const created = await github("octocat/test-repo1", SYNC);
    await executeBatch([
      {
        kind: "update",
        model: "save",
        id: created.id,
        before: { inboxState: null, inboxUntil: null },
        patch: { inboxState: "snoozed", inboxUntil: Date.now() + 60_000 },
        meta: { actor: "user", actorReason: "test:snooze" },
      },
    ]);

    expect(await returnDueSnoozes()).toBe(0);
    expect((await inboxOf(created.id))?.inboxState).toBe("snoozed");

    expect(await returnDueSnoozes(Date.now() + 120_000)).toBe(1);
    expect(await inboxOf(created.id)).toEqual({
      inboxState: "review",
      inboxUntil: null,
    });
  });
});
