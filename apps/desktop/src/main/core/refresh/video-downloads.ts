import {
  type NewTask,
  type Op,
  type Source,
  saves,
  tasks,
} from "@pond/schema/db";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { isVideoFile } from "@shared/media-index";
import { and, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import {
  type TaskPayload,
  TaskPayloadSchema,
  withInteractivePriority,
} from "../pipeline/priority";
import { kickReconciler } from "../pipeline/reconciler-client";
import { expectedVideoDownloads, maxAttemptsFor } from "../pipeline/specs";
import { runEnsurePoster } from "../pipeline/workers/ensure-poster";

const VIDEO_FOLLOW_UPS = [
  "fetch_video_ytdlp",
  "ensure_poster",
  "finalize",
] as const;

/** Stays well under SQLite's bound-parameter limit for `inArray`. */
const ID_BATCH = 500;

interface VideoDownloadRuntime {
  getDb: () => Promise<Db>;
  kickReconciler: () => void;
  persistSave: typeof persistSave;
  ensurePoster: (saveId: string) => Promise<void>;
}

const defaultRuntime: VideoDownloadRuntime = {
  getDb,
  kickReconciler,
  persistSave,
  ensurePoster: (saveId) => runEnsurePoster(saveId),
};

interface QueueVideoDownloadOptions {
  /** Interactive tasks bypass the pipeline pause, so bulk requests must stay background. */
  interactive: boolean;
  download?: DownloadRequest;
}

interface SaveRef {
  id: string;
  source: Source;
}

export async function findSavesMissingVideo(
  source?: Source,
  runtime: VideoDownloadRuntime = defaultRuntime,
): Promise<string[]> {
  const db = await runtime.getDb();
  const rows = db
    .select({
      id: saves.id,
      files: saves.files,
      mediaType: saves.mediaType,
      rawJson: saves.rawJson,
    })
    .from(saves)
    .where(
      and(
        isNull(saves.deletedAt),
        ne(saves.source, "local"),
        source ? eq(saves.source, source) : undefined,
      ),
    )
    .all();
  return rows
    .filter(
      (row) =>
        expectedVideoDownloads(row) >
        (row.files ?? []).filter(isVideoFile).length,
    )
    .map((row) => row.id);
}

export async function queueVideoDownloads(
  saveIds: readonly string[],
  options: QueueVideoDownloadOptions,
  runtime: VideoDownloadRuntime = defaultRuntime,
): Promise<number> {
  if (saveIds.length === 0) return 0;
  const db = await runtime.getDb();
  const now = new Date();
  let queued = 0;
  for (const batch of batches(saveIds)) {
    queued += requestIngestingDownloads(db, batch, options, now);
    queued += await reopenSettledSaves(db, batch, options, now, runtime);
  }
  if (queued > 0) runtime.kickReconciler();
  return queued;
}

export async function removeVideos(
  saveIds: readonly string[],
  runtime: VideoDownloadRuntime = defaultRuntime,
): Promise<number> {
  const db = await runtime.getDb();
  let removed = 0;
  for (const batch of batches(saveIds)) {
    const rows = db
      .select({ id: saves.id, files: saves.files })
      .from(saves)
      .where(
        and(
          inArray(saves.id, batch),
          ne(saves.source, "local"),
          isNull(saves.deletedAt),
        ),
      )
      .all();
    for (const row of rows) {
      const files = row.files ?? [];
      if (!files.some((file) => file.kind === "video")) continue;
      await runtime.persistSave(
        row.id,
        {},
        {
          actorReason: "user:remove-video",
          replaceFilesWithKind: ["video", "subtitle"],
        },
      );
      removed += 1;
      if (files.some((file) => file.kind === "poster")) continue;
      void runtime.ensurePoster(row.id).catch((error) => {
        log.warn("[pond video-downloads] poster fetch failed", row.id, error);
      });
    }
  }
  return removed;
}

function requestIngestingDownloads(
  db: Db,
  saveIds: string[],
  options: QueueVideoDownloadOptions,
  now: Date,
): number {
  return db.$raw
    .transaction(() => {
      const ingesting = db
        .select({ id: saves.id, source: saves.source })
        .from(saves)
        .where(
          and(
            inArray(saves.id, saveIds),
            eq(saves.status, "ingesting"),
            isNull(saves.deletedAt),
          ),
        )
        .all();
      if (ingesting.length === 0) return 0;
      const followUps = db
        .select({
          id: tasks.id,
          saveId: tasks.saveId,
          op: tasks.op,
          status: tasks.status,
          payload: tasks.payload,
        })
        .from(tasks)
        .where(
          and(
            inArray(
              tasks.saveId,
              ingesting.map((row) => row.id),
            ),
            inArray(tasks.op, [...VIDEO_FOLLOW_UPS]),
          ),
        )
        .all();
      let requested = 0;
      for (const save of ingesting) {
        const own = followUps.filter((task) => task.saveId === save.id);
        const video = own.find((task) => task.op === "fetch_video_ytdlp");
        if (video?.status === "pending" || video?.status === "deferred") {
          db.update(tasks)
            .set({
              payload: requestedPayload(
                TaskPayloadSchema.parse(video.payload),
                options,
              ),
              updatedAt: now,
            })
            .where(eq(tasks.id, video.id))
            .run();
          requested += 1;
          continue;
        }
        if (video && video.status !== "done") continue;
        /** Only finalize settles an ingesting save, and a running one would orphan the reset download. */
        if (!own.some((task) => task.op === "finalize")) continue;
        if (own.some((task) => task.status === "running")) continue;
        requestTask(
          db,
          save,
          "fetch_video_ytdlp",
          video?.id,
          requestedPayload({}, options),
          now,
        );
        for (const task of own) {
          if (task.op === "fetch_video_ytdlp" || task.status !== "done")
            continue;
          requestTask(db, save, task.op, task.id, undefined, now);
        }
        requested += 1;
      }
      return requested;
    })
    .immediate();
}

async function reopenSettledSaves(
  db: Db,
  saveIds: string[],
  options: QueueVideoDownloadOptions,
  now: Date,
  runtime: VideoDownloadRuntime,
): Promise<number> {
  /** Claims require an ingesting save, so settled saves reopen to run the download. */
  const settled = db
    .select({ id: saves.id, source: saves.source })
    .from(saves)
    .where(
      and(
        inArray(saves.id, saveIds),
        inArray(saves.status, ["complete", "failed"]),
        isNull(saves.deletedAt),
      ),
    )
    .all();
  if (settled.length === 0) return 0;
  const settledIds = settled.map((row) => row.id);
  /** A non-done earlier task holds the sequential gate, so the download would never run. */
  const blocked = new Set(
    db
      .select({ saveId: tasks.saveId })
      .from(tasks)
      .where(
        and(
          inArray(tasks.saveId, settledIds),
          notInArray(tasks.op, [...VIDEO_FOLLOW_UPS]),
          notInArray(tasks.status, ["done", "cancelled"]),
        ),
      )
      .all()
      .map((row) => row.saveId),
  );
  const rows = settled.filter((row) => !blocked.has(row.id));
  if (rows.length === 0) return 0;
  const existing = new Map(
    db
      .select({ id: tasks.id, saveId: tasks.saveId, op: tasks.op })
      .from(tasks)
      .where(
        and(
          inArray(
            tasks.saveId,
            rows.map((row) => row.id),
          ),
          inArray(tasks.op, [...VIDEO_FOLLOW_UPS]),
        ),
      )
      .all()
      .map((row) => [`${row.saveId}:${row.op}`, row.id]),
  );
  const requested = requestedPayload({}, options);

  for (const row of rows) {
    for (const op of VIDEO_FOLLOW_UPS) {
      requestTask(
        db,
        row,
        op,
        existing.get(`${row.id}:${op}`),
        op === "fetch_video_ytdlp" ? requested : undefined,
        now,
      );
    }
    await runtime.persistSave(
      row.id,
      { status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null },
      { actorReason: "user:download-video" },
    );
  }
  return rows.length;
}

function requestedPayload(
  base: TaskPayload,
  options: QueueVideoDownloadOptions,
): NewTask["payload"] {
  const { download: _previous, ...rest } = base;
  const payload = options.download
    ? { ...rest, requested: true, download: options.download }
    : { ...rest, requested: true };
  return options.interactive ? withInteractivePriority(payload) : payload;
}

function requestTask(
  db: Db,
  save: SaveRef,
  op: Op,
  existingId: string | undefined,
  payload: NewTask["payload"],
  now: Date,
): void {
  if (existingId) {
    db.update(tasks)
      .set({
        status: "pending",
        attempts: 0,
        maxAttempts: maxAttemptsFor(op),
        payload,
        generationId: null,
        lastError: null,
        nextRunAt: now,
        updatedAt: now,
      })
      .where(eq(tasks.id, existingId))
      .run();
    return;
  }
  const task: NewTask = {
    id: ulid(),
    saveId: save.id,
    source: save.source,
    op,
    status: "pending",
    attempts: 0,
    maxAttempts: maxAttemptsFor(op),
    payload,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(tasks).values(task).onConflictDoNothing().run();
}

function batches(ids: readonly string[]): string[][] {
  const out: string[][] = [];
  for (let start = 0; start < ids.length; start += ID_BATCH) {
    out.push(ids.slice(start, start + ID_BATCH));
  }
  return out;
}
