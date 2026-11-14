import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@pond/schema/db";
import Database from "better-sqlite3";
import { is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { buildWhere } from "@pond/schema/filters";
import {
  getTableConfig,
  SQLiteSyncDialect,
  SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { migratePond } from "./migrations";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("pond database migrations", () => {
  it("creates portable sensitive-content columns", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      const columns = new Map(
        db
          .prepare("pragma table_info(saves)")
          .all()
          .map((row) => {
            const column = z
              .object({ name: z.string(), type: z.string() })
              .parse(row);
            return [column.name, column.type] as const;
          }),
      );
      expect(columns.get("sensitive_score")).toBe("REAL");
      expect(columns.get("sensitive_model")).toBe("TEXT");
    } finally {
      db.close();
    }
  });

  it("creates folder metadata separately from folder rows", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      const columns = db
        .prepare("pragma table_info(folder_metadata)")
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name);
      expect(columns).toEqual(["folder_id", "description", "external_link"]);
      const folderColumns = db
        .prepare("pragma table_info(folders)")
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name);
      expect(folderColumns).not.toContain("description");
      expect(folderColumns).not.toContain("external_link");
    } finally {
      db.close();
    }
  });

  it("creates every column the Drizzle schema declares", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      for (const table of Object.values(schema)) {
        if (!is(table, SQLiteTable)) continue;
        const config = getTableConfig(table);
        const present = db
          .prepare(`pragma table_info(${config.name})`)
          .all()
          .map((row) => z.object({ name: z.string() }).parse(row).name);
        if (present.length === 0) continue;
        expect(present, config.name).toEqual(
          expect.arrayContaining(config.columns.map((column) => column.name)),
        );
      }
    } finally {
      db.close();
    }
  });

  it("adds imported_from to an existing index and fills it from legacy source ids", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      db.exec("ALTER TABLE saves DROP COLUMN imported_from");
      const insert = db.prepare(
        "INSERT INTO saves (id, source, source_id, url) VALUES (?, ?, ?, ?)",
      );
      insert.run("eagle", "local", "eagle:ABC", "pond:local/eagle");
      insert.run("file", "local", "mymind-file:hash", "pond:local/file");
      insert.run("auto", "local", "auto:hash", "pond:local/auto");
      insert.run("own", "local", "own", "pond:local/own");
      insert.run("tweet", "twitter", "eagle:1", "https://x.com/a/status/1");

      migratePond(db);
      const origins = Object.fromEntries(
        db
          .prepare("SELECT id, imported_from FROM saves ORDER BY id")
          .all()
          .map((row) => {
            const parsed = z
              .object({ id: z.string(), imported_from: z.string().nullable() })
              .parse(row);
            return [parsed.id, parsed.imported_from];
          }),
      );
      expect(origins).toEqual({
        auto: "watched-folder",
        eagle: "eagle",
        file: "mymind",
        own: null,
        tweet: null,
      });
    } finally {
      db.close();
    }
  });

  it("keeps source ids that were deleted after the save row is gone", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      const columns = db
        .prepare("pragma table_info(deleted_source_ids)")
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name);
      expect(columns).toEqual(["source", "source_id"]);
      const insert = db.prepare(
        "INSERT OR IGNORE INTO deleted_source_ids (source, source_id) VALUES (?, ?)",
      );
      insert.run("twitter", "100");
      insert.run("twitter", "100");
      expect(
        db.prepare("SELECT source_id FROM deleted_source_ids").all(),
      ).toEqual([{ source_id: "100" }]);
      const orm = drizzle(db, { schema });
      const again = { source: "twitter" as const, sourceId: "100" };
      orm
        .insert(schema.deletedSourceIds)
        .values(again)
        .onConflictDoNothing()
        .run();
      expect(
        db.prepare("SELECT source_id FROM deleted_source_ids").all(),
      ).toEqual([{ source_id: "100" }]);
    } finally {
      db.close();
    }
  });

  it("indexes split posts so post lookups skip a full scan", () => {
    const db = new Database(":memory:");
    try {
      migratePond(db);
      const where = buildWhere({
        combinator: "and",
        rules: [{ field: "post", operator: "eq", value: "instagram:DAbC" }],
      });
      if (!where) throw new Error("Expected a post predicate");
      const compiled = new SQLiteSyncDialect().sqlToQuery(where);
      const plan = db
        .prepare(`EXPLAIN QUERY PLAN SELECT id FROM saves WHERE ${compiled.sql}`)
        .all(...compiled.params)
        .map((row) => z.object({ detail: z.string() }).parse(row).detail);
      expect(plan.join("\n")).toContain("saves_split_post_idx");
    } finally {
      db.close();
    }
  });

  it("creates scheduler indexes and reruns without changes", () => {
    const root = mkdtempSync(join(tmpdir(), "pond-migration-"));
    try {
      const created = new Database(join(root, "index.db"));
      migratePond(created);
      const schemaSql = () =>
        created
          .prepare("SELECT name, sql FROM sqlite_master ORDER BY name")
          .all();
      const before = schemaSql();
      migratePond(created);
      expect(schemaSql()).toEqual(before);

      const indexes = created
        .prepare("PRAGMA index_list(tasks)")
        .all()
        .map((row) => z.object({ name: z.string() }).parse(row).name);
      expect(indexes).toEqual(
        expect.arrayContaining([
          "tasks_claim_idx",
          "tasks_generation_idx",
          "tasks_running_lease_idx",
          "tasks_source_op_idx",
        ]),
      );
      expect(
        created
          .prepare("PRAGMA index_list(saves)")
          .all()
          .map((row) => z.object({ name: z.string() }).parse(row).name),
      ).toContain("saves_split_post_idx");
      created.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
