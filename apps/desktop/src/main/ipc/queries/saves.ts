import { SOURCES, type Source, saves, type Task, tasks } from "@pond/schema/db";
import { buildWhere, type Query } from "@pond/schema/filters";
import type { Transaction } from "@pond/schema/tx";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm";
import log from "electron-log/main.js";
import { executeBatch } from "../../core/executor";
import {
  cancelProcessingBackfill,
  isProcessingBackfilling,
  retryFailedSave,
  startProcessingBackfill,
} from "../../core/pipeline/backfill-failed";
import { enqueueSaveByUrl } from "../../core/pipeline/enqueue";
import { UnsupportedError } from "../../core/pipeline/extractors/errors";
import { recordForUndo } from "../../core/undo";
import type { Db } from "../../db";
import { getDb } from "../../db";
import {
  type QueryHandlerMap,
  resolveSaveFilePath,
  sanitizeFtsQuery,
} from "../helpers";
import { toWireSave, toWireSaves } from "../wire";

export interface ProcessingDetailWire {
  id: string;
  url: string;
  title: string | null;
  source: string;
  status: "ingesting" | "failed";
  progress: { done: number; total: number };
  stageOp:
    | "harvest_metadata"
    | "capture_tweet"
    | "fetch_blobs"
    | "fetch_video_ytdlp"
    | "ensure_poster"
    | "fetch_avatar"
    | "finalize"
    | null;
  // Task id of the row that `stageOp` refers to, when one exists.
  // Lets the renderer call `tasks.skip` without a second lookup.
  stageTaskId: string | null;
  stageStatus: "pending" | "running" | "done" | "failed" | "blocked" | null;
  // Raw `${name}: ${message}` blob written by the retry classifier.
  // Kept for power users / bug reports.
  lastError: string | null;
  // Extracted so the renderer can humanise without fragile parsing.
  lastErrorName: string | null;
  // When the failing task last changed status — drives "Failed 2m ago".
  lastErrorAt: string | null;
  // When the current/next attempt will fire, if any. Drives the
  // "Retries in 30s" / "Waiting for rate limit" copy on pending rows.
  nextRunAt: string | null;
  attempts: number;
  maxAttempts: number;
  ingestStartedAt: string | null;
}

export interface ProcessingDetailsResultWire {
  rows: ProcessingDetailWire[];
  truncated: number;
}

// Cap on rows returned for the dialog. Dialogs become unusable past a
// few hundred rows; surfacing a count of the overflow lets the UI
// nudge the user toward "retry all" or "empty trash" instead.
const PROCESSING_DETAILS_LIMIT = 500;

/* `classifyError` writes `${err.name}: ${err.message}` into
 * `tasks.lastError`. Pulling the name back out gives the renderer a
 * stable discriminator (`TerminalError`, `RateLimitedError`, …) to map
 * onto human copy without fragile substring matches on the message. */
function extractErrorName(blob: string | null): string | null {
  if (!blob) return null;
  const idx = blob.indexOf(":");
  if (idx <= 0) return null;
  const candidate = blob.slice(0, idx).trim();
  if (!/^[A-Za-z_][\w]*$/.test(candidate)) return null;
  return candidate;
}

async function loadTasksFor(
  db: Db,
  ids: string[],
): Promise<Map<string, Task[]>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(tasks).where(inArray(tasks.saveId, ids));
  const grouped = new Map<string, Task[]>();
  for (const t of rows) {
    const existing = grouped.get(t.saveId);
    if (existing) existing.push(t);
    else grouped.set(t.saveId, [t]);
  }
  return grouped;
}

