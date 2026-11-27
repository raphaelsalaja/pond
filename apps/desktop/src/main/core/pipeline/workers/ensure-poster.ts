import { join } from "node:path";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { isVideoFile } from "@shared/media-index";
import log from "electron-log/main.js";
import { fetchAvatarToTxFile } from "../../../lib/blob";
import { probeImageDims } from "../../../lib/image-process";
import { buildFirstFramePoster } from "../../../lib/poster-from-frame";
import {
  hasMediaDims,
  needsPosterRepair,
  posterAspectMismatch,
  posterFilename,
  posterRepairIndexes,
  remotePosterUrl,
  usesPlatformPoster,
  platformPosterUrl,
  videoPosterSlots,
} from "../../../lib/poster-policy";
import type { PosterWrite } from "../../../lib/poster-policy";
import { probeVideoDims } from "../../../lib/video-dims";
import { youtubeShortPosterPlan } from "../../../lib/youtube-thumbnail";
import { saveDir } from "../../../paths";
import { persistSave } from "../../persist-save";
import { ensureSaveThumbnail } from "../../save-thumbnail";
import { readLibraryMedia } from "../../storage/library-media-storage";
import { TransientError } from "../extractors/errors";
import { QueueWorkerPosterResultSchema } from "../worker-contract";
import { runQueueWorkerJob } from "../worker-host";
import { readSave } from "./apply";

const posterInflight = new Map<string, Promise<void>>();

interface PosterWorkerContext {
  signal: AbortSignal;
  leaseToken: string;
  cancellationFence: number;
}

interface EnsurePosterOptions {
  force?: boolean;
  forcePlatform?: boolean;
  worker?: PosterWorkerContext;
}

export type RemotePosterSave = Pick<Save, "files" | "rawJson" | "mediaUrl">;

interface RemotePosterRuntime {
  fetchAvatarToTxFile: typeof fetchAvatarToTxFile;
  persistSave: typeof persistSave;
  ensureSaveThumbnail: typeof ensureSaveThumbnail;
}

const defaultRemotePosterRuntime: RemotePosterRuntime = {
  fetchAvatarToTxFile,
  persistSave,
  ensureSaveThumbnail,
};

export function runEnsurePoster(
  saveId: string,
  opts: EnsurePosterOptions = {},
): Promise<void> {
  const existing = posterInflight.get(saveId);
  if (existing) return existing;
  const task = ensurePoster(saveId, opts).finally(() =>
    posterInflight.delete(saveId),
  );
  posterInflight.set(saveId, task);
  return task;
}

