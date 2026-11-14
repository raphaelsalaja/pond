import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import type { JsonObject } from "@pond/schema/json";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BulkEdit } from "../../shared/bulk-contracts";
import { initializePondSchema } from "../db";
import type { ApiRuntime, FolderAssignment } from "./api-runtime";
import { libraryRoutes } from "./library";
import { savesRoutes } from "./saves";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

function library() {
  const sqlite = new Database(":memory:");
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...eventsSchema } }),
    { $raw: sqlite },
  );
  const bulkEdits: BulkEdit[] = [];
  const assignments: FolderAssignment[] = [];
  const runtime: ApiRuntime = {
    getDb: async () => db,
    libraryId: () => "lib-1",
    async bulkEdit(input) {
      bulkEdits.push(input);
      const { operation } = input;
      if (operation.kind === "tags" && operation.mode === "add") {
        const rows = db.select().from(schema.saves).all();
        for (const row of rows.filter((entry) => input.ids.includes(entry.id)))
          sqlite
            .prepare("UPDATE saves SET tags = ? WHERE id = ?")
            .run(
              JSON.stringify([...new Set([...row.tags, ...operation.tags])]),
              row.id,
            );
      }
      return { changed: input.ids.length };
    },
    async assignFolders(input) {
      assignments.push(input);
    },
  };
  return { sqlite, runtime, bulkEdits, assignments };
}

type Library = ReturnType<typeof library>;

interface SaveColumns {
  title?: string;
  tags?: string[];
  status?: string;
  source?: string;
  notes?: string;
  ocr_text?: string;
  transcript?: string;
  deleted_at?: number;
  favorite?: number;
}

function seed(lib: Library, id: string, columns: SaveColumns = {}) {
  const values = {
    id,
    source: "twitter",
    source_id: id,
    url: `https://x.com/pond/status/${id}`,
    status: "complete",
    saved_at: 1_700_000_000_000,
    ...columns,
    tags: JSON.stringify(columns.tags ?? []),
  };
  const names = Object.keys(values);
  lib.sqlite
    .prepare(
      `INSERT INTO saves (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    )
    .run(...Object.values(values));
}

function post(lib: Library, path: string, body: JsonObject) {
  return savesRoutes(lib.runtime).request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!nativeSqliteAvailable())("Local API", () => {
  let lib: Library;

  beforeEach(() => {
    lib = library();
  });

  afterEach(() => lib.sqlite.close());

  const get = (path: string) => savesRoutes(lib.runtime).request(path);

  it("returns the public Save shape", async () => {
    seed(lib, "a", { title: "Pond", ocr_text: "hello", tags: ["design"] });
    const response = await get("/info?id=a");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      id: "a",
      libraryId: "lib-1",
      source: "twitter",
      title: "Pond",
      tags: ["design"],
      folderIds: [],
      status: "complete",
      savedAt: 1_700_000_000_000,
      deletedAt: null,
      favorite: false,
      thumbnail: false,
      text: { caption: false, ocr: true, transcript: false },
    });
  });

  it("reports a missing Save with save_not_found", async () => {
    const response = await get("/text?id=nope");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("save_not_found");
  });

  it("refuses requests pinned to another Library", async () => {
    seed(lib, "a");
    const response = await get("/info?id=a&libraryId=other");
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("library_mismatch");
  });

  it("returns extracted text", async () => {
    seed(lib, "a", { transcript: "spoken words", notes: "mine" });
    const response = await get("/text?id=a");
    expect((await response.json()).data).toMatchObject({
      id: "a",
      note: "mine",
      transcript: "spoken words",
      ocr: "",
    });
  });

  it("reports capture progress for each Save", async () => {
    seed(lib, "a", { status: "ingesting" });
    lib.sqlite
      .prepare(
        `INSERT INTO tasks (
          id, save_id, source, op, status, attempts, max_attempts,
          next_run_at, created_at, updated_at
        ) VALUES ('t1', 'a', 'twitter', 'harvest_metadata', 'pending', 0, 5, 0, 0, 0)`,
      )
      .run();
    const response = await get("/status?ids=a,missing");
    expect((await response.json()).data).toEqual([
      expect.objectContaining({
        id: "a",
        status: "ingesting",
        deleted: false,
        pendingTasks: 1,
        failedTasks: 0,
      }),
    ]);
  });

  it("rejects an unknown thumbnail size", async () => {
    seed(lib, "a");
    expect((await get("/thumb?id=a&size=huge")).status).toBe(422);
  });

  it("answers no_thumbnail when the Save has no image", async () => {
    seed(lib, "a");
    const response = await get("/thumb?id=a&size=small");
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("no_thumbnail");
  });

  it("adds tags and counts only Saves that changed", async () => {
    seed(lib, "a", { tags: ["design"] });
    seed(lib, "b");
    const response = await post(lib, "/tags", {
      ids: ["a", "b"],
      add: ["design"],
    });
    expect((await response.json()).data).toEqual({ changed: 1 });
    expect(lib.bulkEdits[0]).toMatchObject({ actorReason: "api:tags" });
  });

  it("refuses edits that name a missing Save", async () => {
    seed(lib, "a");
    const response = await post(lib, "/trash", { ids: ["a", "ghost"] });
    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toContain("ghost");
    expect(lib.bulkEdits).toEqual([]);
  });

  it("refuses folder edits that name a missing folder", async () => {
    seed(lib, "a");
    const response = await post(lib, "/folders", {
      ids: ["a"],
      add: ["nope"],
    });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("folder_not_found");
    expect(lib.assignments).toEqual([]);
  });

  it("reads and writes favorites", async () => {
    seed(lib, "a", { favorite: 1 });
    seed(lib, "b");
    const favorite = async (id: string) =>
      (await (await get(`/info?id=${id}`)).json()).data.favorite;
    expect(await favorite("a")).toBe(true);
    expect(await favorite("b")).toBe(false);

    const response = await post(lib, "/favorite", {
      ids: ["b"],
      favorite: true,
    });
    expect((await response.json()).data).toEqual({ changed: 1 });
    expect(lib.bulkEdits).toEqual([
      {
        ids: ["b"],
        operation: { kind: "favorite", favorite: true },
        actorReason: "api:favorite",
      },
    ]);

    const invalid = await post(lib, "/favorite", { ids: ["a"], favorite: 1 });
    expect(invalid.status).toBe(422);
  });

  it("validates ratings", async () => {
    seed(lib, "a");
    const response = await post(lib, "/rating", { ids: ["a"], rating: 9 });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("invalid_request");
  });

  it("counts tags and sources on live Saves only", async () => {
    seed(lib, "a", { tags: ["design", "type"] });
    seed(lib, "b", { tags: ["design"] });
    seed(lib, "c", { source: "web", tags: ["type"] });
    seed(lib, "trashed", { source: "web", tags: ["design"], deleted_at: 1 });
    const routes = libraryRoutes(lib.runtime);
    expect((await (await routes.request("/tags")).json()).data).toEqual([
      { name: "design", count: 2, starred: false },
      { name: "type", count: 2, starred: false },
    ]);
    expect((await (await routes.request("/sources")).json()).data).toEqual([
      { source: "twitter", count: 2 },
      { source: "web", count: 1 },
    ]);
  });
});
