import { saves, tasks } from "@pond/schema/db";
import type { SaveFile, Source } from "@pond/schema/db";
import {
  inferKindFromFilename,
  isOriginalImageKind,
  VIDEO_KIND,
} from "@shared/save-file-names";
import { and, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { maxAttemptsFor } from "../pipeline/specs";

/** Stays well under SQLite's bound-parameter limit for `inArray`. */
const ID_BATCH = 500;
/** Dead media stays dead past two repairs, so a launch never tries the same Save a third time. */
const MAX_REPAIR_ATTEMPTS = 2;

const RepairCountSchema = z
  .looseObject({ mediaRepair: z.number().optional() })
  .catch({});

interface MediaCoverRepairRuntime {
  getDb: () => Promise<Db>;
  /** Re-harvests and refetches one Save in place, throwing when either step fails. */
  repair: (saveId: string) => Promise<void>;
}

const defaultRuntime: MediaCoverRepairRuntime = {
  getDb,
  async repair(saveId) {
    const { runHarvestMetadata } =
      await import("../pipeline/workers/harvest-metadata");
    await runHarvestMetadata(saveId, { force: true });
    const { runFetchBlobs } = await import("../pipeline/workers/fetch-blobs");
    await runFetchBlobs(saveId);
  },
};

interface RepairCandidate {
  source: Source;
  files: Array<SaveFile>;
  /** The blob fetch recorded `mediaFetchExhausted` on the Capture. */
  exhausted: boolean;
}

/**
 * A Save with no original image or video on disk is broken only when evidence
 * says media existed: the blob fetch recorded that it gave up, or it is a
 * GitHub repository, whose page always serves at least the generated card.
 */
export function needsMediaCoverRepair(row: RepairCandidate): boolean {
  if (row.source === "local") return false;
  if (hasOriginalMedia(row.files)) return false;
  return row.exhausted || row.source === "github";
}

function hasOriginalMedia(files: ReadonlyArray<SaveFile> | null): boolean {
  return (files ?? []).some(
    (file) =>
      isOriginalImageKind(file.kind) ||
      file.kind === VIDEO_KIND ||
      inferKindFromFilename(file.path) === VIDEO_KIND,
  );
}

/**
 * Repairs Saves left with a text cover by a missed media fetch. The query
 * reads only GitHub Saves and Saves carrying the exhaustion marker, and each
 * Save records its attempts on its harvest task, so a launch skips what it
 * already tried twice.
 * @remarks Harvests in place, like the article backfill: the Save stays complete throughout, so a failed repair leaves it as it was.
 */
export async function startMediaCoverBackfill(
  runtime: MediaCoverRepairRuntime = defaultRuntime,
): Promise<{ ok: true; attempted: number; repaired: number }> {
  const db = await runtime.getDb();
  const exhausted = sql<number>`json_extract(${saves.rawJson}, '$.capture.extras.mediaFetchExhausted') is not null`;
  const rows = db
    .select({
      id: saves.id,
      source: saves.source,
      files: saves.files,
      exhausted,
    })
    .from(saves)
    .where(
      and(
        eq(saves.status, "complete"),
        isNull(saves.deletedAt),
        ne(saves.source, "local"),
        sql`json_extract(${saves.rawJson}, '$.capture') is not null`,
        or(eq(saves.source, "github"), exhausted),
      ),
    )
    .all();
  const cohort = rows.filter((row) =>
    needsMediaCoverRepair({ ...row, exhausted: Boolean(row.exhausted) }),
  );
  if (cohort.length === 0) return { ok: true, attempted: 0, repaired: 0 };

  let attempted = 0;
  let repaired = 0;
  for (const batch of batches(cohort.map((row) => row.id))) {
    const busy = busySaves(db, batch);
    const attempts = repairAttempts(db, batch);
    for (const id of batch) {
      if (busy.has(id)) continue;
      const tried = attempts.get(id) ?? 0;
      if (tried >= MAX_REPAIR_ATTEMPTS) continue;
      recordAttempt(db, id, tried + 1);
      attempted += 1;
      try {
        await runtime.repair(id);
      } catch (error) {
        log.warn("[pond media-cover-backfill] repair failed", id, error);
        continue;
      }
      if (hasOriginalMedia(currentFiles(db, id))) repaired += 1;
    }
  }
  if (attempted > 0) {
    log.info("[pond media-cover-backfill] repaired text covers", {
      cohort: cohort.length,
      attempted,
      repaired,
    });
  }
  return { ok: true, attempted, repaired };
}

/** A Save with queued work belongs to the pipeline; repairing beside it would race its tasks. */
function busySaves(db: Db, ids: Array<string>): Set<string> {
  return new Set(
    db
      .select({ saveId: tasks.saveId })
      .from(tasks)
      .where(
        and(
          inArray(tasks.saveId, ids),
          notInArray(tasks.status, ["done", "cancelled", "dead"]),
        ),
      )
      .all()
      .map((row) => row.saveId),
  );
}

function repairAttempts(db: Db, ids: Array<string>): Map<string, number> {
  return new Map(
    db
      .select({ saveId: tasks.saveId, payload: tasks.payload })
      .from(tasks)
      .where(and(inArray(tasks.saveId, ids), eq(tasks.op, "harvest_metadata")))
      .all()
      .map((row) => [
        row.saveId,
        RepairCountSchema.parse(row.payload).mediaRepair ?? 0,
      ]),
  );
}

/** Counted before the repair runs, so a crash or quit mid-repair still uses up the attempt. */
function recordAttempt(db: Db, saveId: string, count: number): void {
  const now = new Date();
  const harvest = db
    .select({ id: tasks.id, payload: tasks.payload })
    .from(tasks)
    .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "harvest_metadata")))
    .get();
  if (harvest) {
    db.update(tasks)
      .set({
        payload: {
          ...RepairCountSchema.parse(harvest.payload),
          mediaRepair: count,
        },
        updatedAt: now,
      })
      .where(eq(tasks.id, harvest.id))
      .run();
    return;
  }
  const save = db
    .select({ source: saves.source })
    .from(saves)
    .where(eq(saves.id, saveId))
    .get();
  if (!save) return;
  db.insert(tasks)
    .values({
      id: ulid(),
      saveId,
      source: save.source,
      op: "harvest_metadata",
      status: "done",
      attempts: 0,
      maxAttempts: maxAttemptsFor("harvest_metadata"),
      payload: { mediaRepair: count },
      nextRunAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

function currentFiles(db: Db, saveId: string): Array<SaveFile> | null {
  return (
    db
      .select({ files: saves.files })
      .from(saves)
      .where(eq(saves.id, saveId))
      .get()?.files ?? null
  );
}

function batches<T>(rows: ReadonlyArray<T>): Array<Array<T>> {
  const out: Array<Array<T>> = [];
  for (let start = 0; start < rows.length; start += ID_BATCH) {
    out.push(rows.slice(start, start + ID_BATCH));
  }
  return out;
}
