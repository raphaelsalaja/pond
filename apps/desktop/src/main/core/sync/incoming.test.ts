import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SOURCE_SYNC_PREFS, saveFolders } from "@pond/schema/db";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { app } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import { enqueue } from "../pipeline/enqueue";
import { createAccount, getAccount, patchAccountSync } from "./accounts";
import { organizeIncoming } from "./incoming";
import { createWatch, patchWatchSync } from "./watches";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

async function folderIds(saveId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ folderId: saveFolders.folderId })
    .from(saveFolders)
    .where(eq(saveFolders.saveId, saveId));
  return rows.map((row) => row.folderId);
}

describe.skipIf(!nativeSqliteAvailable())("incoming folder assignment", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-incoming-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
    resolvePaths(join(dir, "Incoming.pond"));
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

  it("files a save that is still only a queued row", async () => {
    const db = await getDb();
    db.$raw
      .prepare("insert into folders(id, name) values ('stars', 'Stars')")
      .run();
    db.$raw
      .prepare(
        "insert into saves(id, source, source_id, url, status) values ('queued', 'github', 'vercel/pond', 'https://github.com/vercel/pond', 'ingesting')",
      )
      .run();

    await organizeIncoming(["queued"], { folderId: "stars" }, "test");

    expect(await folderIds("queued")).toEqual(["stars"]);
  });

  it("files a newly enqueued save from the account that imported it", async () => {
    const db = await getDb();
    db.$raw
      .prepare(
        "insert into folders(id, name) values ('starred-repos', 'Starred')",
      )
      .run();
    const account = await createAccount({
      source: "github",
      handle: "octocat",
      sync: {
        ...DEFAULT_SOURCE_SYNC_PREFS,
        incoming: { folderId: "starred-repos" },
      },
    });

    const created = await enqueue("https://github.com/vercel/next.js", {
      trigger: "sync:github",
      accountId: account.id,
    });

    expect(created.created).toBe(true);
    expect(await folderIds(created.id)).toEqual(["starred-repos"]);
  });

  it("files an extension capture when that source has one folder rule", async () => {
    const created = await enqueue("https://github.com/octocat/hello-world", {
      trigger: "github:star",
    });

    expect(created.created).toBe(true);
    expect(await folderIds(created.id)).toEqual(["starred-repos"]);
  });

  it("keeps a saved folder rule and still files the next sync", async () => {
    const db = await getDb();
    db.$raw
      .prepare("insert into folders(id, name) values ('kept', 'Kept')")
      .run();
    const account = await createAccount({
      source: "dribbble",
      handle: "studio",
    });
    await patchAccountSync(account.id, { incoming: { folderId: "kept" } });
    expect((await getAccount(account.id))?.sync.incoming).toEqual({
      folderId: "kept",
    });

    const bulk = await enqueue(
      [{ url: "https://dribbble.com/shots/27755136" }],
      { trigger: "sync:dribbble", accountId: account.id },
    );

    expect(bulk.created).toBe(1);
    expect(await folderIds(bulk.createdIds[0] ?? "")).toEqual(["kept"]);
  });

  it("files a capture into the only watched source folder", async () => {
    const db = await getDb();
    db.$raw
      .prepare("insert into folders(id, name) values ('videos', 'Videos')")
      .run();
    const watch = await createWatch({
      source: "youtube",
      handle: "channel",
    });
    await patchWatchSync(watch.id, { incoming: { folderId: "videos" } });

    const created = await enqueue(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      { trigger: "youtube:like" },
    );

    expect(created.created).toBe(true);
    expect(await folderIds(created.id)).toEqual(["videos"]);
  });

  it("does not guess a folder when two accounts on a source each have a rule", async () => {
    const db = await getDb();
    db.$raw
      .prepare("insert into folders(id, name) values ('other', 'Other')")
      .run();
    await createAccount({
      source: "github",
      handle: "work",
      sync: {
        ...DEFAULT_SOURCE_SYNC_PREFS,
        incoming: { folderId: "other" },
      },
    });

    const created = await enqueue("https://github.com/octocat/spoon-knife", {
      trigger: "github:star",
    });

    expect(created.created).toBe(true);
    expect(await folderIds(created.id)).toEqual([]);
  });
});
