import { rm } from "node:fs/promises";
import { type Source, saves, tasks } from "@pond/schema/db";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { saveFile } from "../../paths";
import { persistSave } from "../persist-save";
import { resetTasksForSave } from "../pipeline/enqueue";
import { createPendingTasks } from "../pipeline/enqueue-scheduling";
import {
  type TaskPayload,
  withInteractivePriority,
} from "../pipeline/priority";
import { createQueueGeneration } from "../pipeline/queue-generations";
import { kickReconciler } from "../pipeline/reconciler-client";

export type RefreshOutcome =
  | { ok: true; method: "metadata" | "pipeline-reset" }
  | {
      ok: false;
      reason: "not_found" | "no_url" | "internal_error";
    };

interface RefreshSaveOptions {
  overwrite?: boolean;
  /** Replaces the interactive harvest payload, so a background job queues behind your own refreshes. */
  harvestPayload?: TaskPayload;
  /** The budget the harvest is charged to; defaults to the save's own Source. */
  harvestSource?: Source;
}

export async function refreshSave(
  saveId: string,
  opts: RefreshSaveOptions = {},
): Promise<RefreshOutcome> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };
  try {
    const generationId = await createQueueGeneration({
      kind: "refresh",
      source: current.source,
      scope: { saveIds: [saveId], overwrite: opts.overwrite === true },
    });
    if (opts.overwrite) {
      const existing = current.files ?? [];
      await Promise.all(
        existing.map((f) =>
          rm(saveFile(saveId, f.path), { force: true }).catch(() => {}),
        ),
      );
      db.update(saves)
        .set({ files: [], coverIndex: 0, fileSize: null, mediaUrl: null })
        .where(eq(saves.id, saveId))
        .run();

      db.update(tasks)
        .set({
          payload: withInteractivePriority({ force: true }),
          source: current.source,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "harvest_metadata")))
        .run();
      await resetTasksForSave(saveId, "user:refresh-overwrite", generationId);
      await persistSave(
        saveId,
        {
          status: "ingesting",
          ingestStartedAt: new Date(),
          ingestCompletedAt: null,
          files: [],
          coverIndex: 0,
          fileSize: null,
          mediaUrl: null,
        },
        { actorReason: "user:refresh-overwrite" },
      );
      kickReconciler();
      return { ok: true, method: "pipeline-reset" };
    }

    const now = new Date();
    const harvestPayload =
      opts.harvestPayload ?? withInteractivePriority({ force: true });
    const harvestSource = opts.harvestSource ?? current.source;
    const harvest = db
      .update(tasks)
      .set({
        payload: harvestPayload,
        source: harvestSource,
        status: "pending",
        attempts: 0,
        generationId,
        lastError: null,
        nextRunAt: now,
        updatedAt: now,
      })
      .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "harvest_metadata")))
      .run();

    /**
     * New metadata can point at new media; fetch_blobs and ensure_poster only fill in what is missing.
     * @remarks Unfinished tasks rerun because a blocked refresh sweeps them to dead and the save waits on every task.
     */
    db.update(tasks)
      .set({
        status: "pending",
        attempts: 0,
        generationId,
        lastError: null,
        nextRunAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.saveId, saveId),
          ne(tasks.op, "harvest_metadata"),
          or(
            inArray(tasks.op, ["fetch_blobs", "ensure_poster"]),
            ne(tasks.status, "done"),
          ),
        ),
      )
      .run();
    /**
     * A finished card can still be the previous save's picture. Render this
     * save's card again from the capture already stored with it.
     */
    db.update(tasks)
      .set({
        payload: withInteractivePriority({ force: true }),
        status: "pending",
        attempts: 0,
        generationId,
        lastError: null,
        nextRunAt: now,
        updatedAt: now,
      })
      .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "capture_tweet")))
      .run();

    /** Tasks live only in the local index, so Saves read back from the library folder have no task rows. */
    const existingOps = new Set(
      db
        .select({ op: tasks.op })
        .from(tasks)
        .where(eq(tasks.saveId, saveId))
        .all()
        .map((row) => row.op),
    );
    const missing = createPendingTasks(
      saveId,
      current.source,
      now,
      "user:refresh",
      undefined,
      generationId,
    )
      .filter((row) => !existingOps.has(row.op))
      .map((row) =>
        row.op === "harvest_metadata"
          ? { ...row, payload: harvestPayload, source: harvestSource }
          : row,
      );
    if (
      (harvest.changes ?? 0) === 0 &&
      !missing.some((row) => row.op === "harvest_metadata")
    ) {
      log.warn("[pond refresh] no harvest_metadata task", saveId);
      return { ok: false, reason: "internal_error" };
    }
    if (missing.length > 0) db.insert(tasks).values(missing).run();

    await persistSave(
      saveId,
      {
        status: "ingesting",
        ingestStartedAt: now,
        ingestCompletedAt: null,
      },
      { actorReason: "user:refresh" },
    );
    kickReconciler();
    return { ok: true, method: "metadata" };
  } catch (err) {
    log.error("[pond refresh] reset failed", saveId, err);
    return { ok: false, reason: "internal_error" };
  }
}

export { isSourceConnected, signInToSource } from "./harvest-window";
