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
  findSavesMissingVideo,
  queueVideoDownloads,
  removeVideos,
} from "./video-downloads";

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

const databases: Array<Database.Database> = [];

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
});

function setup() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = wrapSqlite(sqlite);
  const kicks: Array<number> = [];
  const persisted: Array<{ id: string; options: PersistOptions }> = [];
  const posters: Array<string> = [];
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
      const replaced = [options.replaceFilesWithKind ?? []].flat();
      const files =
        replaced.length > 0
          ? db
              .select({ files: saves.files })
              .from(saves)
              .where(eq(saves.id, id))
              .get()
              ?.files.filter((file) => !replaced.includes(file.kind))
          : undefined;
      db.update(saves)
        .set(files ? { ...patch, files } : patch)
        .where(eq(saves.id, id))
        .run();
      return null;
    },
    async ensurePoster(id: string) {
      posters.push(id);
    },
  };
  return { db, runtime, kicks, persisted, posters };
}

type PersistOptions = Parameters<typeof persistSave>[2];

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
    source: "youtube",
    op,
    status,
    payload,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function videoSave(
  id: string,
  source: Source,
  files: Array<SaveFile> = [],
): NewSave {
  return {
    id,
    source,
    sourceId: id,
    url: `https://example.com/${id}`,
    mediaType: "video",
    status: "complete",
    files,
    rawJson: storedAsRawJson({
      capture: { media: [{ type: "video", url: `https://example.com/${id}` }] },
    }),
  };
}

