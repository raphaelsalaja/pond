import { extname } from "node:path";
import type { SaveFile } from "@pond/schema/db";
import { type RawJson, walkCaptureMedia } from "@pond/schema/raw";
import {
  IMAGE_KIND,
  inferKindFromFilename,
  isOriginalImageKind,
  VIDEO_KIND,
} from "@shared/save-file-names";
import { isAvatarUrl } from "@shared/tweet-card";
import log from "electron-log/main.js";
import { fetchMediaBatch } from "../../../lib/blob";
import type { TransferOptions } from "../../../lib/download-transfer";
import { probeImageDims, processImage } from "../../../lib/image-process";
import { persistSave } from "../../persist-save";
import { getImageDownloadPrefs, getVideoDownloadPrefs } from "../../prefs";
import { ensureSaveThumbnail } from "../../save-thumbnail";
import { TerminalError, TransientError } from "../extractors/errors";
import {
  QueueWorkerImageDimsSchema,
  QueueWorkerImageResultSchema,
} from "../worker-contract";
import { runQueueWorkerJob } from "../worker-host";
import { readSave, type WriteFileArgs } from "./apply";
import { fetchSourceIcon } from "./source-icon";

interface FetchBlobsContext extends TransferOptions {
  leaseToken?: string;
  cancellationFence?: number;
}

export async function runFetchBlobs(
  saveId: string,
  ctx: FetchBlobsContext = {},
): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  if (save.source === "web") {
    try {
      await fetchSourceIcon(saveId, save);
    } catch (err) {
      log.warn("[pond pipeline:fetch-blobs] source icon failed", saveId, err);
    }
  }

  const { autoDownload } = await getVideoDownloadPrefs(save.source);
  const urls = collectMediaUrls(save.rawJson, { includeVideo: autoDownload });
  if (urls.length === 0) {
    log.debug("[pond pipeline:fetch-blobs] no media urls, skipping", saveId);
    return;
  }

  const existingFiles = save.files ?? [];
  const missing = missingMediaUrls(urls, existingFiles);
  if (missing.length === 0) {
    log.debug(
      "[pond pipeline:fetch-blobs] all media already on disk, skipping",
      saveId,
    );
    return;
  }

  const imagePrefs = await getImageDownloadPrefs(save.source);
  const imageMaxBytes = imagePrefs.maxFileSizeMb
    ? imagePrefs.maxFileSizeMb * 1024 * 1024
    : null;

  const results = await fetchMediaBatch(missing, { imageMaxBytes, ...ctx });
  const { fetched, transientMisses } = requireFetchedMedia(
    results,
    missing.length,
  );

  ctx.signal?.throwIfAborted();
  ctx.reportActivity?.({ phase: "processing" });
  const newFiles = await Promise.all(
    fetched.map(async (entry) => {
      const tx = entry.file;
      const kind: SaveFile["kind"] = tx.filename.startsWith("video")
        ? VIDEO_KIND
        : IMAGE_KIND;
      let bytes: Buffer = Buffer.from(tx.bytes);
      let filename = tx.filename;
      let mimeType = tx.mimeType;
      let dims: { width: number; height: number } | null = null;
      if (kind !== "video") {
        const processed =
          ctx.leaseToken && ctx.cancellationFence != null
            ? QueueWorkerImageResultSchema.nullable().parse(
                await runQueueWorkerJob(
                  {
                    operation: "process_image",
                    bytes: Uint8Array.from(bytes),
                    filename,
                    mimeType: mimeType ?? undefined,
                    prefs: imagePrefs,
                    leaseToken: ctx.leaseToken,
                    cancellationFence: ctx.cancellationFence,
                  },
                  { signal: ctx.signal },
                ),
              )
            : await processImage(
                bytes,
                filename,
                mimeType ?? undefined,
                imagePrefs,
              );
        if (processed) {
          bytes = Buffer.from(processed.bytes);
          filename = processed.filename;
          mimeType = processed.mimeType;
          if (processed.width && processed.height) {
            dims = { width: processed.width, height: processed.height };
          }
        }
        dims ??=
          ctx.leaseToken && ctx.cancellationFence != null
            ? QueueWorkerImageDimsSchema.nullable().parse(
                await runQueueWorkerJob(
                  {
                    operation: "probe_image",
                    bytes: Uint8Array.from(bytes),
                    leaseToken: ctx.leaseToken,
                    cancellationFence: ctx.cancellationFence,
                  },
                  { signal: ctx.signal },
                ),
              )
            : await probeImageDims(bytes);
      }
      const write: WriteFileArgs = {
        kind,
        filename,
        bytes,
        sourceUrl: entry.url,
      };
      if (mimeType) write.mimeType = mimeType;
      if (dims) {
        write.width = dims.width;
        write.height = dims.height;
      }
      return write;
    }),
  );

  /* When every media URL changed (a page's new cover, or signed CDN URLs that differ on each read), the old media would otherwise stay first and the save would gain duplicates. Replace only when every new download worked. */
  const replaceKinds = [...new Set(newFiles.map((f) => f.kind))];
  const allChanged =
    missing.length === urls.length &&
    existingFiles.some((f) => replaceKinds.includes(f.kind));
  /* Writing a partial set would leave old and new media side by side, and the retry would then see only some URLs as missing and never replace. */
  if (allChanged && transientMisses > 0) {
    throw new TransientError(
      `fetch-blobs: ${transientMisses}/${missing.length} media still pending`,
    );
  }
  const replaceStale = allChanged && newFiles.length === urls.length;
  /* Posters are matched to videos by position, so new videos need new posters. */
  if (replaceStale && replaceKinds.includes("video")) {
    replaceKinds.push("poster");
  }

  ctx.signal?.throwIfAborted();
  ctx.reportActivity?.({ phase: "saving" });
  await persistSave(
    saveId,
    { fileSize: newFiles[0]?.bytes.byteLength ?? null },
    {
      actorReason: "pipeline:fetch-blobs",
      newFiles,
      replaceFilesWithKind: replaceStale ? replaceKinds : undefined,
    },
  );
  const saved = await readSave(saveId);
  await ensureSaveThumbnail(saveId, saved, { force: replaceStale });
  log.info("[pond pipeline:fetch-blobs] wrote", {
    saveId,
    count: newFiles.length,
  });

  if (transientMisses > 0) {
    throw new TransientError(
      `fetch-blobs: ${transientMisses}/${missing.length} media still pending`,
    );
  }
}

