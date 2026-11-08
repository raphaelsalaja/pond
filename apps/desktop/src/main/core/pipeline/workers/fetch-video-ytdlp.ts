import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { NewSave, Save, Source } from "@pond/schema/db";
import type { CaptureMedia, RawJson, RawYtdlp } from "@pond/schema/raw";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { isVideoFile } from "@shared/media-index";
import log from "electron-log/main.js";
import type { TransferOptions } from "../../../lib/download-transfer";
import { probeImageDims } from "../../../lib/image-process";
import { buildFirstFramePoster } from "../../../lib/poster-from-frame";
import {
  type PosterWrite,
  posterFilename,
  usesPlatformPoster,
  videoFilename,
} from "../../../lib/poster-policy";
import { probeVideoDims } from "../../../lib/video-dims";
import { persistSave } from "../../persist-save";
import { getVideoDownloadPrefs } from "../../prefs";
import {
  cuesToSubtitles,
  cuesToTranscript,
  parseCaptions,
} from "../../refresh/captions-transcript";
import { transcodeItems } from "../../refresh/download-transcode";
import { type DownloadedVideoItem, downloadVideo } from "../../refresh/yt-dlp";
import { downloadCaptions } from "../../refresh/yt-dlp-captions";
import { isAutoVideoBlockedByStorageGuard } from "../../storage-watcher";
import { TerminalError, TransientError } from "../extractors/errors";
import { expectedVideoDownloads, resolveYtDlpTarget } from "../specs";
import { saveAuthorFrom, withYtdlpAuthor } from "../ytdlp-author";
import { readSave, type WriteFileArgs } from "./apply";

export interface FetchVideoPayload {
  requested?: boolean;
  download?: DownloadRequest | undefined;
}

export type VideoDownloadSave = Pick<
  Save,
  "source" | "url" | "accountId" | "author" | "mediaType" | "files" | "rawJson"
>;

interface FetchVideoRuntime {
  readSave: (saveId: string) => Promise<VideoDownloadSave | null>;
  getVideoDownloadPrefs: typeof getVideoDownloadPrefs;
  downloadVideo: typeof downloadVideo;
  downloadCaptions: typeof downloadCaptions;
  isAutoVideoBlockedByStorageGuard: typeof isAutoVideoBlockedByStorageGuard;
  persistSave: typeof persistSave;
  transcodeItems: typeof transcodeItems;
}

const defaultRuntime: FetchVideoRuntime = {
  readSave,
  getVideoDownloadPrefs,
  downloadVideo,
  downloadCaptions,
  isAutoVideoBlockedByStorageGuard,
  persistSave,
  transcodeItems,
};

