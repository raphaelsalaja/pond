import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PREFS, saves } from "@pond/schema/db";
import Database from "better-sqlite3";
import { app } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../db";
import { invalidatePaths, resolvePaths } from "../paths";
import {
  inboxIntakeForOrigin,
  inboxIntakeForTrigger,
  initialInboxState,
  returnDueSnoozes,
} from "./inbox";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe("Inbox intake", () => {
  it("sorts every capture path into the switch that controls it", () => {
    expect(inboxIntakeForTrigger(undefined)).toBe("captures");
    expect(inboxIntakeForTrigger("toolbar")).toBe("captures");
    expect(inboxIntakeForTrigger("user:quickAdd")).toBe("captures");
    expect(inboxIntakeForTrigger("user:download")).toBe("captures");
    expect(inboxIntakeForTrigger("twitter:bookmark")).toBe("captures");
    expect(inboxIntakeForTrigger("sync:github")).toBe("syncs");
    expect(inboxIntakeForTrigger("cron")).toBe("syncs");
    expect(inboxIntakeForTrigger("watch:youtube")).toBe("watches");
    expect(inboxIntakeForTrigger("user:importBookmarks")).toBe("imports");
    expect(inboxIntakeForTrigger("pipeline:enqueue")).toBeNull();
    expect(inboxIntakeForOrigin("files")).toBe("captures");
    expect(inboxIntakeForOrigin("clipboard")).toBe("captures");
    expect(inboxIntakeForOrigin("eagle")).toBe("imports");
    expect(inboxIntakeForOrigin("watched-folder")).toBe("imports");
  });

  it("keeps bulk paths out of the Inbox by default and honors the master switch", () => {
    const prefs = DEFAULT_PREFS.inbox;
    expect(initialInboxState("captures", prefs)).toBe("needs_review");
    expect(initialInboxState("imports", prefs)).toBeNull();
    expect(initialInboxState("syncs", prefs)).toBeNull();
    expect(initialInboxState("watches", prefs)).toBeNull();
    expect(initialInboxState(null, prefs)).toBeNull();
    expect(initialInboxState("syncs", { ...prefs, syncs: true })).toBe(
      "needs_review",
    );
    expect(
      initialInboxState("captures", { ...prefs, enabled: false }),
    ).toBeNull();
  });
});

describe.skipIf(!nativeSqliteAvailable())("Inbox snooze", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-inbox-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
    resolvePaths(join(dir, "Inbox.pond"));
  });

  afterAll(async () => {
    await closeDb();
    vi.restoreAllMocks();
    invalidatePaths();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      /** Windows keeps the closed SQLite files locked until the process exits. */
      if (process.platform !== "win32") throw error;
    }
  });

  it("returns only due, live snoozes to Needs Review", async () => {
    const db = await getDb();
    const insert = db.$raw.prepare(
      "insert into saves(id, source, source_id, url, status, inbox_state, inbox_until, deleted_at) values (?, 'local', ?, ?, 'complete', ?, ?, ?)",
    );
    insert.run("due", "due", "pond:local/due", "snoozed", 1_000, null);
    insert.run("later", "later", "pond:local/later", "snoozed", 9_000, null);
    insert.run("trashed", "trashed", "pond:local/trashed", "snoozed", 1_000, 1);
    insert.run("kept", "kept", "pond:local/kept", "processed", null, null);

    expect(await returnDueSnoozes(5_000)).toBe(1);
    const rows = await db
      .select({
        id: saves.id,
        inboxState: saves.inboxState,
        inboxUntil: saves.inboxUntil,
      })
      .from(saves)
      .orderBy(saves.id);
    expect(rows).toEqual([
      { id: "due", inboxState: "needs_review", inboxUntil: null },
      { id: "kept", inboxState: "processed", inboxUntil: null },
      { id: "later", inboxState: "snoozed", inboxUntil: 9_000 },
      { id: "trashed", inboxState: "snoozed", inboxUntil: 1_000 },
    ]);
    expect(await returnDueSnoozes(5_000)).toBe(0);
  });
});
