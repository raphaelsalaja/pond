import { type Source, saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../db";
import { extractFirstFrame } from "../lib/ffmpeg-frame";
import { ingestFromHttp } from "./ingest";
import { createJobRunner, type JobSnapshot } from "./jobs/runner";
import { getVideoDownloadPrefs } from "./prefs";
import { supportsYtDlp } from "./refresh/sources";
import { downloadVideo } from "./refresh/yt-dlp";
import { isAutoVideoBlockedByStorageGuard } from "./storage-watcher";

interface AutoVideoJob {
  saveId: string;
  source: Source;
  sourceId: string;
  url: string;
  force?: boolean;
}

const lastHealHash = new Map<string, string>();

const runner = createJobRunner<AutoVideoJob>({
  name: "auto-video",
  process: processJob,
});

export type AutoVideoStatus = JobSnapshot;

export const subscribeToAutoVideoStatus = runner.subscribe;
export const autoVideoQueueSnapshot = runner.snapshot;

export function enqueueAutoVideoDownload(job: AutoVideoJob): void {
  if (!supportsYtDlp(job.source)) return;
  if (job.force !== true) {
    if (isAutoVideoBlockedByStorageGuard()) {
      log.debug("[pond auto-video] storage guard active, skipping", job.saveId);
      return;
    }
    void getVideoDownloadPrefs().then((prefs) => {
      if (!prefs.enabled) {
        log.debug(
          "[pond auto-video] background downloads disabled, skipping",
          job.saveId,
        );
        return;
      }
      enqueueResolved(job);
    });
    return;
  }
  enqueueResolved(job);
}

function enqueueResolved(job: AutoVideoJob): void {
  runner.enqueue(job.saveId, job, (prev, next) => ({
    ...prev,
    force: prev.force === true || next.force === true,
  }));
}

async function processJob(job: AutoVideoJob): Promise<void> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, job.saveId));
  const current = rows[0];
  if (!current) {
    log.info(
      "[pond auto-video] save vanished before download started",
      job.saveId,
    );
    return;
  }
  const videoFile = (current.files ?? []).find((f) => f.kind === "video");
  if (videoFile && job.force !== true) {
    log.info(
      "[pond auto-video] save already has a video file, skipping",
      job.saveId,
    );
    return;
  }

  if (videoFile && job.force === true) {
    const prev = lastHealHash.get(job.saveId);
    if (prev && prev === videoFile.sha256) {
      log.info(
        "[pond auto-video] video unchanged since last heal, skipping",
        job.saveId,
      );
      return;
    }
  }

  log.info("[pond auto-video] downloading", {
    saveId: job.saveId,
    source: job.source,
    url: job.url,
    force: job.force === true,
  });

  const dl = await downloadVideo({ url: job.url, source: job.source });
  if (!dl) return;

  const frame = await extractFirstFrame(dl.path);

  try {
    const payload: IngestPayload = {
      source: job.source,
      sourceId: job.sourceId,
      url: job.url,
      ...(dl.infoJson ? { raw: { [job.source]: { ytdlp: dl.infoJson } } } : {}),
    };
    await ingestFromHttp(payload, {
      mediaFiles: [
        { path: dl.path, mimeType: dl.mimeType },
        ...(frame
          ? [
              {
                path: frame.path,
                mimeType: frame.mimeType,
                kind: "poster" as const,
              },
            ]
          : []),
      ],
      force: job.force === true,
    });

    if (job.force === true) {
      const afterRows = await db
        .select()
        .from(saves)
        .where(eq(saves.id, job.saveId));
      const after = afterRows[0];
      const newVideoFile = (after?.files ?? []).find((f) => f.kind === "video");
      if (newVideoFile?.sha256) {
        lastHealHash.set(job.saveId, newVideoFile.sha256);
      }
    }

    log.info("[pond auto-video] merged video into save", {
      saveId: job.saveId,
      bytes: dl.size,
      force: job.force === true,
    });
  } finally {
    await dl.cleanup();
    if (frame) await frame.cleanup();
  }
}

export async function redownloadVideoForSave(saveId: string): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "no_url" | "unsupported";
    }
> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) return { ok: false, reason: "not_found" };
  if (!current.url) return { ok: false, reason: "no_url" };
  if (!supportsYtDlp(current.source)) {
    return { ok: false, reason: "unsupported" };
  }
  enqueueAutoVideoDownload({
    saveId: current.id,
    source: current.source,
    sourceId: current.sourceId,
    url: current.url,
    force: true,
  });
  return { ok: true };
}
