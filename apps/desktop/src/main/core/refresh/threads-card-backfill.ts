import { type NewTask, saves, tasks } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
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

const REPLY_RECAPTURE_OPS = ["capture_tweet", "finalize"] as const;

interface BackfillRow {
  id: string;
  source: "twitter" | "threads";
}

interface ReplyRecaptureRuntime {
  getDb: () => Promise<Db>;
  kickReconciler: () => void;
  persistSave: typeof persistSave;
}

const defaultRuntime: ReplyRecaptureRuntime = {
  getDb,
  kickReconciler,
  persistSave,
};

export async function startThreadsCardBackfill(): Promise<{
  ok: true;
  recaptured: number;
  requeued: number;
}> {
  const db = await getDb();
  let recaptured = 0;
  let offset = 0;
  const limit = pLimit(MAX_INFLIGHT);
  const jobs: Promise<void>[] = [];
  const liveReplies: BackfillRow[] = [];

  for (;;) {
    const page = db
      .select({
        id: saves.id,
        source: saves.source,
        rawJson: saves.rawJson,
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
      if (!isCaptureTweetStale(row.rawJson)) continue;
      const source = row.source;
      if (
        source !== "twitter" &&
        source !== "threads" &&
        source !== "bluesky"
      ) {
        continue;
      }
      jobs.push(
        limit(async () => {
          try {
            const result = await runCaptureTweet(row.id, { nativeOnly: true });
            if (result.captured > 0) {
              recaptured += 1;
            } else if (
              source !== "bluesky" &&
              needsLiveReplyRecapture(row.rawJson)
            ) {
              liveReplies.push({ id: row.id, source });
            }
          } catch (err) {
            log.warn("[pond native-card-backfill] failed", row.id, err);
          }
        }),
      );
    }

    if (page.length < PAGE_SIZE) break;
  }

  await Promise.all(jobs);
  const requeued = await requeueReplyCaptures(liveReplies);
  if (recaptured > 0 || requeued > 0) {
    log.info("[pond native-card-backfill] recaptured", {
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
  rows: readonly BackfillRow[],
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
