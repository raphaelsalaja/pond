import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { type SaveFile, saves, syncActions } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../db";
import { extractFirstFrame } from "../lib/ffmpeg-frame";
import { readItemMetadata } from "../lib/library";
import { itemDir, itemFile } from "../paths";
import { broadcastSyncAction } from "./executor";
import { createJobRunner, type JobSnapshot } from "./jobs/runner";
import { binariesAvailable } from "./refresh/binaries";

interface PosterJob {
  saveId: string;
}

const runner = createJobRunner<PosterJob>({
  name: "poster-backfill",
  process: processJob,
});

export type PosterBackfillStatus = JobSnapshot;

export const subscribeToPosterBackfillStatus = runner.subscribe;
export const posterBackfillSnapshot = runner.snapshot;

export function enqueuePosterBackfill(saveId: string): void {
  runner.enqueue(saveId, { saveId });
}

export async function enqueueAllMissing(
  opts: { force?: boolean } = {},
): Promise<{ scheduled: number }> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) {
    log.debug(
      "[pond poster-backfill] ffmpeg unavailable, skipping startup pass",
    );
    return { scheduled: 0 };
  }
  const db = await getDb();
  const rows = await db.select().from(saves);
  let scheduled = 0;
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const files = row.files ?? [];
    const hasVideo = files.some((f) => f.kind === "video");
    if (!hasVideo) continue;
    if (!opts.force && files.some((f) => f.kind === "poster")) continue;
    enqueuePosterBackfill(row.id);
    scheduled++;
  }
  if (scheduled > 0) {
    log.info(`[pond poster-backfill] scheduled ${scheduled} jobs`);
  }
  return { scheduled };
}

async function processJob(job: PosterJob): Promise<void> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, job.saveId));
  const current = rows[0];
  if (!current) {
    log.debug(
      "[pond poster-backfill] save vanished before extraction",
      job.saveId,
    );
    return;
  }
  if (current.deletedAt !== null) return;

  const files = current.files ?? [];
  const videoFile = files.find((f) => f.kind === "video");
  if (!videoFile) {
    log.debug("[pond poster-backfill] no video file, skipping", job.saveId);
    return;
  }

  const videoPath = itemFile(job.saveId, videoFile.path);
  if (!existsSync(videoPath)) {
    log.warn(
      "[pond poster-backfill] video missing on disk, skipping",
      job.saveId,
      videoPath,
    );
    return;
  }

  const frame = await extractFirstFrame(videoPath);
  if (!frame) return;

  try {
    await appendPosterFile(current.id, frame.path, files);
  } finally {
    await frame.cleanup();
  }
}

async function appendPosterFile(
  saveId: string,
  framePath: string,
  existingFiles: SaveFile[],
): Promise<void> {
  const db = await getDb();

  const ext = extname(framePath).toLowerCase() || ".jpg";
  let filename = `poster${ext}`;
  let suffix = 1;
  while (existingFiles.some((f) => f.path === filename)) {
    filename = `poster-${suffix}${ext}`;
    suffix++;
  }

  const buf = await readFile(framePath);
  if (buf.byteLength === 0) {
    log.warn("[pond poster-backfill] frame file empty, skipping", saveId);
    return;
  }

  const dir = itemDir(saveId);
  await writeFile(join(dir, filename), buf);

  const posterEntry: SaveFile = {
    kind: "poster",
    path: filename,
    sha256: createHash("sha256").update(buf).digest("hex"),
    size: buf.length,
    mimeType: "image/jpeg",
  };
  const nextFiles: SaveFile[] = [...existingFiles, posterEntry];

  try {
    const meta = await readItemMetadata(saveId);
    if (meta) {
      meta.files = nextFiles.map((f) => ({
        kind: f.kind,
        path: f.path,
        sha256: f.sha256,
        size: f.size,
      }));
      meta.mtime = Date.now();
      await writeFile(
        join(dir, "metadata.json"),
        JSON.stringify(meta, null, 2),
      );
    }
  } catch (err) {
    log.warn("[pond poster-backfill] metadata.json patch failed", saveId, err);
  }

  await db
    .update(saves)
    .set({ files: nextFiles })
    .where(eq(saves.id, saveId))
    .run();

  const inserted = db
    .insert(syncActions)
    .values({
      modelName: "save",
      modelId: saveId,
      action: "U",
      data: { files: nextFiles },
      prevData: { files: existingFiles },
      actor: "system",
      actorReason: "poster-backfill",
      batchId: ulid(),
    })
    .returning()
    .all()[0];
  if (inserted) {
    broadcastSyncAction(inserted);
  }

  log.info("[pond poster-backfill] wrote poster", {
    saveId,
    filename,
    bytes: buf.byteLength,
  });
}