async function ensurePoster(
  saveId: string,
  opts: EnsurePosterOptions = {},
): Promise<void> {
  const save = await readSave(saveId);
  if (!save) return;

  let files = save.files ?? [];
  const slotted = videoPosterSlots(files);
  if (slotted.videos.length === 0) {
    await ensureRemotePoster(saveId, save, Boolean(opts.force));
    return;
  }

  const hydrated = await hydrateVideoDims(saveId, files);
  files = hydrated.files;
  if (hydrated.changed) {
    const primary = videoPosterSlots(files).videos[0];
    const patch: Partial<NewSave> = { files };
    if (primary && hasMediaDims(primary)) {
      patch.width = primary.width;
      patch.height = primary.height;
    }
    await persistSave(saveId, patch, {
      actorReason: "pipeline:ensure-poster:dims",
      writeInfo: true,
    });
  }

  const forcePlatform =
    Boolean(opts.forcePlatform) &&
    usesPlatformPoster(save.source) &&
    platformPosterUrl(save.rawJson) !== null;
  if (!opts.force && !forcePlatform && !needsPosterRepair(files)) {
    log.debug(
      "[pond pipeline:ensure-poster] posters already satisfy policy",
      saveId,
    );
    return;
  }

  const { videos, posters } = videoPosterSlots(files);
  const repairIndexes = new Set(
    opts.force || forcePlatform
      ? videos.map((_, index) => index)
      : posterRepairIndexes(files),
  );
  const replacing = [...repairIndexes].some(
    (index) => posters[index] !== undefined,
  );
  const targets = replacing
    ? videos.map((video, index) => ({ video, index }))
    : [...repairIndexes].map((index) => ({
        video: videos[index],
        index,
      }));

  const newFiles: Array<PosterWrite> = [];
  let wrote = false;
  for (const { video, index } of targets) {
    if (!video) continue;
    if (replacing && !repairIndexes.has(index)) {
      const kept = await readExistingPoster(saveId, posters[index], index);
      if (kept) {
        newFiles.push(kept);
        continue;
      }
    }

    const choice = await chooseVideoPoster(
      {
        video,
        hasPoster: posters[index] !== undefined,
        usePlatform: usesPlatformPoster(save.source),
      },
      {
        platformPoster: () => platformPosterFromSave(save.rawJson, index),
        framePoster: () =>
          framePoster({ saveId, video, index, worker: opts.worker }),
      },
    );
    if (choice.kind === "write") {
      newFiles.push(choice.poster);
      wrote = true;
      continue;
    }
    if (choice.kind === "keep") {
      const kept = await readExistingPoster(saveId, posters[index], index);
      if (kept) {
        log.info(
          "[pond pipeline:ensure-poster] no poster matches the video aspect; keeping the current one",
          saveId,
          index,
        );
        newFiles.push(kept);
        continue;
      }
    }
    throw new TransientError(
      `ensure-poster: no poster produced for ${saveId}/${video.path}`,
    );
  }

  if (!wrote) return;

  const options: Parameters<typeof persistSave>[2] = {
    actorReason: "pipeline:ensure-poster",
    newFiles,
  };
  if (replacing) options.replaceFilesWithKind = "poster";
  await persistSave(saveId, {}, options);
  const latest = await readSave(saveId);
  /** The thumbnail is rendered from the poster, so a new poster makes the old one stale. */
  await ensureSaveThumbnail(saveId, latest, { force: true });
  log.info(
    "[pond pipeline:ensure-poster] wrote posters",
    saveId,
    newFiles.length,
  );
}

async function hydrateVideoDims(
  saveId: string,
  files: Array<SaveFile>,
): Promise<{ files: Array<SaveFile>; changed: boolean }> {
  const probed = await Promise.all(
    files.map(async (file) => {
      if (!isVideoFile(file) || hasMediaDims(file)) {
        return { file, changed: false };
      }
      const dims = await probeVideoDims(join(saveDir(saveId), file.path));
      if (!dims) return { file, changed: false };
      return { file: { ...file, ...dims }, changed: true };
    }),
  );
  return {
    files: probed.map((entry) => entry.file),
    changed: probed.some((entry) => entry.changed),
  };
}

type VideoPosterChoice =
  | { kind: "write"; poster: PosterWrite }
  | { kind: "keep" }
  | { kind: "none" };

interface VideoPosterCandidates {
  platformPoster: () => Promise<PosterWrite | null>;
  framePoster: () => Promise<PosterWrite | null>;
}

/**
 * Picks the poster for one video slot. A platform cover must agree with the
 * video's aspect, or the video's first frame replaces it. When neither agrees,
 * an empty slot takes the best poster there is, and a slot that has a poster
 * keeps it: swapping one wrong poster for another repairs nothing, and the
 * written poster would be flagged for repair again on the next pass.
 */
export async function chooseVideoPoster(
  slot: {
    video: Pick<SaveFile, "width" | "height">;
    hasPoster: boolean;
    usePlatform: boolean;
  },
  candidates: VideoPosterCandidates,
): Promise<VideoPosterChoice> {
  const platform = slot.usePlatform ? await candidates.platformPoster() : null;
  if (platform && !posterAspectMismatch(slot.video, platform)) {
    return { kind: "write", poster: platform };
  }
  const frame = await candidates.framePoster();
  if (frame && !posterAspectMismatch(slot.video, frame)) {
    return { kind: "write", poster: frame };
  }
  const fallback = platform ?? frame;
  if (!fallback) return { kind: "none" };
  if (slot.hasPoster) return { kind: "keep" };
  return { kind: "write", poster: fallback };
}

