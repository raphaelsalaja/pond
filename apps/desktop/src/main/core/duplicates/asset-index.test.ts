import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migratePond } from "../../database/migrations";
import {
  classifyPendingAssets,
  ensureAssetIndex,
  findAssetsBySha256,
  rebuildAssetIndex,
} from "./asset-index";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

const sha = (seed: string) => seed.padEnd(64, "0");

function file(path: string, seed: string, kind = "image") {
  return { path, kind, sha256: sha(seed).toUpperCase(), size: 10 };
}

function insert(db: Database.Database, id: string, json: string) {
  db.prepare(
    "INSERT INTO saves (id, source, source_id, url, title, files) VALUES (?, 'local', ?, '', ?, ?)",
  ).run(id, id, id, json);
}

const AssetRowSchema = z.object({
  save_id: z.string(),
  path: z.string(),
  sha256: z.string(),
  media: z.string().nullable(),
});

function assets(db: Database.Database) {
  return z
    .array(AssetRowSchema)
    .parse(
      db
        .prepare(
          "SELECT save_id, path, sha256, media FROM save_assets ORDER BY save_id, path",
        )
        .all(),
    );
}

function open() {
  const db = new Database(":memory:");
  migratePond(db);
  ensureAssetIndex(db);
  return db;
}

describe.skipIf(!nativeSqliteAvailable())("asset index", () => {
  it("mirrors original files and skips generated ones", () => {
    const db = open();
    try {
      insert(
        db,
        "one",
        JSON.stringify([
          file("a.png", "a"),
          file("thumb.webp", "f", "thumbnail"),
          { kind: "image" },
          "not-a-file",
        ]),
      );
      expect(assets(db)).toEqual([
        { save_id: "one", path: "a.png", sha256: sha("a"), media: null },
      ]);
    } finally {
      db.close();
    }
  });

  it("tolerates malformed files JSON", () => {
    const db = open();
    try {
      insert(db, "broken", "{not json");
      insert(db, "object", '{"path":"a.png"}');
      expect(assets(db)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("follows updates, deletes and replaced rows", () => {
    const db = open();
    try {
      insert(
        db,
        "one",
        JSON.stringify([file("a.png", "a"), file("b.png", "b")]),
      );
      db.prepare("UPDATE saves SET files = ? WHERE id = 'one'").run(
        JSON.stringify([file("c.png", "c")]),
      );
      expect(assets(db).map((row) => row.path)).toEqual(["c.png"]);
      db.prepare("UPDATE saves SET title = 'renamed' WHERE id = 'one'").run();
      expect(assets(db).map((row) => row.path)).toEqual(["c.png"]);
      db.prepare(
        "INSERT OR REPLACE INTO saves (id, source, source_id, url, files) VALUES ('one', 'local', 'one', '', ?)",
      ).run(JSON.stringify([file("d.png", "d")]));
      expect(assets(db).map((row) => row.path)).toEqual(["d.png"]);
      db.prepare("DELETE FROM saves WHERE id = 'one'").run();
      expect(assets(db)).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("populates once for an existing Library and rebuilds on demand", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      insert(db, "old", JSON.stringify([file("a.png", "a")]));
      ensureAssetIndex(db);
      expect(assets(db).map((row) => row.save_id)).toEqual(["old"]);
      db.prepare("DELETE FROM save_assets").run();
      ensureAssetIndex(db);
      expect(assets(db)).toEqual([]);
      expect(rebuildAssetIndex(db)).toBe(1);
    } finally {
      db.close();
    }
  });

  it("tags media types and finds owners of a hash, live ones first", () => {
    const db = open();
    try {
      insert(db, "image", JSON.stringify([file("a.png", "a")]));
      insert(db, "doc", JSON.stringify([file("notes.txt", "b", "document")]));
      insert(db, "trashed", JSON.stringify([file("a.png", "a")]));
      db.prepare("UPDATE saves SET deleted_at = 1 WHERE id = 'trashed'").run();
      expect(classifyPendingAssets(db)).toBe(3);
      expect(classifyPendingAssets(db)).toBe(0);
      expect(
        Object.fromEntries(assets(db).map((row) => [row.save_id, row.media])),
      ).toEqual({ doc: "other", image: "image", trashed: "image" });
      const found = findAssetsBySha256(db, [sha("a").toUpperCase()]);
      expect(
        found.get(sha("a"))?.map((asset) => [asset.saveId, asset.inTrash]),
      ).toEqual([
        ["image", false],
        ["trashed", true],
      ]);
    } finally {
      db.close();
    }
  });
});