export const savesQueries: QueryHandlerMap = {
  async "saves.list"(params) {
    const db = await getDb();
    const hasExplicitLimit = params.limit != null;
    const baseQuery = db.select().from(saves).orderBy(desc(saves.savedAt));
    const rows = hasExplicitLimit
      ? await baseQuery.limit(Math.min(Number(params.limit), 100_000))
      : await baseQuery;
    const grouped = await loadTasksFor(
      db,
      rows.map((r) => r.id),
    );
    return toWireSaves(rows, grouped);
  },

  async "saves.find"(params) {
    const db = await getDb();
    const limit = Math.min(Number(params.limit ?? 1000), 5000);
    const query = (params.query ?? null) as Query | null;
    const where = query ? buildWhere(query) : undefined;
    const rows = where
      ? await db
          .select()
          .from(saves)
          .where(where)
          .orderBy(desc(saves.savedAt))
          .limit(limit)
      : await db.select().from(saves).orderBy(desc(saves.savedAt)).limit(limit);
    const grouped = await loadTasksFor(
      db,
      rows.map((r) => r.id),
    );
    return toWireSaves(rows, grouped);
  },

  async "saves.emptyTrash"() {
    const db = await getDb();
    const rows = await db
      .select()
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((r) => ({
      kind: "purge",
      model: "save",
      id: r.id,
      before: r,
      meta: { actor: "user", actorReason: "empty-trash" },
    }));
    await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return { ok: true, count: txs.length };
  },

  async "saves.restoreAll"() {
    const db = await getDb();
    const rows = await db
      .select({ id: saves.id })
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((r) => ({
      kind: "untrash",
      model: "save",
      id: r.id,
      meta: { actor: "user", actorReason: "restore-all" },
    }));
    await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return { ok: true, count: txs.length };
  },

  async "saves.get"(params) {
    const db = await getDb();
    const id = String(params.id ?? "");
    if (!id) return null;
    const rows = await db.select().from(saves).where(eq(saves.id, id));
    if (!rows[0]) return null;
    const taskRows = await db.select().from(tasks).where(eq(tasks.saveId, id));
    return toWireSave(rows[0], taskRows);
  },

  async "saves.filePath"(params) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id) return { ok: false as const, reason: "not_found" as const };
    return resolveSaveFilePath(id, Number.isFinite(fileIndex) ? fileIndex : 0);
  },

  async "saves.dropFiles"() {
    // Local file drops aren't supported in the URL-first pipeline yet —
    // every save now flows through enqueueSaveByUrl. Keep the IPC alive so
    // the renderer's drop handler can no-op gracefully.
    return { ok: false, error: "local_files_unsupported" };
  },

  async "saves.startDrag"(params, event) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id || !event) return { ok: false };
    const target = await resolveSaveFilePath(
      id,
      Number.isFinite(fileIndex) ? fileIndex : 0,
    );
    if (!target.ok) return { ok: false };
    try {
      const { nativeImage } = await import("electron");
      const icon = nativeImage.createEmpty();
      event.sender.startDrag({ file: target.path, icon });
      return { ok: true };
    } catch (err) {
      log.warn("[pond ipc] startDrag failed", err);
      return { ok: false };
    }
  },

  async "saves.quickAdd"(params) {
    const url = String(params.url ?? "").trim();
    if (!url) return { ok: false, error: "no_url" };
    try {
      const result = await enqueueSaveByUrl(url, {
        trigger: "user:quickAdd",
      });
      return { ok: true, id: result.id, created: result.created };
    } catch (err) {
      if (err instanceof UnsupportedError) {
        return { ok: false, error: "unsupported_url" };
      }
      log.error("[pond ipc] quickAdd failed", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async "saves.search"(params) {
    const db = await getDb();
    const { getPrefs } = await import("../../core/prefs");
    const q = String(params.q ?? "").trim();
    const prefs = await getPrefs();
    const explicitLimit =
      params.limit !== undefined ? Number(params.limit) : undefined;
    const limit = Math.min(
      Number.isFinite(explicitLimit ?? Number.NaN)
        ? Number(explicitLimit)
        : prefs.search.resultLimit,
      2000,
    );
    if (!q) return [];
    const sanitized = sanitizeFtsQuery(q);
    let ftsRows: Array<{ id: string; rank: number }> = [];
    try {
      ftsRows = db.$raw
        .prepare(
          `SELECT id, rank FROM saves_fts WHERE saves_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(sanitized, limit) as Array<{ id: string; rank: number }>;
    } catch (err) {
      log.warn("[pond search] fts query failed; falling back", err);
      ftsRows = [];
    }
    if (ftsRows.length === 0) {
      const lower = q.toLowerCase();
      const all = await db.select().from(saves);
      const matched = all.filter((r) => {
        const hay = [r.title, r.description, r.author, r.url]
          .filter((v): v is string => Boolean(v))
          .join(" ")
          .toLowerCase();
        return hay.includes(lower);
      });
      const slice = matched.slice(0, limit);
      const grouped = await loadTasksFor(
        db,
        slice.map((r) => r.id),
      );
      return toWireSaves(slice, grouped);
    }
    const ids = ftsRows.map((r) => r.id);
    const rows = await db.select().from(saves);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const grouped = await loadTasksFor(
      db,
      ordered.map((r) => r.id),
    );
    return toWireSaves(ordered, grouped);
  },

  async "saves.retryFailed"(params) {
    const id = String(params.id ?? "");
    if (!id) return { ok: false as const, reason: "not_found" as const };
    const result = await retryFailedSave(id, "user:retry-failed");
    return result;
  },

  async "saves.retryAllFailed"() {
    const result = await startProcessingBackfill();
    return result;
  },

  async "saves.cancelRetryAllFailed"() {
    if (!isProcessingBackfilling()) {
      return { ok: false as const, reason: "not_running" as const };
    }
    cancelProcessingBackfill();
    return { ok: true as const };
  },

  async "saves.clearQueue"(params) {
    /* Hard-delete every queue entry that matches the filter — failed
     * scrapes and in-flight noise the user never accepted as a save.
     * Trashing would just move the clutter from the queue view to the
     * trash view and force a second "empty trash" step. Default scope
     * is failed-only so a no-arg call can't take out in-flight work
     * by accident. Each row's snapshot is captured so undo can
     * re-create the row from `before` (files are gone, but for
     * queue entries that's the point). */
    const db = await getDb();
    const rawSource = params.source ? String(params.source) : null;
    const source: Source | null =
      rawSource && (SOURCES as readonly string[]).includes(rawSource)
        ? (rawSource as Source)
        : null;
    const rawStatuses = Array.isArray(params.statuses)
      ? params.statuses
      : ["failed"];
    const statuses = rawStatuses
      .map((s) => String(s))
      .filter(
        (s): s is "ingesting" | "failed" => s === "ingesting" || s === "failed",
      );
    if (statuses.length === 0) {
      return { ok: true as const, count: 0 };
    }

    const conds = [isNull(saves.deletedAt), inArray(saves.status, statuses)];
    if (source) conds.push(eq(saves.source, source));
    const rows = await db
      .select()
      .from(saves)
      .where(and(...conds));
    if (rows.length === 0) return { ok: true as const, count: 0 };

    const txs: Transaction[] = rows.map((r) => ({
      kind: "purge",
      model: "save",
      id: r.id,
      before: r,
      meta: { actor: "user", actorReason: "queue:clear" },
    }));
    await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return { ok: true as const, count: txs.length };
  },

  async "saves.processingDetails"() {
    const db = await getDb();
    /* Pull both ingesting + failed in one shot — the dialog renders the
     * two as separate sections but the live count is one number. */
    const allRows = await db
      .select()
      .from(saves)
      .where(
        and(
          isNull(saves.deletedAt),
          or(eq(saves.status, "ingesting"), eq(saves.status, "failed")),
        ),
      )
      .orderBy(asc(saves.savedAt));
    if (allRows.length === 0) {
      return {
        rows: [] satisfies ProcessingDetailWire[],
        truncated: 0,
      } satisfies ProcessingDetailsResultWire;
    }
    const truncated = Math.max(0, allRows.length - PROCESSING_DETAILS_LIMIT);
    const rows = allRows.slice(0, PROCESSING_DETAILS_LIMIT);
    const taskRows = await db
      .select()
      .from(tasks)
      .where(
        inArray(
          tasks.saveId,
          rows.map((r) => r.id),
        ),
      );
    const byId = new Map<string, Task[]>();
    for (const t of taskRows) {
      const bucket = byId.get(t.saveId);
      if (bucket) bucket.push(t);
      else byId.set(t.saveId, [t]);
    }
    const out: ProcessingDetailWire[] = rows.map((row) => {
      const peers = byId.get(row.id) ?? [];
      const total = peers.length;
      const done = peers.filter((t) => t.status === "done").length;
      const failed = peers.find((t) => t.status === "failed");
      const running = peers.find((t) => t.status === "running");
      const blocked = peers.find((t) => t.status === "blocked");
      /* Stage priority is running > blocked > failed > earliest-pending.
       * Pending wins over null so a row waiting for its first attempt
       * can still surface "Retries in 30s" instead of looking idle. */
      const pending = peers
        .filter((t) => t.status === "pending")
        .sort((a, b) => {
          const at = a.nextRunAt ? a.nextRunAt.getTime() : 0;
          const bt = b.nextRunAt ? b.nextRunAt.getTime() : 0;
          return at - bt;
        })[0];
      const stage = running ?? blocked ?? failed ?? pending ?? null;
      const errorSource = failed ?? blocked ?? null;
      const lastError = errorSource?.lastError ?? null;
      return {
        id: row.id,
        url: row.url,
        title: row.title ?? null,
        source: row.source,
        status: row.status as "ingesting" | "failed",
        progress: { done, total },
        stageOp: stage?.op ?? null,
        stageTaskId: stage?.id ?? null,
        stageStatus: stage?.status ?? null,
        lastError,
        lastErrorName: extractErrorName(lastError),
        lastErrorAt: errorSource?.updatedAt
          ? errorSource.updatedAt.toISOString()
          : null,
        nextRunAt: stage?.nextRunAt ? stage.nextRunAt.toISOString() : null,
        attempts: stage?.attempts ?? 0,
        maxAttempts: stage?.maxAttempts ?? 0,
        ingestStartedAt: row.ingestStartedAt
          ? row.ingestStartedAt.toISOString()
          : null,
      };
    });
    return { rows: out, truncated } satisfies ProcessingDetailsResultWire;
  },

  async "saves.activity"(params) {
    const db = await getDb();
    const id = params.saveId ? String(params.saveId) : null;
    const limit = Math.min(Number(params.limit ?? 50), 500);
    const result = id
      ? db.$raw
          .prepare(
            `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
             FROM sync_actions WHERE model_name = 'save' AND model_id = ?
             ORDER BY id DESC LIMIT ?`,
          )
          .all(id, limit)
      : db.$raw
          .prepare(
            `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
             FROM sync_actions ORDER BY id DESC LIMIT ?`,
          )
          .all(limit);
    return result as unknown[];
  },
};