export async function runFetchVideoYtdlp(
  saveId: string,
  payload: FetchVideoPayload = {},
  ctx?: TransferOptions,
  runtime: FetchVideoRuntime = defaultRuntime,
): Promise<void> {
  const save = await runtime.readSave(saveId);
  if (!save) return;

  if (payload.download) {
    await runRequestedDownload(saveId, save, payload.download, ctx, runtime);
    return;
  }

  if (
    !payload.requested &&
    !(await runtime.getVideoDownloadPrefs(save.source)).autoDownload
  ) {
    log.debug("[pond pipeline:fetch-video-ytdlp] auto download off, skipping", {
      saveId,
      source: save.source,
    });
    return;
  }

  const expected = expectedVideoDownloads(save);
  const existingVideos = (save.files ?? []).filter(isVideoFile);
  if (expected > 0 && existingVideos.length >= expected) {
    log.debug(
      "[pond pipeline:fetch-video-ytdlp] video files already present, skipping",
      { saveId, existing: existingVideos.length, expected },
    );
    return;
  }

  const target = resolveYtDlpTarget(save);
  if (!target) return;

  const captureMedia = readCaptureMedia(save.rawJson);
  if (!captureMedia?.some((m) => m.type === "video")) {
    log.debug(
      "[pond pipeline:fetch-video-ytdlp] no video media in capture, skipping",
      { saveId, kinds: captureMedia?.map((m) => m.type) ?? null },
    );
    return;
  }

  if (!payload.requested && runtime.isAutoVideoBlockedByStorageGuard()) {
    throw new TransientError(
      `fetch-video-ytdlp: storage guard blocking ${saveId}`,
    );
  }

  /** YouTube watch URLs share a playlist id; never expand those. Tweets with quoted/carousel clips must. */
  const allowPlaylist =
    expected > 1 && save.source !== "youtube" && save.source !== "pinterest";

  log.info("[pond pipeline:fetch-video-ytdlp] downloading", {
    saveId,
    target,
    source: save.source,
    expected,
    allowPlaylist,
  });
  const request: Parameters<typeof downloadVideo>[0] = {
    url: target,
    source: save.source,
    accountId: save.accountId,
    allowPlaylist,
    expectedCount: expected,
  };
  if (ctx?.signal) request.signal = ctx.signal;
  if (ctx?.reportActivity) request.reportActivity = ctx.reportActivity;
  const dl = await runtime.downloadVideo(request);
  if (!dl || dl.items.length === 0) {
    throw new TransientError(
      `fetch-video-ytdlp: no video produced for ${saveId}`,
    );
  }

  try {
    ctx?.signal?.throwIfAborted();
    ctx?.reportActivity?.({ phase: "processing" });
    const newFiles: WriteFileArgs[] = [];

    for (let i = 0; i < dl.items.length; i++) {
      const item = dl.items[i];
      if (!item) continue;
      const files = await filesForItem(item, i, save.source);
      if (!files) {
        throw new TransientError(
          `fetch-video-ytdlp: could not read produced file for ${saveId}`,
        );
      }
      newFiles.push(...files);
    }

    const primary = dl.items[0];
    const primaryDims = newFiles.find((f) => f.kind === "video");
    const patch: Partial<NewSave> = { mediaType: "video" };
    if (primaryDims?.width && primaryDims.height) {
      patch.width = primaryDims.width;
      patch.height = primaryDims.height;
    }
    if (primary?.infoJson) {
      const rawJson = mergeYtdlpInfo(save.rawJson, primary.infoJson);
      patch.rawJson = rawJson;
      if (!save.author) {
        const author = saveAuthorFrom(rawJson.capture);
        if (author) patch.author = author;
      }
    }
    ctx?.signal?.throwIfAborted();
    ctx?.reportActivity?.({ phase: "saving" });
    await runtime.persistSave(saveId, patch, {
      actorReason: "pipeline:fetch-video-ytdlp",
      replaceFilesWithKind: ["video", "poster"],
      newFiles,
    });
    log.info("[pond pipeline:fetch-video-ytdlp] wrote", {
      saveId,
      count: dl.items.length,
      bytes: dl.items.reduce((sum, item) => sum + item.size, 0),
    });
  } finally {
    await dl.cleanup();
  }
}

const CAPTIONS_TRANSCRIPT_MODEL = "captions";