type MediaBatchResults = Awaited<ReturnType<typeof fetchMediaBatch>>;

interface FetchedMediaSummary {
  fetched: Array<{
    url: string;
    file: NonNullable<MediaBatchResults[number]["file"]>;
  }>;
  transientMisses: number;
}

export function requireFetchedMedia(
  results: MediaBatchResults,
  requestedCount: number,
): FetchedMediaSummary {
  const fetched = results.flatMap((result) =>
    result.file ? [{ url: result.url, file: result.file }] : [],
  );
  const transientMisses = results.filter(
    (result) => result.miss === "transient",
  ).length;
  if (fetched.length > 0) return { fetched, transientMisses };
  if (transientMisses > 0) {
    throw new TransientError(
      `fetch-blobs: ${transientMisses}/${requestedCount} media transiently unavailable`,
    );
  }
  throw new TerminalError(
    `fetch-blobs: ${requestedCount}/${requestedCount} media permanently unavailable`,
  );
}

export function collectMediaUrls(
  rawJson: RawJson | null,
  opts: { includeVideo: boolean },
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of walkCaptureMedia(rawJson?.capture)) {
    if (
      m.type === "video" &&
      (!opts.includeVideo || !hasDirectVideoExtension(m.url))
    )
      continue;
    /* A harvest can store the author's avatar as tweet media; it is not part of the post, and a failed avatar fetch must not fail the save. */
    if (isAvatarUrl(m.url)) continue;
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    out.push(m.url);
  }
  return out;
}

const DIRECT_VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v"]);

function hasDirectVideoExtension(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const dot = path.lastIndexOf(".");
    if (dot === -1) return false;
    return DIRECT_VIDEO_EXTENSIONS.has(path.slice(dot));
  } catch {
    return false;
  }
}

function missingMediaUrls(
  urls: string[],
  files: ReadonlyArray<SaveFile>,
): string[] {
  if (urls.length === 0) return [];
  const mediaFiles = files.filter(
    (f) =>
      isOriginalImageKind(f.kind) ||
      f.kind === VIDEO_KIND ||
      inferKindFromFilename(f.path) === VIDEO_KIND,
  );
  const mapped = new Set(
    mediaFiles
      .map((f) => f.sourceUrl)
      .filter((u): u is string => u != null && u.length > 0),
  );
  if (mapped.size > 0) {
    return urls.filter((u) => !mapped.has(u));
  }
  if (mediaFiles.length >= urls.length) return [];
  return urls;
}

void extname;