async function framePoster(args: {
  saveId: string;
  video: SaveFile;
  index: number;
  worker?: PosterWorkerContext;
}): Promise<PosterWrite | null> {
  const source = join(saveDir(args.saveId), args.video.path);
  const filename = posterFilename(args.index, ".jpg");
  if (!args.worker) return buildFirstFramePoster(source, filename);
  const result = QueueWorkerPosterResultSchema.nullable().parse(
    await runQueueWorkerJob(
      {
        operation: "build_poster",
        sourcePath: source,
        filename,
        leaseToken: args.worker.leaseToken,
        cancellationFence: args.worker.cancellationFence,
      },
      { signal: args.worker.signal },
    ),
  );
  return result ? { ...result, bytes: Buffer.from(result.bytes) } : null;
}

export async function ensureRemotePoster(
  saveId: string,
  save: RemotePosterSave,
  force: boolean,
  runtime: RemotePosterRuntime = defaultRemotePosterRuntime,
): Promise<void> {
  if (!force && videoPosterSlots(save.files ?? []).posters.length > 0) return;
  const url = remotePosterUrl(save.rawJson, save.mediaUrl);
  const poster = await loadPoster(
    save.rawJson,
    url,
    0,
    runtime.fetchAvatarToTxFile,
  );
  if (!poster) return;
  const updated = await runtime.persistSave(
    saveId,
    {},
    {
      actorReason: "pipeline:ensure-poster",
      replaceFilesWithKind: "poster",
      newFiles: [poster],
    },
  );
  await runtime.ensureSaveThumbnail(saveId, updated, { force: true });
  log.info("[pond pipeline:ensure-poster] wrote remote poster", saveId);
}

async function platformPosterFromSave(
  rawJson: RawJson | null,
  index: number,
): Promise<PosterWrite | null> {
  return loadPoster(
    rawJson,
    platformPosterUrl(rawJson, index),
    index,
    fetchAvatarToTxFile,
  );
}

async function loadPoster(
  rawJson: RawJson | null,
  fallbackUrl: string | null,
  index: number,
  fetchImage: typeof fetchAvatarToTxFile,
): Promise<PosterWrite | null> {
  const plan = youtubeShortPosterPlan(rawJson, fallbackUrl);
  if (!plan) {
    return fallbackUrl ? posterFromUrl(fallbackUrl, index, fetchImage) : null;
  }
  let fallback: PosterWrite | null = null;
  for (const url of plan.attempts) {
    const poster = await posterFromUrl(url, index, fetchImage);
    if (!poster) continue;
    if (isPortraitPoster(poster)) return poster;
    if (url === plan.fallbackUrl) fallback = poster;
  }
  return fallback;
}

function isPortraitPoster(poster: PosterWrite): boolean {
  return (
    poster.width !== undefined &&
    poster.height !== undefined &&
    poster.width > 0 &&
    poster.height > poster.width
  );
}

async function posterFromUrl(
  url: string,
  index: number,
  fetchImage: typeof fetchAvatarToTxFile,
): Promise<PosterWrite | null> {
  const outcome = await fetchImage(url);
  if (!("file" in outcome) || !outcome.file) return null;
  const bytes = Buffer.from(outcome.file.bytes);
  if (bytes.byteLength === 0) return null;
  const dims = await probeImageDims(bytes);
  const name = outcome.file.filename;
  const ext = name.includes(".") ? `.${name.split(".").pop()}` : ".jpg";
  return {
    kind: "poster",
    filename: posterFilename(index, ext),
    bytes,
    mimeType: outcome.file.mimeType ?? "image/jpeg",
    sourceUrl: url,
    ...dims,
  };
}

async function readExistingPoster(
  saveId: string,
  poster: SaveFile | undefined,
  index: number,
): Promise<PosterWrite | null> {
  if (!poster) return null;
  try {
    const bytes = await readLibraryMedia(join(saveDir(saveId), poster.path));
    if (bytes.byteLength === 0) return null;
    const ext = poster.path.includes(".")
      ? `.${poster.path.split(".").pop()}`
      : ".jpg";
    const write: PosterWrite = {
      kind: "poster",
      filename: posterFilename(index, ext),
      bytes,
      mimeType: poster.mimeType ?? "image/jpeg",
    };
    if (poster.width && poster.height) {
      write.width = poster.width;
      write.height = poster.height;
    }
    if (poster.sourceUrl) write.sourceUrl = poster.sourceUrl;
    return write;
  } catch {
    return null;
  }
}
