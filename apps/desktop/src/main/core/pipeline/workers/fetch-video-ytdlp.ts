import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { SaveFile } from "@pond/schema/db";
import log from "electron-log/main.js";
import { getVideoDownloadPrefs } from "../../prefs";
import { downloadVideo } from "../../refresh/yt-dlp";
import { isAutoVideoBlockedByStorageGuard } from "../../storage-watcher";
import { resolveYtDlpTarget } from "../specs";
import { applySavePatch, readSave } from "./apply";

export async function runFetchVideoYtdlp(saveId: string): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  const files = save.files ?? [];
  if (files.some((f) => f.kind === "video")) {
    log.debug(
      "[pond pipeline:fetch-video-ytdlp] video file already present, skipping",
      saveId,
    );
    return;
  }

  const target = resolveYtDlpTarget(save);
  if (!target) return;

  // Positive gate: require explicit `type: "video"` evidence in
  // capture.media before spawning yt-dlp. Empty media, missing rawJson, or
  // "media exists but no video" all skip — extractors that legitimately
  // carry video (TikTok, YouTube, Arena/Cosmos with video embeds) populate
  // a video entry; everything else is text-or-image and yt-dlp would just
  // error with "No video could be found".
  const captureMedia = readCaptureMedia(save.rawJson);
  if (!captureMedia?.some((m) => m.type === "video")) {
    log.debug(
      "[pond pipeline:fetch-video-ytdlp] no video media in capture, skipping",
      { saveId, kinds: captureMedia?.map((m) => m.type) ?? null },
    );
    return;
  }

  if (isAutoVideoBlockedByStorageGuard()) {
    log.info(
      "[pond pipeline:fetch-video-ytdlp] storage guard blocking; will retry",
      saveId,
    );
    return;
  }
  const prefs = await getVideoDownloadPrefs();
  if (!prefs.enabled) {
    log.debug("[pond pipeline:fetch-video-ytdlp] disabled in prefs", saveId);
    return;
  }

  log.info("[pond pipeline:fetch-video-ytdlp] downloading", {
    saveId,
    target,
    source: save.source,
  });
  const dl = await downloadVideo({ url: target, source: save.source });
  if (!dl) {
    log.info("[pond pipeline:fetch-video-ytdlp] no video produced", saveId);
    return;
  }

  try {
    const videoBuf = await readPath(dl.path);
    if (!videoBuf) {
      log.warn(
        "[pond pipeline:fetch-video-ytdlp] could not read produced file",
        dl.path,
      );
      return;
    }
    const videoExt = extname(dl.path).toLowerCase() || ".mp4";
    const newFiles: Array<{
      kind: SaveFile["kind"];
      filename: string;
      bytes: Buffer;
      mimeType?: string;
    }> = [
      {
        kind: "video",
        filename: `video${videoExt}`,
        bytes: videoBuf,
        mimeType: dl.mimeType,
      },
    ];
    if (dl.posterPath) {
      const posterBuf = await readPath(dl.posterPath);
      if (posterBuf) {
        const posterExt = extname(dl.posterPath).toLowerCase() || ".jpg";
        newFiles.push({
          kind: "poster",
          filename: `poster${posterExt}`,
          bytes: posterBuf,
          mimeType: dl.posterMimeType ?? "image/jpeg",
        });
      }
    }

    await applySavePatch(
      saveId,
      {
        mediaType: "video",
        ...(dl.infoJson
          ? { rawJson: mergeYtdlpInfo(save.rawJson, dl.infoJson) }
          : {}),
      },
      {
        actorReason: "pipeline:fetch-video-ytdlp",
        newFiles,
      },
    );
    log.info("[pond pipeline:fetch-video-ytdlp] wrote", {
      saveId,
      bytes: dl.size,
      poster: dl.posterPath != null,
    });
  } finally {
    await dl.cleanup();
  }
}

function readCaptureMedia(rawJson: unknown): Array<{ type?: string }> | null {
  if (!rawJson || typeof rawJson !== "object") return null;
  const v = rawJson as { capture?: { media?: Array<{ type?: string }> } };
  const media = v.capture?.media;
  return Array.isArray(media) ? media : null;
}

function mergeYtdlpInfo(
  rawJson: unknown,
  info: Record<string, unknown>,
): unknown {
  const base =
    rawJson && typeof rawJson === "object"
      ? (rawJson as Record<string, unknown>)
      : {};
  return { ...base, capture: base.capture ?? {}, ytdlp: info };
}

async function readPath(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}