describe.skipIf(!nativeSqliteAvailable())("findSavesMissingVideo", () => {
  it("returns only saves from the source that lack a video file", async () => {
    const { db, runtime } = setup();
    db.insert(saves)
      .values([
        videoSave("a", "youtube"),
        videoSave("b", "youtube", [
          { kind: "video", path: "video.mp4", sha256: "x", size: 1 },
        ]),
        videoSave("c", "twitter"),
      ])
      .run();
    expect(await findSavesMissingVideo("youtube", runtime)).toEqual(["a"]);
    expect((await findSavesMissingVideo(undefined, runtime)).sort()).toEqual([
      "a",
      "c",
    ]);
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

describe.skipIf(!nativeSqliteAvailable())("queueVideoDownloads", () => {
  const interactive = { interactive: true };
  const background = { interactive: false };

  it("queues a requested fetch_video_ytdlp task and reopens the save", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves).values(videoSave("a", "youtube")).run();
    expect(await queueVideoDownloads(["a"], interactive, runtime)).toBe(1);
    const video = taskFor(db, "a", "fetch_video_ytdlp");
    expect(video?.status).toBe("pending");
    expect(video?.payload).toEqual({
      requested: true,
      priority: "interactive",
    });
    expect(taskFor(db, "a", "finalize")?.status).toBe("pending");
    expect(saveStatus(db, "a")).toBe("ingesting");
    expect(kicks).toHaveLength(1);
  });

  it("queues bulk requests without interactive priority", async () => {
    const { db, runtime } = setup();
    db.insert(saves).values(videoSave("a", "youtube")).run();
    expect(await queueVideoDownloads(["a"], background, runtime)).toBe(1);
    expect(taskFor(db, "a", "fetch_video_ytdlp")?.payload).toEqual({
      requested: true,
    });
  });

  it("resets an existing done task to pending with zero attempts", async () => {
    const { db, runtime } = setup();
    db.insert(saves).values(videoSave("a", "youtube")).run();
    db.insert(tasks)
      .values({
        ...taskRow("a", "fetch_video_ytdlp", "done"),
        attempts: 3,
        maxAttempts: 5,
        lastError: "skipped",
      })
      .run();
    expect(await queueVideoDownloads(["a"], interactive, runtime)).toBe(1);
    const video = taskFor(db, "a", "fetch_video_ytdlp");
    expect(video?.id).toBe("a-fetch_video_ytdlp");
    expect(video?.status).toBe("pending");
    expect(video?.attempts).toBe(0);
    expect(video?.lastError).toBeNull();
    expect(video?.payload).toEqual({
      requested: true,
      priority: "interactive",
    });
  });

  it("skips failed saves whose earlier tasks would block the download", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves)
      .values({ ...videoSave("a", "youtube"), status: "failed" })
      .run();
    db.insert(tasks)
      .values(taskRow("a", "fetch_blobs", "dead"))
      .run();
    expect(await queueVideoDownloads(["a"], interactive, runtime)).toBe(0);
    expect(taskFor(db, "a", "fetch_video_ytdlp")).toBeUndefined();
    expect(kicks).toHaveLength(0);
  });

  it("marks a pending download on an ingesting save as requested", async () => {
    const { db, runtime, kicks, persisted } = setup();
    db.insert(saves)
      .values({ ...videoSave("a", "youtube"), status: "ingesting" })
      .run();
    db.insert(tasks)
      .values([
        taskRow("a", "fetch_video_ytdlp", "deferred", { force: true }),
        taskRow("a", "finalize", "pending"),
      ])
      .run();
    expect(await queueVideoDownloads(["a"], background, runtime)).toBe(1);
    expect(taskFor(db, "a", "fetch_video_ytdlp")).toMatchObject({
      status: "deferred",
      payload: { force: true, requested: true },
    });
    expect(persisted).toHaveLength(0);
    expect(kicks).toHaveLength(1);
  });

  it("reruns a skipped download before finalize on an ingesting save", async () => {
    const { db, runtime } = setup();
    db.insert(saves)
      .values({ ...videoSave("a", "youtube"), status: "ingesting" })
      .run();
    db.insert(tasks)
      .values([
        taskRow("a", "fetch_video_ytdlp", "done"),
        taskRow("a", "ensure_poster", "done"),
        taskRow("a", "finalize", "pending"),
      ])
      .run();
    expect(await queueVideoDownloads(["a"], interactive, runtime)).toBe(1);
    expect(taskFor(db, "a", "fetch_video_ytdlp")).toMatchObject({
      status: "pending",
      payload: { requested: true, priority: "interactive" },
    });
    expect(taskFor(db, "a", "ensure_poster")?.status).toBe("pending");
    expect(taskFor(db, "a", "finalize")?.status).toBe("pending");
    expect(saveStatus(db, "a")).toBe("ingesting");
  });

  it("leaves a skipped download alone while finalize is running", async () => {
    const { db, runtime, kicks } = setup();
    db.insert(saves)
      .values({ ...videoSave("a", "youtube"), status: "ingesting" })
      .run();
    db.insert(tasks)
      .values([
        taskRow("a", "fetch_video_ytdlp", "done"),
        taskRow("a", "finalize", "running"),
      ])
      .run();
    expect(await queueVideoDownloads(["a"], interactive, runtime)).toBe(0);
    expect(taskFor(db, "a", "fetch_video_ytdlp")?.status).toBe("done");
    expect(kicks).toHaveLength(0);
  });
});

describe.skipIf(!nativeSqliteAvailable())("removeVideos", () => {
  const video = { kind: "video", path: "video.mp4", sha256: "v", size: 1 };
  const subtitle = {
    kind: "subtitle",
    path: "video.vtt",
    sha256: "s",
    size: 1,
  };
  const poster = { kind: "poster", path: "poster.jpg", sha256: "p", size: 1 };

  it("drops video and subtitle files and fetches a poster when missing", async () => {
    const { db, runtime, persisted, posters } = setup();
    db.insert(saves)
      .values([
        videoSave("a", "youtube", [video, subtitle, poster]),
        videoSave("b", "twitter", [video]),
        videoSave("c", "local", [video]),
        videoSave("d", "youtube", [poster]),
      ])
      .run();
    expect(await removeVideos(["a", "b", "c", "d"], runtime)).toBe(2);
    expect(persisted.map((call) => call.id)).toEqual(["a", "b"]);
    expect(persisted[0]?.options.replaceFilesWithKind).toEqual([
      "video",
      "subtitle",
    ]);
    expect(posters).toEqual(["b"]);
  });
});
