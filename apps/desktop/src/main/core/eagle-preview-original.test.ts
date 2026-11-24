import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { eventTables, libraryTables } from "../database/tables";
import { initializePondSchema } from "../db";
import { findEaglePreviewOriginal } from "./library-integrity";

function nativeAvailable(): boolean {
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

const opened: Array<Database.Database> = [];
afterEach(() => {
  for (const db of opened.splice(0)) {
    db.close();
  }
});

const INSERT =
  "INSERT INTO saves (id, source, source_id, url, status, title, imported_from, media_type, deleted_at) VALUES (?, 'local', ?, 'pond:test', 'complete', ?, ?, ?, ?)";

function library(
  rows: Array<{
    id: string;
    title: string;
    importedFrom?: string | null;
    mediaType?: string;
    deletedAt?: number | null;
  }>,
) {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  const insert = raw.prepare(INSERT);
  for (const row of rows) {
    insert.run(
      row.id,
      row.id,
      row.title,
      row.importedFrom === undefined ? "eagle" : row.importedFrom,
      row.mediaType ?? "image",
      row.deletedAt ?? null,
    );
  }
  return Object.assign(
    drizzle(raw, { schema: { ...libraryTables, ...eventTables } }),
    {
      $raw: raw,
    },
  );
}

describe.skipIf(!nativeAvailable())("findEaglePreviewOriginal", () => {
  it("finds the Eagle Save a preview was exported from, ignoring case", () => {
    const db = library([
      { id: "original", title: "Sunset", mediaType: "video" },
      { id: "preview", title: "sunset_thumbnail" },
    ]);

    expect(findEaglePreviewOriginal(db, "preview")).toEqual({
      id: "original",
      title: "Sunset",
    });
  });

  it("keeps a preview whose original is in Trash or not from Eagle", () => {
    const db = library([
      { id: "trashed", title: "Sunset", deletedAt: 1 },
      { id: "web", title: "Sunset", importedFrom: null },
      { id: "preview", title: "Sunset_thumbnail" },
    ]);

    expect(findEaglePreviewOriginal(db, "preview")).toBeNull();
  });

  it("only treats Eagle images as previews", () => {
    const db = library([
      { id: "original", title: "Sunset" },
      { id: "video", title: "Sunset_thumbnail", mediaType: "video" },
      { id: "web", title: "Sunset_thumbnail", importedFrom: null },
    ]);

    expect(findEaglePreviewOriginal(db, "video")).toBeNull();
    expect(findEaglePreviewOriginal(db, "web")).toBeNull();
  });
});
