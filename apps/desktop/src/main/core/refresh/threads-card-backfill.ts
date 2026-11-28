import { saves, tasks } from "@pond/schema/db";
import type { NewTask, SaveFile } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import {
  POST_RENDER_DARK_KIND,
  POST_RENDER_LIGHT_KIND,
} from "@shared/save-file-names";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import { ulid } from "ulid";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import { kickReconciler } from "../pipeline/reconciler-client";
import { maxAttemptsFor } from "../pipeline/specs";
import {
  isCaptureTweetStale,
  runCaptureTweet,
} from "../pipeline/workers/capture-tweet";

const PAGE_SIZE = 200;
const MAX_INFLIGHT = 1;
/** Bump when structured renderer support changes enough to reopen repairs that already failed. */
const POST_CARD_REPAIR_VERSION = 1;

const REPLY_RECAPTURE_OPS = ["capture_tweet", "finalize"] as const;

type PostCardScheme = "light" | "dark";
type PostCardFile = Pick<SaveFile, "kind">;

interface BackfillRow {
  id: string;
  source: "twitter" | "threads";
}

interface ReplyRecaptureRuntime {
  getDb: () => Promise<Db>;
  kickReconciler: () => void;
  persistSave: typeof persistSave;
}

interface PostCardBackfillRuntime extends ReplyRecaptureRuntime {
  runCaptureTweet: typeof runCaptureTweet;
  now: () => Date;
}

const defaultRuntime: PostCardBackfillRuntime = {
  getDb,
  kickReconciler,
  persistSave,
  runCaptureTweet,
  now: () => new Date(),
};

function postCardScheme(kind: string): PostCardScheme | null {
  if (kind === POST_RENDER_LIGHT_KIND) return "light";
  if (kind === POST_RENDER_DARK_KIND) return "dark";
  return null;
}

/**
 * Only a card recorded as a live screenshot is repaired. A Save with no
 * provenance predates it and is left alone, so upgrading never re-renders the
 * whole Library.
 */
export function needsPostCardStructuredRepair(
  rawJson: RawJson | null,
  files: ReadonlyArray<PostCardFile>,
): boolean {
  if (!rawJson?.capture) return false;
  if ((rawJson.postCardRepair?.version ?? 0) >= POST_CARD_REPAIR_VERSION) {
    return false;
  }
  return files.some((file) => {
    const scheme = postCardScheme(file.kind);
    if (!scheme) return false;
    return rawJson.postCardProvenance?.[scheme]?.renderer === "screenshot";
  });
}

export function withPostCardRepairAttempt(
  stored: RawJson | null,
  attemptedAt: string,
): RawJson | null {
  if (!stored) return null;
  return {
    ...stored,
    postCardRepair: { version: POST_CARD_REPAIR_VERSION, attemptedAt },
  };
}

/** Reads the row again so edits made while the render ran are kept. */
async function persistPostCardRepairAttempt(
  db: Db,
  id: string,
  runtime: PostCardBackfillRuntime,
): Promise<void> {
  const fresh = db
    .select({ rawJson: saves.rawJson })
    .from(saves)
    .where(eq(saves.id, id))
    .get();
  const rawJson = withPostCardRepairAttempt(
    fresh?.rawJson ?? null,
    runtime.now().toISOString(),
  );
  if (!rawJson) return;
  await runtime.persistSave(
    id,
    { rawJson },
    {
      actorReason: "pipeline:post-card-repair",
      writeInfo: true,
    },
  );
}

