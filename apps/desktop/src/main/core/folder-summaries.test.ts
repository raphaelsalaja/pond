import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { initializePondSchema } from "../db";
import {
  queryFolderDownloadingCount,
  queryFolderPreviews,
  queryFolderSummaries,
} from "./folder-summaries";
import { querySidebarCounts } from "./sidebar-counts";

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

function seed() {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  const db = Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
  const folder = raw.prepare(
    "insert into folders(id,parent_id,name) values(?,?,?)",
  );
  folder.run("boards", null, "Pinterest");
  folder.run("board", "boards", "Kitchens");
  folder.run("other", null, "Other");
  const save = raw.prepare(
    "insert into saves(id,source,source_id,url,status,deleted_at) values(?,?,?,?,?,?)",
  );
  save.run("waiting", "pinterest", "1", "", "ingesting", null);
  save.run("waiting-2", "pinterest", "2", "", "ingesting", null);
  save.run("done", "pinterest", "3", "", "complete", null);
  save.run("failed", "pinterest", "4", "", "failed", null);
  save.run("trashed", "pinterest", "5", "", "ingesting", Date.now());
  save.run("elsewhere", "pinterest", "6", "", "ingesting", null);
  const member = raw.prepare(
    "insert into save_folders(save_id,folder_id) values(?,?)",
  );
  member.run("waiting", "board");
  member.run("waiting", "boards");
  member.run("waiting-2", "board");
  member.run("done", "board");
  member.run("failed", "board");
  member.run("trashed", "board");
  member.run("elsewhere", "other");
  return db;
}

describe.skipIf(!nativeAvailable())("queryFolderDownloadingCount", () => {
  it("counts live saves that are still downloading in the folder", async () => {
    await expect(queryFolderDownloadingCount(seed(), ["board"])).resolves.toBe(
      2,
    );
  });

  it("counts a save in several of the folders once", async () => {
    await expect(
      queryFolderDownloadingCount(seed(), ["boards", "board"]),
    ).resolves.toBe(2);
  });

  it("returns 0 without folders", async () => {
    await expect(queryFolderDownloadingCount(seed(), [])).resolves.toBe(0);
  });
});

describe.skipIf(!nativeAvailable())("queryFolderPreviews", () => {
  it("previews finished saves from each folder and its subfolders", async () => {
    await expect(
      queryFolderPreviews(seed(), ["boards", "other"], 2),
    ).resolves.toEqual({ boards: ["done"] });
  });

  it("keeps the newest saves up to the limit", async () => {
    const db = seed();
    const save = db.$raw.prepare(
      "insert into saves(id,source,source_id,url,status,saved_at) values(?,?,?,?,?,?)",
    );
    const member = db.$raw.prepare(
      "insert into save_folders(save_id,folder_id) values(?,?)",
    );
    for (const [id, savedAt] of [
      ["old", 1],
      ["new", 3],
      ["mid", 2],
    ] as const) {
      save.run(id, "pinterest", id, "", "complete", savedAt);
      member.run(id, "other");
    }
    await expect(queryFolderPreviews(db, ["other"], 2)).resolves.toEqual({
      other: ["new", "mid"],
    });
  });

  it("returns nothing without folders", async () => {
    await expect(queryFolderPreviews(seed(), [], 2)).resolves.toEqual({});
  });
});

describe.skipIf(!nativeAvailable())(
  "downloading counts on folder chrome",
  () => {
    it("puts direct downloading saves on each subfolder tile", async () => {
      const [board] = await queryFolderSummaries(seed(), "boards");
      expect(board).toMatchObject({
        id: "board",
        directSaveCount: 1,
        downloadingCount: 2,
      });
    });

    it("rolls downloading saves up the sidebar tree, separate from finished ones", () => {
      const counts = querySidebarCounts(seed());
      expect(counts.folders).toEqual({ boards: 1, board: 1 });
      expect(counts.foldersDownloading).toEqual({
        boards: 2,
        board: 2,
        other: 1,
      });
    });
  },
);
