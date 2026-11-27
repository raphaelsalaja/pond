import { saves, tasks } from "@pond/schema/db";
import type { NewTask, Op, SaveFile, Source } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { walkCaptureMedia } from "@pond/schema/raw";
import {
  inferKindFromFilename,
  isOriginalImageKind,
  VIDEO_KIND,
} from "@shared/save-file-names";
import { and, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import { kickReconciler } from "../pipeline/reconciler-client";
import { maxAttemptsFor } from "../pipeline/specs";
import { collectMediaUrls } from "../pipeline/workers/fetch-blobs";

const PAGE_SIZE = 200;
/** Stays well under SQLite's bound-parameter limit for `inArray`. */
const ID_BATCH = 500;
/** Dead media stays dead past two repair cycles, so a launch never re-opens the same save a third time. */
const MAX_REPAIR_ATTEMPTS = 2;

const REPAIR_OPS = ["harvest_metadata", "fetch_blobs", "finalize"] as const;

const RepairCountSchema = z
  .looseObject({ mediaRepair: z.number().optional() })
  .catch({});

interface MediaCoverRepairRuntime {
  getDb: () => Promise<Db>;
  kickReconciler: () => void;
  persistSave: typeof persistSave;
}

const defaultRuntime: MediaCoverRepairRuntime = {
  getDb,
  kickReconciler,
  persistSave,
};

interface ScanRow {
  id: string;
  source: Source;
  files: Array<SaveFile>;
  rawJson: RawJson | null;
}

/**
 * A save whose files hold no original media is broken only when evidence says media existed: the capture still lists image urls, the blob fetch recorded its exhaustion, or a GitHub capture lists no media at all, which a resolving repository page never does.
 */
export function needsMediaCoverRepair(
  row: Pick<ScanRow, "source" | "files" | "rawJson">,
): boolean {
  if (row.source === "local") return false;
  const hasMedia = (row.files ?? []).some(
    (file) =>
      isOriginalImageKind(file.kind) ||
      file.kind === VIDEO_KIND ||
      inferKindFromFilename(file.path) === VIDEO_KIND,
  );
  if (hasMedia) return false;
  const capture = row.rawJson?.capture;
  if (!capture) return false;
  if (capture.extras?.mediaFetchExhausted !== undefined) return true;
  /* Videos stay out of the evidence: their downloads are optional and removable, so a missing video file proves nothing. */
  if (collectMediaUrls(row.rawJson, { includeVideo: false }).length > 0) {
    return true;
  }
  return row.source === "github" && walkCaptureMedia(capture).length === 0;
}

/** Runs on every launch; the scan is one indexed read and the per-save attempt count bounds what it requeues. */
export async function startMediaCoverBackfill(
  runtime: MediaCoverRepairRuntime = defaultRuntime,
): Promise<{ ok: true; repaired: number }> {
  const db = await runtime.getDb();
  const cohort: Array<{ id: string; source: Source }> = [];
  let offset = 0;
  for (;;) {
    const page = db
      .select({
        id: saves.id,
        source: saves.source,
        files: saves.files,
        rawJson: saves.rawJson,
      })
      .from(saves)
      .where(
        and(
          inArray(saves.status, ["complete", "failed"]),
          isNull(saves.deletedAt),
          ne(saves.source, "local"),
        ),
      )
      .limit(PAGE_SIZE)
      .offset(offset)
      .all();
    if (page.length === 0) break;
    offset += page.length;
    for (const row of page) {
      if (needsMediaCoverRepair(row)) {
        cohort.push({ id: row.id, source: row.source });
      }
    }
    if (page.length < PAGE_SIZE) break;
  }
  if (cohort.length === 0) return { ok: true, repaired: 0 };

  let repaired = 0;
  for (const batch of batches(cohort)) {
    repaired += await reopenMedialessSaves(db, batch, runtime);
  }
  if (repaired > 0) {
    log.info("[pond media-cover-backfill] reopened saves", {
      cohort: cohort.length,
      repaired,
    });
    runtime.kickReconciler();
  }
  return { ok: true, repaired };
}

async function reopenMedialessSaves(
  db: Db,
  rows: ReadonlyArray<{ id: string; source: Source }>,
  runtime: MediaCoverRepairRuntime,
): Promise<number> {
  const now = new Date();
  const ids = rows.map((row) => row.id);
  /** A non-done earlier task holds the sequential gate, so the requeued work would never run. */
  const blocked = new Set(
    db
      .select({ saveId: tasks.saveId })
      .from(tasks)
      .where(
        and(
          inArray(tasks.saveId, ids),
          notInArray(tasks.op, [...REPAIR_OPS]),
          notInArray(tasks.status, ["done", "cancelled"]),
        ),
      )
      .all()
      .map((row) => row.saveId),
  );
  const existing = db
    .select({
      id: tasks.id,
      saveId: tasks.saveId,
      op: tasks.op,
      payload: tasks.payload,
    })
    .from(tasks)
    .where(and(inArray(tasks.saveId, ids), inArray(tasks.op, [...REPAIR_OPS])))
    .all();
  const existingByKey = new Map(
    existing.map((row) => [`${row.saveId}:${row.op}`, row]),
  );

  let repaired = 0;
  for (const row of rows) {
    if (blocked.has(row.id)) continue;
    const harvest = existingByKey.get(`${row.id}:harvest_metadata`);
    const attempts = RepairCountSchema.parse(harvest?.payload).mediaRepair ?? 0;
    if (attempts >= MAX_REPAIR_ATTEMPTS) continue;
    const harvestPayload = { force: true, mediaRepair: attempts + 1 };
    for (const op of REPAIR_OPS) {
      requestTask(
        db,
        row,
        op,
        existingByKey.get(`${row.id}:${op}`)?.id,
        op === "harvest_metadata" ? harvestPayload : undefined,
        now,
      );
    }
    await runtime.persistSave(
      row.id,
      { status: "ingesting", ingestStartedAt: now, ingestCompletedAt: null },
      { actorReason: "pipeline:media-cover-backfill" },
    );
    repaired += 1;
  }
  return repaired;
}

function requestTask(
  db: Db,
  save: { id: string; source: Source },
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

function batches<T>(rows: ReadonlyArray<T>): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let start = 0; start < rows.length; start += ID_BATCH) {
    out.push(rows.slice(start, start + ID_BATCH));
  }
  return out;
}