async function runRequestedDownload(
  saveId: string,
  save: VideoDownloadSave,
  request: DownloadRequest,
  ctx: TransferOptions | undefined,
  runtime: FetchVideoRuntime,
): Promise<void> {
  const target = resolveYtDlpTarget(save) ?? save.url;
  if (!target) {
    throw new TerminalError(`fetch-video-ytdlp: no link to download ${saveId}`);
  }
  if (request.mode === "transcript") {
    await runCaptionsDownload(saveId, save, target, request, ctx, runtime);
    return;
  }

  const expected = Math.max(1, expectedVideoDownloads(save));
  const allowPlaylist =
    expected > 1 && save.source !== "youtube" && save.source !== "pinterest";
  log.info("[pond pipeline:fetch-video-ytdlp] requested download", {
    saveId,
    target,
    mode: request.mode,
    maxHeight: request.maxHeight,
    range: request.range,
    container: request.container,
    fps: request.fps,
    compression: request.compression,
  });
  const args: Parameters<typeof downloadVideo>[0] = {
    url: target,
    source: save.source,
    accountId: save.accountId,
    allowPlaylist,
    expectedCount: expected,
    request,
  };
  if (ctx?.signal) args.signal = ctx.signal;
  if (ctx?.reportActivity) args.reportActivity = ctx.reportActivity;
  const dl = await runtime.downloadVideo(args);
  if (!dl || dl.items.length === 0) {
    throw new TransientError(
      `fetch-video-ytdlp: nothing produced for ${saveId}`,
    );
  }

  let converted: Awaited<ReturnType<typeof transcodeItems>> | null = null;
  try {
    ctx?.signal?.throwIfAborted();
    ctx?.reportActivity?.({ phase: "processing" });
    converted = await runtime.transcodeItems({
      items: dl.items,
      request,
      signal: ctx?.signal,
    });
    const files = save.files ?? [];
    const hasVideo = files.some(isVideoFile);
    const hasPoster = files.some((file) => file.kind === "poster");
    const audio = request.mode === "audio";
    const gif = request.container === "gif";
    /** A clip of something already saved sits beside the full video rather than replacing it. */
    const addsBeside = !audio && (gif || Boolean(request.range)) && hasVideo;

    const newFiles: WriteFileArgs[] = [];
    for (let i = 0; i < converted.items.length; i++) {
      const item = converted.items[i];
      if (!item) continue;
      const ext = extname(item.path).toLowerCase();
      const plan: ItemPlan = audio
        ? {
            kind: "audio",
            filename: clipFilename(request, i, ext, "audio"),
            poster: hasPoster ? "none" : "platform",
          }
        : gif
          ? {
              kind: "image",
              filename: clipFilename(request, i, ext, "clip"),
              poster: hasPoster ? "none" : "platform",
            }
          : {
              kind: "video",
              filename: addsBeside
                ? clipFilename(request, i, ext, "clip")
                : videoFilename(i, ext || ".mp4"),
              poster: addsBeside ? "none" : "auto",
            };
      const produced = await filesForItem(item, i, save.source, plan);
      if (!produced) {
        throw new TransientError(
          `fetch-video-ytdlp: could not read produced file for ${saveId}`,
        );
      }
      newFiles.push(...produced);
    }

    const patch: Partial<NewSave> = {};
    if (gif) {
      if (!hasVideo) patch.mediaType = "image";
    } else if (!audio) {
      patch.mediaType = "video";
      const dims = newFiles.find((file) => file.kind === "video");
      if (!addsBeside && dims?.width && dims.height) {
        patch.width = dims.width;
        patch.height = dims.height;
      }
    } else if (!hasVideo) {
      patch.mediaType = "audio";
    }
    applyYtdlpInfo(save, dl.items[0]?.infoJson ?? null, patch);

    ctx?.signal?.throwIfAborted();
    ctx?.reportActivity?.({ phase: "saving" });
    const replace: WriteFileArgs["kind"][] = audio
      ? ["audio"]
      : addsBeside || gif
        ? []
        : ["video", "poster"];
    await runtime.persistSave(saveId, patch, {
      actorReason: "pipeline:fetch-video-ytdlp",
      replaceFilesWithKind: replace,
      newFiles,
    });
  } finally {
    await converted?.cleanup();
    await dl.cleanup();
  }
}

