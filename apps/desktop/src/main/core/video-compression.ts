import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { type Save, type SaveFile, saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { inArray } from "drizzle-orm";
import log from "electron-log/main.js";
import type {
  VideoCompressionQuality,
  VideoCompressionRequest,
} from "../../shared/conversion-contracts";
import { getDb } from "../db";
import { resolvePaths, saveDirIn } from "../paths";
import { runFfmpeg } from "./convert-media";
import { executeBatch } from "./executor";
import { extractMediaMetadata } from "./media-metadata";
import { binariesAvailable } from "./refresh/binaries";

type VideoSave = Pick<
  Save,
  "id" | "files" | "fileSize" | "videoCodec" | "bitrate"
>;

/** x265 CRF per quality. 26 measured SSIM ≥ 0.995 against H.264 sources from X/Twitter. */
const X265_CRF = {
  high: 23,
  balanced: 26,
  small: 30,
} satisfies Record<VideoCompressionQuality, number>;

/**
 * x265 at the medium preset encodes 4K 60 fps sources near 0.3× real time on
 * Apple silicon, so the default four-times-duration budget kills good encodes.
 */
const ENCODE_SECONDS_PER_MEDIA_SECOND = 30;
const MIN_ENCODE_TIMEOUT_MS = 10 * 60_000;
const MAX_ENCODE_TIMEOUT_MS = 6 * 60 * 60_000;

/** A rewrite must save at least this share of the original, or the original stays. */
const MIN_SAVINGS = 0.1;

/** Codecs that already compress at least as well as HEVC at these settings. */
const EFFICIENT_CODECS = new Set(["hevc", "h265", "av1", "vp9"]);

/** Audio MP4 carries without re-encoding. */
const MP4_AUDIO_CODECS = new Set(["aac", "mp3", "alac", "ac3", "eac3"]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"]);

export interface VideoProbe {
  videoCodec: string | null;
  audioCodec: string | null;
  duration: number | null;
}

export interface VideoCompressionRuntime {
  load(ids: readonly string[]): Promise<{ root: string; saves: VideoSave[] }>;
  probe(path: string): Promise<VideoProbe>;
  encode(input: {
    source: string;
    output: string;
    args: string[];
    duration: number;
    signal: AbortSignal;
  }): Promise<void>;
  workspace(): Promise<{ path: string; cleanup: () => Promise<void> }>;
  read(path: string): Promise<Buffer>;
  size(path: string): Promise<number>;
  commit(transaction: Transaction): Promise<void>;
  reportFailure(id: string, reason: string): void;
}

export interface VideoCompressionResult {
  changed: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
}

const runtime: VideoCompressionRuntime = {
  async load(ids) {
    const root = resolvePaths().libraryRoot;
    const db = await getDb();
    const rows = db
      .select()
      .from(saves)
      .where(inArray(saves.id, [...ids]))
      .all();
    return { root, saves: rows };
  },
  async probe(path) {
    const metadata = await extractMediaMetadata(path);
    return {
      videoCodec: metadata.videoCodec?.toLowerCase() ?? null,
      audioCodec: metadata.audioCodec?.toLowerCase() ?? null,
      duration: await probeDuration(path),
    };
  },
  async encode(input) {
    const { ffmpeg } = binariesAvailable();
    if (!ffmpeg) throw new Error("FFmpeg is required to compress videos.");
    await runFfmpeg({
      path: ffmpeg,
      args: input.args,
      signal: input.signal,
      duration: input.duration,
      timeoutMs: encodeTimeout(input.duration),
    });
  },
  async workspace() {
    const path = await mkdtemp(join(tmpdir(), "pond-video-compress-"));
    return { path, cleanup: () => rm(path, { recursive: true, force: true }) };
  },
  read: (path) => readFile(path),
  size: async (path) => (await stat(path)).size,
  async commit(transaction) {
    await executeBatch([transaction]);
  },
  reportFailure(id, reason) {
    log.warn("[pond video-compression] left Save unchanged", { id, reason });
  },
};

/**
 * Re-encodes the video files of each Save as HEVC in place. Each Save commits
 * on its own so memory stays bounded by one video and finished work survives a
 * cancel. Originals are replaced without Undo: keeping them would defeat the
 * purpose, so every output is verified before it replaces anything.
 */
export async function compressExistingVideos(
  input: VideoCompressionRequest & {
    signal: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
    assertActive?: () => void;
  },
  operations: VideoCompressionRuntime = runtime,
): Promise<VideoCompressionResult> {
  const ids = [...new Set(input.ids)];
  const { root, saves: rows } = await operations.load(ids);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const crf = X265_CRF[input.quality];
  const result: VideoCompressionResult = {
    changed: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };
  for (const [index, id] of ids.entries()) {
    input.signal.throwIfAborted();
    input.assertActive?.();
    const save = byId.get(id);
    let outcome: { bytesBefore: number; bytesAfter: number } | null = null;
    try {
      outcome = save
        ? await compressSaveVideos({
            save,
            directory: saveDirIn(root, id),
            crf,
            signal: input.signal,
            assertActive: input.assertActive,
            operations,
          })
        : null;
    } catch (error) {
      /** Cancellation and a library switch end the batch; one bad video does not. */
      input.signal.throwIfAborted();
      input.assertActive?.();
      operations.reportFailure(
        id,
        error instanceof Error ? error.message : "Compression failed.",
      );
      result.failed += 1;
      input.onProgress?.(index + 1, ids.length);
      continue;
    }
    if (outcome) {
      result.changed += 1;
      result.bytesBefore += outcome.bytesBefore;
      result.bytesAfter += outcome.bytesAfter;
    } else {
      result.skipped += 1;
    }
    input.onProgress?.(index + 1, ids.length);
  }
  return result;
}

async function compressSaveVideos(input: {
  save: VideoSave;
  directory: string;
  crf: number;
  signal: AbortSignal;
  assertActive: (() => void) | undefined;
  operations: VideoCompressionRuntime;
}): Promise<{ bytesBefore: number; bytesAfter: number } | null> {
  const { save, operations } = input;
  const videos = (save.files ?? []).filter(isCompressibleVideo);
  if (videos.length === 0) return null;
  const workspace = await operations.workspace();
  try {
    const replacements: Array<{
      file: SaveFile;
      bytes: Buffer;
      path: string;
    }> = [];
    for (const [index, file] of videos.entries()) {
      input.signal.throwIfAborted();
      const source = join(input.directory, file.path);
      const probe = await operations.probe(source);
      if (!probe.videoCodec || EFFICIENT_CODECS.has(probe.videoCodec)) continue;
      const output = join(workspace.path, `${index}.mp4`);
      await operations.encode({
        source,
        output,
        args: hevcArguments({
          source,
          output,
          crf: input.crf,
          copyAudio:
            probe.audioCodec !== null && MP4_AUDIO_CODECS.has(probe.audioCodec),
        }),
        duration: probe.duration ?? 60,
        signal: input.signal,
      });
      const before = file.size ?? (await operations.size(source));
      const after = await operations.size(output);
      if (after > before * (1 - MIN_SAVINGS)) continue;
      const encoded = await operations.probe(output);
      if (!isFaithfulEncode(probe, encoded))
        throw new Error(
          `The compressed copy of ${file.path} does not match the original.`,
        );
      replacements.push({
        file,
        bytes: await operations.read(output),
        path: file.path.replace(/\.[^.]+$/, ".mp4"),
      });
    }
    if (replacements.length === 0) return null;
    input.signal.throwIfAborted();
    input.assertActive?.();
    const transaction = videoCompressionTransaction(save, replacements);
    await operations.commit(transaction);
    return {
      bytesBefore: replacements.reduce(
        (sum, item) => sum + (item.file.size ?? 0),
        0,
      ),
      bytesAfter: replacements.reduce(
        (sum, item) => sum + item.bytes.length,
        0,
      ),
    };
  } finally {
    await workspace.cleanup();
  }
}

function isCompressibleVideo(file: SaveFile): boolean {
  if (file.kind !== "video" && !file.mimeType?.startsWith("video/"))
    return false;
  return VIDEO_EXTENSIONS.has(extname(file.path).toLowerCase());
}

export function hevcArguments(input: {
  source: string;
  output: string;
  crf: number;
  copyAudio: boolean;
}): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-i",
    input.source,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-map_metadata",
    "0",
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v",
    "libx265",
    "-preset",
    "medium",
    "-crf",
    String(input.crf),
    "-pix_fmt",
    "yuv420p",
    "-x265-params",
    "log-level=error",
    /** `hvc1` lets QuickTime, Safari, and Chromium on macOS play the file. */
    "-tag:v",
    "hvc1",
    ...(input.copyAudio ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"]),
    "-movflags",
    "+faststart",
    "-y",
    input.output,
  ];
}

/** The encode is HEVC and keeps the source's length within half a second or 2%. */
export function isFaithfulEncode(
  source: VideoProbe,
  encoded: VideoProbe,
): boolean {
  if (encoded.videoCodec !== "hevc") return false;
  if (source.audioCodec !== null && encoded.audioCodec === null) return false;
  if (source.duration === null) return true;
  if (encoded.duration === null) return false;
  const tolerance = Math.max(0.5, source.duration * 0.02);
  return Math.abs(source.duration - encoded.duration) <= tolerance;
}

function videoCompressionTransaction(
  save: VideoSave,
  replacements: ReadonlyArray<{ file: SaveFile; bytes: Buffer; path: string }>,
): Transaction {
  const byPath = new Map(replacements.map((item) => [item.file.path, item]));
  const files = (save.files ?? []).map((file): SaveFile => {
    const replacement = byPath.get(file.path);
    if (!replacement) return file;
    return {
      ...file,
      path: replacement.path,
      mimeType: "video/mp4",
      size: replacement.bytes.length,
      sha256: createHash("sha256").update(replacement.bytes).digest("hex"),
    };
  });
  const primary = (save.files ?? []).find(isCompressibleVideo);
  const primaryReplacement = primary ? byPath.get(primary.path) : undefined;
  const patch: Partial<VideoSave> = { files };
  const before: Partial<VideoSave> = { files: save.files };
  /** Save-level media fields describe the primary video only when its size matches. */
  if (primary && primaryReplacement && save.fileSize === primary.size) {
    const ratio =
      primary.size && primary.size > 0
        ? primaryReplacement.bytes.length / primary.size
        : null;
    patch.fileSize = primaryReplacement.bytes.length;
    patch.videoCodec = "hevc";
    patch.bitrate =
      save.bitrate !== null && ratio !== null
        ? Math.round(save.bitrate * ratio)
        : save.bitrate;
    before.fileSize = save.fileSize;
    before.videoCodec = save.videoCodec;
    before.bitrate = save.bitrate;
  }
  const renames = replacements
    .filter((item) => item.path !== item.file.path)
    .map((item) => ({ from: item.file.path, to: item.path }));
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: save.id,
    before,
    patch,
    files: replacements.map((item) => ({
      filename: item.path,
      bytes: item.bytes,
      mimeType: "video/mp4",
    })),
    meta: { actor: "user", actorReason: "video:compress" },
  };
  if (renames.length > 0) transaction.fileRenames = renames;
  return transaction;
}

async function probeDuration(path: string): Promise<number | null> {
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) return null;
  const stderr = await new Promise<string>((resolve) => {
    execFile(
      ffmpeg,
      ["-hide_banner", "-i", path],
      { maxBuffer: 1024 * 1024, windowsHide: true },
      (_error, _stdout, output) => resolve(String(output)),
    );
  });
  return parseDuration(stderr);
}

export function encodeTimeout(duration: number): number {
  return Math.min(
    MAX_ENCODE_TIMEOUT_MS,
    Math.max(
      MIN_ENCODE_TIMEOUT_MS,
      duration * ENCODE_SECONDS_PER_MEDIA_SECOND * 1000,
    ),
  );
}

export function parseDuration(output: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(output);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