export async function startThreadsCardBackfill(
  runtime: PostCardBackfillRuntime = defaultRuntime,
): Promise<{
  ok: true;
  recaptured: number;
  requeued: number;
}> {
  const db = await runtime.getDb();
  let recaptured = 0;
  let offset = 0;
  const limit = pLimit(MAX_INFLIGHT);
  const jobs: Array<Promise<void>> = [];
  const liveReplies: Array<BackfillRow> = [];

  for (;;) {
    const page = db
      .select({
        id: saves.id,
        source: saves.source,
        rawJson: saves.rawJson,
        files: saves.files,
      })
      .from(saves)
      .where(
        and(
          inArray(saves.source, ["twitter", "threads", "bluesky"]),
          inArray(saves.status, ["complete", "failed"]),
          isNull(saves.deletedAt),
        ),
      )
      .limit(PAGE_SIZE)
      .offset(offset)
      .all();
    if (page.length === 0) break;
    offset += page.length;

    for (const row of page) {
      const source = row.source;
      if (
        source !== "twitter" &&
        source !== "threads" &&
        source !== "bluesky"
      ) {
        continue;
      }
      const stale = isCaptureTweetStale(row.rawJson);
      const repair = needsPostCardStructuredRepair(row.rawJson, row.files);
      if (!stale && !repair) continue;
      jobs.push(
        limit(async () => {
          try {
            const captureOptions: NonNullable<
              Parameters<typeof runCaptureTweet>[1]
            > = { nativeOnly: true };
            if (repair) captureOptions.force = true;
            const result = await runtime.runCaptureTweet(
              row.id,
              captureOptions,
            );
            if (result.captured > 0) {
              recaptured += 1;
            } else {
              if (repair)
                await persistPostCardRepairAttempt(db, row.id, runtime);
              if (
                stale &&
                source !== "bluesky" &&
                needsLiveReplyRecapture(row.rawJson)
              ) {
                liveReplies.push({ id: row.id, source });
              }
            }
          } catch (error) {
            log.warn("[pond post-card-backfill] failed", row.id, error);
            /** Without a marker, a Save that throws would be force re-rendered on every start. */
            if (repair) {
              await persistPostCardRepairAttempt(db, row.id, runtime).catch(
                (cause: unknown) =>
                  log.warn(
                    "[pond post-card-backfill] repair marker failed",
                    row.id,
                    cause,
                  ),
              );
            }
          }
        }),
      );
    }

    if (page.length < PAGE_SIZE) break;
  }

  await Promise.all(jobs);
  const requeued = await requeueReplyCaptures(liveReplies, runtime);
  if (recaptured > 0 || requeued > 0) {
    log.info("[pond post-card-backfill] recaptured", {
      recaptured,
      requeued,
    });
  }
  return { ok: true, recaptured, requeued };
}

function needsLiveReplyRecapture(rawJson: RawJson | null): boolean {
  const capture = rawJson?.capture;
  if (!capture?.replyTo) return false;
  return capture.extras?.replyRecaptureQueued !== true;
}

/** Live screenshots hit X and Threads, so each stale reply is requeued at most once. */
export async function requeueReplyCaptures(
  rows: ReadonlyArray<BackfillRow>,
  runtime: ReplyRecaptureRuntime = defaultRuntime,
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = await runtime.getDb();
  const now = new Date();
  const existingRows = db
    .select({ id: tasks.id, saveId: tasks.saveId, op: tasks.op })
    .from(tasks)
    .where(
      and(
        inArray(
          tasks.saveId,
          rows.map((row) => row.id),
        ),
        inArray(tasks.op, [...REPLY_RECAPTURE_OPS]),
      ),
    )
    .all();
  const existingByKey = new Map(
    existingRows.map((row) => [`${row.saveId}:${row.op}`, row.id]),
  );

  let queued = 0;
  for (const row of rows) {
    const rawJson = db
      .select({ rawJson: saves.rawJson })
      .from(saves)
      .where(eq(saves.id, row.id))
      .get()?.rawJson;
    if (!rawJson?.capture || !needsLiveReplyRecapture(rawJson)) continue;
    for (const op of REPLY_RECAPTURE_OPS) {
      const existingId = existingByKey.get(`${row.id}:${op}`);
      if (existingId) {
        db.update(tasks)
          .set({
            status: "pending",
            attempts: 0,
            maxAttempts: maxAttemptsFor(op),
            generationId: null,
            lastError: null,
            nextRunAt: now,
            updatedAt: now,
          })
          .where(eq(tasks.id, existingId))
          .run();
      } else {
        const taskRow: NewTask = {
          id: ulid(),
          saveId: row.id,
          source: row.source,
          op,
          status: "pending",
          attempts: 0,
          maxAttempts: maxAttemptsFor(op),
          nextRunAt: now,
          createdAt: now,
          updatedAt: now,
        };
        db.insert(tasks).values(taskRow).onConflictDoNothing().run();
      }
    }

    const next = structuredClone(rawJson);
    next.capture.extras = {
      ...next.capture.extras,
      replyRecaptureQueued: true,
    };
    await runtime.persistSave(
      row.id,
      {
        rawJson: next,
        status: "ingesting",
        ingestStartedAt: now,
        ingestCompletedAt: null,
      },
      { actorReason: "pipeline:reply-recapture-backfill" },
    );
    queued += 1;
  }

  if (queued > 0) runtime.kickReconciler();
  return queued;
}
