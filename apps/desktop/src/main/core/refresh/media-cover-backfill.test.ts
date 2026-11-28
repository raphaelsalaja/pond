import { saves, tasks } from "@pond/schema/db";
import type {
  NewSave,
  NewTask,
  Op,
  SaveFile,
  Source,
  TaskStatus,
} from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { wrapSqlite } from "../../database/client";
import { initializePondSchema } from "../../db";
import {
  needsMediaCoverRepair,
  startMediaCoverBackfill,
} from "./media-cover-backfill";

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

const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

const MEDIA_FILE: SaveFile = {
  kind: "image",
  path: "media-1.png",
  sha256: "m",
  size: 1,
};

/** Repairs succeed or fail the way the real harvest and fetch do: by writing an image, or by throwing. */
function setup(outcome: "fixed" | "still-medialess" | "throws" = "fixed") {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const repaired: Array<string> = [];
  const runtime = {
    getDb: async () => db,
    async repair(id: string) {
      repaired.push(id);
      if (outcome === "throws") throw new Error("github repository is gone");
      if (outcome === "fixed") {
        const row = db
          .select({ files: saves.files })
          .from(saves)
          .where(eq(saves.id, id))
          .get();
        db.update(saves)
          .set({ files: [...(row?.files ?? []), MEDIA_FILE] })
          .where(eq(saves.id, id))
          .run();
      }
    },
  };
  return { db, runtime, repaired };
}

const TEXT_COVERS: Array<SaveFile> = [
  { kind: "thumbnail", path: "thumbnail.png", sha256: "t", size: 1 },
  { kind: "thumbnail_dark", path: "thumbnail-dark.png", sha256: "d", size: 1 },
];

function medialessSave(
  id: string,
  source: Source,
  capture: Parameters<typeof storedAsRawJson>[0]["capture"],
  files: Array<SaveFile> = TEXT_COVERS,
): NewSave {
  return {
    id,
    source,
    sourceId: id,
    url: `https://example.com/${id}`,
    status: "complete",
    files,
    rawJson: storedAsRawJson({ capture }),
  };
}

function taskRow(
  saveId: string,
  op: Op,
  status: TaskStatus,
  payload?: NewTask["payload"],
): NewTask {
  const now = new Date();
  return {
    id: `${saveId}-${op}`,
    saveId,
    source: "github",
    op,
    status,
    payload,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

const EXHAUSTED = {
  at: "2026-11-27T14:57:50.000Z",
  urls: ["https://example.com/og.png"],
};

describe("needsMediaCoverRepair", () => {
  it("repairs a github save with no media on disk", () => {
    expect(
      needsMediaCoverRepair({
        source: "github",
        files: TEXT_COVERS,
        exhausted: false,
      }),
    ).toBe(true);
  });

  it("repairs a save of any source carrying the exhaustion marker", () => {
    expect(
      needsMediaCoverRepair({
        source: "web",
        files: TEXT_COVERS,
        exhausted: true,
      }),
    ).toBe(true);
  });

  it("leaves other medialess saves alone, since their media may really be gone", () => {
    expect(
      needsMediaCoverRepair({
        source: "twitter",
        files: TEXT_COVERS,
        exhausted: false,
      }),
    ).toBe(false);
  });

  it("leaves saves with original media on disk alone", () => {
    expect(
      needsMediaCoverRepair({
        source: "github",
        files: [...TEXT_COVERS, MEDIA_FILE],
        exhausted: true,
      }),
    ).toBe(false);
  });

  it("ignores local saves", () => {
    expect(
      needsMediaCoverRepair({ source: "local", files: [], exhausted: true }),
    ).toBe(false);
  });
});

function taskFor(db: ReturnType<typeof setup>["db"], saveId: string, op: Op) {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.saveId, saveId), eq(tasks.op, op)))
    .get();
}

function saveStatus(db: ReturnType<typeof setup>["db"], id: string) {
  return db
    .select({ status: saves.status })
    .from(saves)
    .where(eq(saves.id, id))
    .get()?.status;
}

const githubMedialess = medialessSave("a", "github", { media: [] });

describe.skipIf(!nativeSqliteAvailable())("startMediaCoverBackfill", () => {
  it("repairs a github text-cover save in place and records the attempt", async () => {
    const { db, runtime, repaired } = setup("fixed");
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values(taskRow("a", "harvest_metadata", "done", { force: true }))
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      attempted: 1,
      repaired: 1,
    });
    expect(repaired).toEqual(["a"]);
    expect(saveStatus(db, "a")).toBe("complete");
    expect(taskFor(db, "a", "harvest_metadata")?.payload).toEqual({
      force: true,
      mediaRepair: 1,
    });
  });

  it("leaves the Save complete and as it was when the repair fails", async () => {
    const { db, runtime } = setup("throws");
    db.insert(saves).values(githubMedialess).run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      attempted: 1,
      repaired: 0,
    });
    const row = db.select().from(saves).where(eq(saves.id, "a")).get();
    expect(row?.status).toBe("complete");
    expect(row?.files).toEqual(TEXT_COVERS);
    expect(taskFor(db, "a", "harvest_metadata")).toMatchObject({
      status: "done",
      payload: { mediaRepair: 1 },
    });
  });

  it("does not count a repair that still left no media", async () => {
    const { db, runtime } = setup("still-medialess");
    db.insert(saves).values(githubMedialess).run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      attempted: 1,
      repaired: 0,
    });
  });

  it("repairs a non-github save only when it carries the exhaustion marker", async () => {
    const { db, runtime, repaired } = setup("fixed");
    db.insert(saves)
      .values([
        medialessSave("marked", "twitter", {
          media: [{ type: "image", url: "https://pbs.twimg.com/media/a.jpg" }],
          extras: { mediaFetchExhausted: EXHAUSTED },
        }),
        medialessSave("unmarked", "twitter", {
          media: [{ type: "image", url: "https://pbs.twimg.com/media/b.jpg" }],
        }),
      ])
      .run();

    await startMediaCoverBackfill(runtime);
    expect(repaired).toEqual(["marked"]);
  });

  it("skips a save the pipeline is still working on", async () => {
    const { db, runtime, repaired } = setup("fixed");
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values(taskRow("a", "fetch_blobs", "pending"))
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      attempted: 0,
      repaired: 0,
    });
    expect(repaired).toEqual([]);
  });

  it("stops after two repair attempts", async () => {
    const { db, runtime, repaired } = setup("throws");
    db.insert(saves).values(githubMedialess).run();

    await startMediaCoverBackfill(runtime);
    await startMediaCoverBackfill(runtime);
    await startMediaCoverBackfill(runtime);
    expect(repaired).toEqual(["a", "a"]);
    expect(taskFor(db, "a", "harvest_metadata")?.payload).toEqual({
      mediaRepair: 2,
    });
  });

  it("leaves failed, trashed, and healthy saves untouched", async () => {
    const { db, runtime, repaired } = setup("fixed");
    db.insert(saves)
      .values([
        {
          ...medialessSave("failed", "github", { media: [] }),
          status: "failed",
        },
        {
          ...medialessSave("trashed", "github", { media: [] }),
          deletedAt: new Date(),
        },
        medialessSave("healthy", "github", { media: [] }, [
          ...TEXT_COVERS,
          MEDIA_FILE,
        ]),
      ])
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      attempted: 0,
      repaired: 0,
    });
    expect(repaired).toEqual([]);
  });
});