async function runCaptionsDownload(
  saveId: string,
  save: VideoDownloadSave,
  target: string,
  request: DownloadRequest,
  ctx: TransferOptions | undefined,
  runtime: FetchVideoRuntime,
): Promise<void> {
  ctx?.reportActivity?.({ phase: "harvesting" });
  const args: Parameters<typeof downloadCaptions>[0] = {
    url: target,
    source: save.source,
    accountId: save.accountId,
    lang: request.subtitleLang,
  };
  if (ctx?.signal) args.signal = ctx.signal;
  const captions = await runtime.downloadCaptions(args);
  if (!captions) {
    throw new TerminalError(`fetch-video-ytdlp: no captions for ${saveId}`);
  }
  try {
    ctx?.reportActivity?.({ phase: "processing" });
    const transcript = cuesToTranscript(
      parseCaptions(captions.text),
      request.range,
    );
    if (!transcript) {
      throw new TerminalError(
        `fetch-video-ytdlp: empty captions for ${saveId}`,
      );
    }
    const files = save.files ?? [];
    const newFiles: WriteFileArgs[] = [
      {
        kind: "text_file",
        filename: "transcript.txt",
        bytes: Buffer.from(`${transcript}\n`, "utf8"),
        mimeType: "text/plain",
      },
      subtitleFile(captions, request),
    ];
    if (captions.posterPath && !files.some((file) => file.kind === "poster")) {
      const bytes = await readPath(captions.posterPath);
      if (bytes) {
        newFiles.push({
          kind: "poster",
          filename: posterFilename(0, extname(captions.posterPath) || ".jpg"),
          bytes,
          mimeType: captions.posterMimeType ?? "image/jpeg",
          ...(await probeImageDims(bytes)),
        });
      }
    }
    const patch: Partial<NewSave> = {
      transcript,
      transcriptModel: CAPTIONS_TRANSCRIPT_MODEL,
    };
    const hasMedia = files.some(
      (file) => isVideoFile(file) || file.kind === "audio",
    );
    if (!hasMedia) patch.mediaType = "text";
    applyYtdlpInfo(save, captions.infoJson, patch);
    ctx?.reportActivity?.({ phase: "saving" });
    await runtime.persistSave(saveId, patch, {
      actorReason: "pipeline:fetch-video-ytdlp",
      replaceFilesWithKind: ["text_file", "subtitle"],
      newFiles,
    });
  } finally {
    await captions.cleanup();
  }
}

function applyYtdlpInfo(
  save: VideoDownloadSave,
  info: RawYtdlp | null,
  patch: Partial<NewSave>,
): void {
  if (!info) return;
  const rawJson = mergeYtdlpInfo(save.rawJson, info);
  patch.rawJson = rawJson;
  if (!save.author) {
    const author = saveAuthorFrom(rawJson.capture);
    if (author) patch.author = author;
  }
}

function clipFilename(
  request: DownloadRequest,
  index: number,
  ext: string,
  stem: "clip" | "audio",
): string {
  const suffix = index > 0 ? `-${index + 1}` : "";
  const range = request.range
    ? `-${Math.floor(request.range.start)}-${Math.ceil(request.range.end)}`
    : "";
  return `${stem}${range}${suffix}${ext}`;
}

const SUBTITLE_MIME_TYPES = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
} as const;

/** Text keeps the site's caption file; SRT and VTT are rebuilt so a trim shifts their timings. */
function subtitleFile(
  captions: { text: string; subtitle: { filename: string; mimeType: string } },
  request: DownloadRequest,
): WriteFileArgs {
  const format = request.transcriptFormat;
  if (format === "txt") {
    return {
      kind: "subtitle",
      filename: captions.subtitle.filename,
      bytes: Buffer.from(captions.text, "utf8"),
      mimeType: captions.subtitle.mimeType,
    };
  }
  return {
    kind: "subtitle",
    filename: `transcript.${format}`,
    bytes: Buffer.from(
      cuesToSubtitles(parseCaptions(captions.text), format, request.range),
      "utf8",
    ),
    mimeType: SUBTITLE_MIME_TYPES[format],
  };
}

interface ItemPlan {
  kind: "video" | "audio" | "image";
  filename: string;
  /** `auto` follows the per-source poster policy; `platform` keeps only the site's thumbnail. */
  poster: "auto" | "platform" | "none";
}

