import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deletedSourceIds } from "@pond/schema/db";
import Database from "better-sqlite3";
import { app } from "electron";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import { freshWatchEntries } from "./known";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("freshWatchEntries", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-watch-known-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
    resolvePaths(join(dir, "Watch.pond"));
  });

  afterAll(async () => {
    await closeDb();
    vi.restoreAllMocks();
    invalidatePaths();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      if (process.platform !== "win32") throw error;
    }
  });

  it("does not queue a post emptied from Trash", async () => {
    const db = await getDb();
    await db.insert(deletedSourceIds).values({
      source: "youtube",
      sourceId: "video-emptied",
    });

    const fresh = await freshWatchEntries({
      fallback: "youtube",
      present: [],
      entries: [
        {
          url: "https://www.youtube.com/watch?v=video-emptied",
          sourceId: "video-emptied",
        },
        {
          url: "https://www.youtube.com/watch?v=video-new",
          sourceId: "video-new",
        },
      ],
    });

    expect(fresh.map((entry) => entry.sourceId)).toEqual(["video-new"]);
  });

  it("skips a trashed Save and a feed post emptied from Trash", async () => {
    const db = await getDb();
    await db.insert(deletedSourceIds).values({
      source: "youtube",
      sourceId: "video-feed",
    });

    const fresh = await freshWatchEntries({
      fallback: "web",
      present: [{ source: "youtube", sourceId: "video-trashed" }],
      entries: [
        {
          url: "https://www.youtube.com/watch?v=video-trashed",
          source: "youtube",
          sourceId: "video-trashed",
        },
        {
          url: "https://www.youtube.com/watch?v=video-feed",
          source: "youtube",
          sourceId: "video-feed",
        },
        {
          url: "https://example.com/notes",
          source: "web",
          sourceId: "https://example.com/notes",
        },
      ],
    });

    expect(fresh.map((entry) => entry.sourceId)).toEqual([
      "https://example.com/notes",
    ]);
  });
});
