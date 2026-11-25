import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializePondSchema } from "./db";

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

describe.skipIf(!nativeSqliteAvailable())(
  "Pond database initialization",
  () => {
    it("initializes a fresh library before installing the vector delete trigger", () => {
      const db = new Database(":memory:");
      try {
        expect(initializePondSchema(db)).toBe(true);
        expect(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'saves_vec_ad'",
            )
            .get(),
        ).toEqual({ name: "saves_vec_ad" });
        db.prepare(
          "INSERT INTO saves (id, source, source_id, url) VALUES (?, ?, ?, ?)",
        ).run("first", "web", "first", "https://example.com");
        expect(() =>
          db.prepare("DELETE FROM saves WHERE id = ?").run("first"),
        ).not.toThrow();
      } finally {
        db.close();
      }
    });

    it("preserves saved rows when initialized again", () => {
      const db = new Database(":memory:");
      try {
        initializePondSchema(db);
        db.prepare(
          "INSERT INTO saves (id, source, source_id, url) VALUES (?, ?, ?, ?)",
        ).run("kept", "web", "kept", "https://example.com");
        expect(initializePondSchema(db)).toBe(true);
        expect(db.prepare("SELECT id FROM saves").all()).toEqual([
          { id: "kept" },
        ]);
      } finally {
        db.close();
      }
    });

    it("opens a usable library without vector tables when the extension is unavailable", () => {
      const db = new Database(":memory:");
      try {
        expect(initializePondSchema(db, () => false)).toBe(false);
        expect(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE name IN ('vec_meta', 'saves_vec_ad')",
            )
            .all(),
        ).toEqual([]);
        db.prepare(
          "INSERT INTO saves (id, source, source_id, url) VALUES (?, ?, ?, ?)",
        ).run("lexical", "web", "lexical", "https://example.com");
        expect(db.prepare("SELECT id FROM saves").all()).toEqual([
          { id: "lexical" },
        ]);
      } finally {
        db.close();
      }
    });
  },
);
