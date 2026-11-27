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
import type { persistSave } from "../persist-save";
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

type PersistOptions = Parameters<typeof persistSave>[2];

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const kicks: Array<number> = [];
  const persisted: Array<{ id: string; options: PersistOptions }> = [];
  const runtime = {
    getDb: async () => db,
    kickReconciler: () => {
      kicks.push(Date.now());
    },
    async persistSave(
      id: string,
      patch: Partial<NewSave>,
      options: PersistOptions,
    ) {
      persisted.push({ id, options });
      db.update(saves).set(patch).where(eq(saves.id, id)).run();
      return null;
    },
  };
  return { db, runtime, kicks, persisted };
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

describe("needsMediaCoverRepair", () => {
  it("repairs a text-cover save whose capture lists image urls", () => {
    expect(
      needsMediaCoverRepair({
        source: "twitter",
        files: TEXT_COVERS,
        rawJson: storedAsRawJson({
          capture: {
            media: [
              { type: "image", url: "https://pbs.twimg.com/media/a.jpg" },
            ],
          },
        }),
      }),
    ).toBe(true);
  });

  it("leaves a genuinely medialess post alone", () => {
    expect(
      needsMediaCoverRepair({
        source: "twitter",
        files: TEXT_COVERS,
        rawJson: storedAsRawJson({ capture: { media: [] } }),
      }),
    ).toBe(false);
  });

  it("repairs a github save whose capture recorded no media", () => {
    expect(
      needsMediaCoverRepair({
        source: "github",
        files: TEXT_COVERS,
        rawJson: storedAsRawJson({ capture: { media: [] } }),
      }),
    ).toBe(true);
  });

  it("repairs a save carrying the exhaustion marker", () => {
    expect(
      needsMediaCoverRepair({
        source: "web",
        files: TEXT_COVERS,
        rawJson: storedAsRawJson({
          capture: {
            media: [],
            extras: {
              mediaFetchExhausted: {
                at: "2026-11-27T14:57:50.000Z",
                urls: ["https://example.com/og.png"],
              },
            },
          },
        }),
      }),
    ).toBe(true);
  });

  it("leaves saves with original media on disk alone", () => {
    expect(
      needsMediaCoverRepair({
        source: "github",
        files: [
          ...TEXT_COVERS,
          { kind: "image", path: "media-1.png", sha256: "m", size: 1 },
        ],
        rawJson: storedAsRawJson({
          capture: {
            media: [
              {
                type: "image",
                url: "https://opengraph.githubassets.com/1/os6/x-minimal",
              },
            ],
          },
        }),
      }),
    ).toBe(false);
  });

  it("ignores video-only evidence, since video downloads are optional and removable", () => {
    expect(
      needsMediaCoverRepair({
        source: "twitter",
        files: TEXT_COVERS,
        rawJson: storedAsRawJson({
          capture: {
            media: [
              {
                type: "video",
                url: "https://video.twimg.com/ext_tw_video/1/vid/b.mp4",
              },
            ],
          },
        }),
      }),
    ).toBe(false);
  });

  it("ignores local saves and captures that never harvested", () => {
    expect(
      needsMediaCoverRepair({
        source: "local",
        files: [],
        rawJson: null,
      }),
    ).toBe(false);
    expect(
      needsMediaCoverRepair({ source: "github", files: [], rawJson: null }),
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
  it("reopens a broken save with a forced harvest, refetch, and finalize", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves).values(githubMedialess).run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 1,
    });

    const harvest = taskFor(db, "a", "harvest_metadata");
    expect(harvest?.status).toBe("pending");
    expect(harvest?.payload).toEqual({ force: true, mediaRepair: 1 });
    expect(taskFor(db, "a", "fetch_blobs")?.status).toBe("pending");
    expect(taskFor(db, "a", "finalize")?.status).toBe("pending");
    expect(saveStatus(db, "a")).toBe("ingesting");
    expect(kicks).toHaveLength(1);
  });

  it("resets a dead fetch_blobs task so the retry can run", async () => {
    const { db, runtime } = setup();
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values({
        ...taskRow("a", "fetch_blobs", "dead"),
        attempts: 7,
        maxAttempts: 7,
        lastError: "fetch-blobs: 1/1 media permanently unavailable",
      })
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 1,
    });
    const fetch = taskFor(db, "a", "fetch_blobs");
    expect(fetch?.status).toBe("pending");
    expect(fetch?.attempts).toBe(0);
    expect(fetch?.lastError).toBeNull();
  });

  it("skips a save whose unfinished earlier tasks would block the gate", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values(taskRow("a", "render_text_cover", "dead"))
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 0,
    });
    expect(taskFor(db, "a", "harvest_metadata")).toBeUndefined();
    expect(saveStatus(db, "a")).toBe("complete");
    expect(kicks).toHaveLength(0);
  });

  it("stops re-opening a save after two failed repair attempts", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values(
        taskRow("a", "harvest_metadata", "done", {
          force: true,
          mediaRepair: 2,
        }),
      )
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 0,
    });
    expect(saveStatus(db, "a")).toBe("complete");
    expect(kicks).toHaveLength(0);
  });

  it("counts a second repair pass on top of the first", async () => {
    const { db, runtime } = setup();
    db.insert(saves).values(githubMedialess).run();
    db.insert(tasks)
      .values(
        taskRow("a", "harvest_metadata", "done", {
          force: true,
          mediaRepair: 1,
        }),
      )
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 1,
    });
    expect(taskFor(db, "a", "harvest_metadata")?.payload).toEqual({
      force: true,
      mediaRepair: 2,
    });
  });

  it("leaves healthy and genuinely medialess saves untouched", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves)
      .values([
        medialessSave("a", "twitter", { media: [] }),
        medialessSave("b", "twitter", {
          media: [{ type: "image", url: "https://pbs.twimg.com/media/a.jpg" }],
        }),
      ])
      .run();
    db.update(saves)
      .set({
        files: [
          ...TEXT_COVERS,
          { kind: "image", path: "media-1.png", sha256: "m", size: 1 },
        ],
      })
      .where(eq(saves.id, "b"))
      .run();

    expect(await startMediaCoverBackfill(runtime)).toEqual({
      ok: true,
      repaired: 0,
    });
    expect(kicks).toHaveLength(0);
    expect(saveStatus(db, "a")).toBe("complete");
  });
});
