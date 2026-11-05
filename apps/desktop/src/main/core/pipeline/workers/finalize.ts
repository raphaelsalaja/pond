import { type Save, type Task, tasks } from "@pond/schema/db";
import { pickCardFile } from "@shared/save-file-names";
import { and, eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../../db";
import { commitSaveIngestEvent } from "../../../lib/wide-event";
import { persistSave } from "../../persist-save";
import { CAPTURE_EXPECTATIONS, type CaptureField } from "../specs";
import { readSave } from "./apply";

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

  if (report.required.missing.length > 0) {
    const harvestRow = taskRows.find((t) => t.op === "harvest_metadata");
    const harvestExhausted =
      !harvestRow ||
      harvestRow.status === "dead" ||
      harvestRow.attempts >= harvestRow.maxAttempts;

    if (!harvestExhausted) {
      const db = await getDb();
      db.update(tasks)
        .set({
          status: "pending",
          payload: { force: true },
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

  const { splitNewPost } = await import("../../split-on-import");
  const current = await splitNewPost(save);
  if (!current) return;
  const { writeSaveBlurhash } = await import("../../save-blurhash");
  await Promise.all([writeDominantColors(current), writeSaveBlurhash(current)]);

  await persistSave(
    saveId,
    {
      status: "complete",
      ingestCompletedAt: new Date(),
    },
    {
      actorReason: "pipeline:finalize",
      writeInfo: true,
    },
  );
  void commitSaveIngestEvent(saveId, { outcome: "complete" });
}

async function writeDominantColors(save: Save): Promise<void> {
  if (save.mediaType !== "image" || (save.dominantColors ?? []).length > 0)
    return;
  const files = save.files ?? [];
  const cover = pickCardFile(files) ?? files[0];
  if (!cover) return;
  const { extractPalette } = await import("../../../lib/palette");
  const { saveFile } = await import("../../../paths");
  const colors = await extractPalette(saveFile(save.id, cover.path));
  if (colors.length === 0) return;
  await persistSave(
    save.id,
    { dominantColors: colors },
    { actorReason: "color:extract" },
  );
}

async function fetchTaskRows(saveId: string): Promise<Task[]> {
  const db = await getDb();
  return db.select().from(tasks).where(eq(tasks.saveId, saveId));
}

interface FieldPartition {
  present: CaptureField[];
  missing: CaptureField[];
}

interface CaptureReport {
  required: FieldPartition;
  recommended: FieldPartition;
  score: number;
}

function hasText(value: string | null | undefined): boolean {
  return value != null && value.trim().length > 0;
}

function hasNumber(value: number | undefined): boolean {
  return value !== undefined && Number.isFinite(value);
}

const FIELD_PRESENT = {
  author: (s) => hasText(s.author),
  description: (s) => hasText(s.description),
  mediaUrl: (s) => hasText(s.mediaUrl),
  sourceId: (s) => hasText(s.sourceId),
  title: (s) => hasText(s.title),
  "capture.author.avatarUrl": (s) =>
    hasText(s.rawJson?.capture?.author?.avatarUrl),
  "capture.author.handle": (s) => hasText(s.rawJson?.capture?.author?.handle),
  "capture.author.name": (s) => hasText(s.rawJson?.capture?.author?.name),
  "capture.duration": (s) => hasNumber(s.rawJson?.capture?.duration),
  "capture.id": (s) => hasText(s.rawJson?.capture?.id),
  "capture.media": (s) => (s.rawJson?.capture?.media?.length ?? 0) > 0,
  "capture.metrics.comments": (s) =>
    hasNumber(s.rawJson?.capture?.metrics?.comments),
  "capture.metrics.likes": (s) => hasNumber(s.rawJson?.capture?.metrics?.likes),
  "capture.metrics.replies": (s) =>
    hasNumber(s.rawJson?.capture?.metrics?.replies),
  "capture.metrics.retweets": (s) =>
    hasNumber(s.rawJson?.capture?.metrics?.retweets),
  "capture.metrics.shares": (s) =>
    hasNumber(s.rawJson?.capture?.metrics?.shares),
  "capture.metrics.views": (s) => hasNumber(s.rawJson?.capture?.metrics?.views),
  "capture.publishedAt": (s) => hasText(s.rawJson?.capture?.publishedAt),
  "capture.upstream.url": (s) => hasText(s.rawJson?.capture?.upstream?.url),
} satisfies Record<CaptureField, (save: Save) => boolean>;

function computeCaptureReport(save: Save): CaptureReport {
  const expectation = CAPTURE_EXPECTATIONS[save.source];

  const required = partition(expectation.required, save);
  const recommended = partition(expectation.recommended, save);
  const total = required.present.length + recommended.present.length;
  const denom = expectation.required.length + expectation.recommended.length;
  const score = denom === 0 ? 1 : total / denom;
  return { required, recommended, score };
}

function partition(
  fields: readonly CaptureField[],
  save: Save,
): FieldPartition {
  const present: CaptureField[] = [];
  const missing: CaptureField[] = [];
  for (const field of fields) {
    if (FIELD_PRESENT[field](save)) present.push(field);
    else missing.push(field);
  }
  return { present, missing };
}