async function filesForItem(
  item: DownloadedVideoItem,
  index: number,
  source: Source | null,
  plan: ItemPlan = {
    kind: "video",
    filename: videoFilename(index, extname(item.path).toLowerCase() || ".mp4"),
    poster: "auto",
  },
): Promise<WriteFileArgs[] | null> {
  const [mediaBuf, platformPosterBuf, ...subtitleBufs] = await Promise.all([
    readPath(item.path),
    item.posterPath && plan.poster !== "none"
      ? readPath(item.posterPath)
      : Promise.resolve(null),
    ...item.subtitles.map((sub) => readPath(sub.path)),
  ]);
  if (!mediaBuf) return null;

  const dims =
    plan.kind === "video"
      ? (dimsFromYtdlpInfo(item.infoJson) ?? (await probeVideoDims(item.path)))
      : plan.kind === "image"
        ? await probeImageDims(mediaBuf)
        : null;
  const out: WriteFileArgs[] = [
    {
      kind: plan.kind,
      filename: plan.filename,
      bytes: mediaBuf,
      mimeType: item.mimeType,
      ...dims,
    },
  ];

  if (plan.poster === "auto") {
    const poster = await resolvePoster({
      source,
      index,
      videoPath: item.path,
      platformPath: item.posterPath,
      platformBytes: platformPosterBuf,
      platformMimeType: item.posterMimeType,
    });
    if (poster) out.push(poster);
  } else if (
    plan.poster === "platform" &&
    platformPosterBuf &&
    item.posterPath
  ) {
    out.push({
      kind: "poster",
      filename: posterFilename(index, extname(item.posterPath) || ".jpg"),
      bytes: platformPosterBuf,
      mimeType: item.posterMimeType ?? "image/jpeg",
      ...(await probeImageDims(platformPosterBuf)),
    });
  }

  for (let i = 0; i < item.subtitles.length; i++) {
    const sub = item.subtitles[i];
    const subBuf = subtitleBufs[i];
    if (!sub || !subBuf) continue;
    out.push({
      kind: "subtitle",
      filename: sub.filename,
      bytes: subBuf,
      mimeType: sub.mimeType,
    });
  }

  return out;
}

async function resolvePoster(args: {
  source: Source | null;
  index: number;
  videoPath: string;
  platformPath: string | null;
  platformBytes: Buffer | null;
  platformMimeType: string | null;
}): Promise<PosterWrite | null> {
  if (
    usesPlatformPoster(args.source) &&
    args.platformBytes &&
    args.platformPath
  ) {
    const ext = extname(args.platformPath).toLowerCase() || ".jpg";
    const dims = await probeImageDims(args.platformBytes);
    return {
      kind: "poster",
      filename: posterFilename(args.index, ext),
      bytes: args.platformBytes,
      mimeType: args.platformMimeType ?? "image/jpeg",
      ...dims,
    };
  }
  return buildFirstFramePoster(
    args.videoPath,
    posterFilename(args.index, ".jpg"),
  );
}

function readCaptureMedia(rawJson: RawJson | null): CaptureMedia[] | null {
  const media = rawJson?.capture?.media;
  return Array.isArray(media) ? media : null;
}

const CAPTURELESS = storedAsRawJson({ capture: {} });

function mergeYtdlpInfo(
  rawJson: RawJson | null | undefined,
  info: RawYtdlp,
): RawJson {
  const base = rawJson ?? CAPTURELESS;
  const capture = withYtdlpAuthor(base.capture ?? CAPTURELESS.capture, info);
  return { ...base, capture, ytdlp: info };
}

function dimsFromYtdlpInfo(
  info: RawYtdlp | null | undefined,
): { width: number; height: number } | null {
  if (!info) return null;
  const width = Number(info.width);
  const height = Number(info.height);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return { width, height };
  }
  return null;
}

async function readPath(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch {
    return null;
  }
}
