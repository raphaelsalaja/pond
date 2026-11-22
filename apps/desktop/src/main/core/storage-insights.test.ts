import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Db, initializePondSchema } from "../db";
import { largestSaves } from "./storage-insights";

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

function library(): Db {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  const insert = raw.prepare(
    "insert into saves(id,source,source_id,url,status,title,file_size) values(?,?,?,?,?,?,?)",
  );
  insert.run(
    "titled",
    "web",
    "titled",
    "https://example.com/harbor",
    "complete",
    "Sunset Reel",
    300,
  );
  insert.run(
    "untitled",
    "web",
    "untitled",
    "https://example.com/harbor-tour",
    "complete",
    null,
    200,
  );
  insert.run(
    "other",
    "web",
    "other",
    "https://example.com/forest",
    "complete",
    "Forest Walk",
    100,
  );
  return Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
}

function ids(db: Db, search: string) {
  return largestSaves(db, { limit: 10, search }).saves.map((save) => save.id);
}

describe.skipIf(!nativeAvailable())("largest Saves search", () => {
  it("matches the URL of a Save that has a title", () => {
    expect(ids(library(), "harbor")).toEqual(["titled", "untitled"]);
  });

  it("matches the title without regard to case", () => {
    expect(ids(library(), "sunset")).toEqual(["titled"]);
  });
});
