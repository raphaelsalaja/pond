import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Op, type Save, type Task, tasks } from "@pond/schema/db";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../../db";
import { itemDir } from "../../../paths";
import { CAPTURE_EXPECTATIONS } from "../specs";
import { applySavePatch, readSave } from "./apply";

const METADATA_FILENAME = "metadata.json";

export class FinalizeIncompleteError extends Error {
  constructor(public readonly missing: string[]) {
    super(`finalize: missing required fields: ${missing.join(", ")}`);
    this.name = "FinalizeIncompleteError";
  }
}

export async function runFinalize(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const taskRows = await fetchTaskRows(saveId);
  const report = computeCaptureReport(save);

  await writeMetadataJson(save, taskRows, report);

  if (report.required.missing.length > 0) {
    // If harvest_metadata still has retries left, kick it back to pending so
    // it can take another swing at filling in the missing field. If it has
    // already failed (e.g. Twitter's hidden-window scrape can't render the
    // /i/web/status URL), don't re-pend it — that just churns the reconciler
    // forever. Accept the partial capture and move on; the save still lands
    // as `complete` with whatever the extractor managed to grab.
    const harvestRow = taskRows.find((t) => t.op === "harvest_metadata");
    const harvestExhausted =
      !harvestRow ||
      harvestRow.status === "failed" ||
      harvestRow.attempts >= harvestRow.maxAttempts;

    if (!harvestExhausted) {
      const db = await getDb();
      db.update(tasks)
        .set({
          status: "pending",
          nextRunAt: new Date(Date.now() + 60_000),
          lastError: `finalize: missing required fields ${report.required.missing.join(", ")}`,
          updatedAt: new Date(),
        })
        .where(and(eq(tasks.saveId, saveId), eq(tasks.op, "harvest_metadata")))
        .run();
      log.warn(
        "[pond pipeline:finalize] incomplete capture, retrying harvest",
        {
          saveId,
          source: save.source,
          missing: report.required.missing,
        },
      );
      throw new FinalizeIncompleteError(report.required.missing);
    }

    log.warn("[pond pipeline:finalize] incomplete capture, accepting as-is", {
      saveId,
      source: save.source,
      missing: report.required.missing,
    });
  }

  if (report.recommended.missing.length > 0) {
    log.info("[pond pipeline:finalize] capture missing recommended fields", {
      saveId,
      missing: report.recommended.missing,
    });
  }

  await applySavePatch(
    saveId,
    {
      status: "complete",
      ingestCompletedAt: new Date(),
    },
    {
      actorReason: "pipeline:finalize",
    },
  );
  log.info("[pond pipeline:finalize] complete", {
    saveId,
    source: save.source,
  });
}

async function fetchTaskRows(saveId: string): Promise<Task[]> {
  const db = await getDb();
  return db.select().from(tasks).where(eq(tasks.saveId, saveId));
}

interface CaptureReport {
  required: { present: string[]; missing: string[] };
  recommended: { present: string[]; missing: string[] };
  score: number;
}

function computeCaptureReport(save: Save): CaptureReport {
  const expectation = CAPTURE_EXPECTATIONS[save.source];
  const view = buildExpectationView(save);

  const required = partition(expectation.required, view);
  const recommended = partition(expectation.recommended, view);
  const total = required.present.length + recommended.present.length;
  const denom = expectation.required.length + expectation.recommended.length;
  const score = denom === 0 ? 1 : total / denom;
  return { required, recommended, score };
}

function partition(
  paths: readonly string[],
  view: Record<string, unknown>,
): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  for (const path of paths) {
    if (hasMeaningfulValue(getPath(view, path))) present.push(path);
    else missing.push(path);
  }
  return { present, missing };
}

function buildExpectationView(save: Save): Record<string, unknown> {
  const row = save as unknown as Record<string, unknown>;
  return {
    ...row,
    capture:
      (save.rawJson as { capture?: unknown } | null)?.capture ?? undefined,
  };
}

function getPath(root: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function hasMeaningfulValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

interface MetadataDoc {
  pond: {
    schema: 2;
    save: Record<string, unknown>;
    rawSource: unknown;
    files: Array<Record<string, unknown>>;
    tasks: Array<{
      op: Op;
      status: string;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
      completedAt: string | null;
    }>;
    captureReport: CaptureReport;
  };
}

async function writeMetadataJson(
  save: Save,
  taskRows: Task[],
  report: CaptureReport,
): Promise<void> {
  const { rawJson, ...rest } = save;
  const filesManifest = (save.files ?? []).map((f) => ({
    kind: f.kind,
    path: f.path,
    sha256: f.sha256,
    size: f.size,
    ...(f.mimeType ? { mimeType: f.mimeType } : {}),
    ...(f.width ? { width: f.width } : {}),
    ...(f.height ? { height: f.height } : {}),
  }));
  const taskManifest = taskRows.map((t) => ({
    op: t.op,
    status: t.status,
    attempts: t.attempts,
    maxAttempts: t.maxAttempts,
    lastError: t.lastError,
    completedAt:
      t.status === "done" ? new Date(t.updatedAt).toISOString() : null,
  }));

  const doc: MetadataDoc = {
    pond: {
      schema: 2,
      save: serializeRow(rest),
      rawSource: rawJson,
      files: filesManifest,
      tasks: taskManifest,
      captureReport: report,
    },
  };

  // Text-only tweets with no media + a failed screenshot capture leave
  // `save.files` empty, in which case no upstream worker ever created
  // the item dir (applySavePatch only mkdirs when files are written).
  // Finalize is the last step so it owns ensuring the dir exists.
  const dir = itemDir(save.id);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(join(dir, METADATA_FILENAME), JSON.stringify(doc, null, 2));
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}
