import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
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

/** Every other source codec stays as it is, so an unknown format is never re-encoded by accident. */
const SAFE_SOURCE_CODECS = new Set(["h264", "mpeg4", "vp8", "vp9"]);

/** Wide-gamut primaries and PQ or HLG transfer mark HDR, which the `yuv420p` encode flattens. */
const HDR_COLOR = /bt2020|smpte2084|arib-std-b67|smpte428/i;

const VIDEO_STREAM = /^\s*Stream #.*?: Video:/;

/** Audio MP4 carries without re-encoding. */
const MP4_AUDIO_CODECS = new Set(["aac", "mp3", "alac", "ac3", "eac3"]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov"]);

export interface VideoProbe {
  videoCodec: string | null;
  audioCodec: string | null;
  duration: number | null;
  pixelFormat: string | null;
  videoStreams: number;
  hdr: boolean;
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
  hash(path: string): Promise<string>;
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

interface EncodedVideo {
  file: SaveFile;
  output: string;
  path: string;
  bytesBefore: number;
  size: number;
  sha256: string;
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
    const { ffmpeg } = binariesAvailable();
    if (!ffmpeg) throw new Error("FFmpeg is required to compress videos.");
    return parseVideoProbe(await ffmpegInfo(ffmpeg, path));
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
  async hash(path) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest("hex");
  },
  size: async (path) => (await stat(path)).size,
  async commit(transaction) {
    await executeBatch([transaction]);
  },
  reportFailure(id, reason) {
    log.warn("[pond video-compression] left Save unchanged", { id, reason });
  },
};

/**
 * Re-encodes each Save's videos as HEVC in place, committing one Save at a time.
 * Originals are replaced without Undo, so every output is verified first.
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
    const encoded: EncodedVideo[] = [];
    for (const [index, file] of videos.entries()) {
      input.signal.throwIfAborted();
      const source = join(input.directory, file.path);
      const probe = await operations.probe(source);
      if (!isSafeSource(probe) || probe.duration === null) continue;
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
        duration: probe.duration,
        signal: input.signal,
      });
      const before = file.size ?? (await operations.size(source));
      const after = await operations.size(output);
      if (after > before * (1 - MIN_SAVINGS)) continue;
      if (!isFaithfulEncode(probe, await operations.probe(output)))
        throw new Error(
          `The compressed copy of ${file.path} does not match the original.`,
        );
      encoded.push({
        file,
        output,
        path: mp4Path(file.path),
        bytesBefore: before,
        size: after,
        sha256: await operations.hash(output),
      });
    }
    if (encoded.length === 0) return null;
    input.signal.throwIfAborted();
    input.assertActive?.();
    /** Encodes can take hours, so commit against the Save as it is now, not as the batch found it. */
    const { saves: fresh } = await operations.load([save.id]);
    const current = fresh.find((row) => row.id === save.id);
    if (!current) return null;
    const replacements = encoded.filter((item) =>
      isStillReplaceable(current, item),
    );
    if (replacements.length === 0) return null;
    await operations.commit(videoCompressionTransaction(current, replacements));
    return {
      bytesBefore: replacements.reduce(
        (sum, item) => sum + item.bytesBefore,
        0,
      ),
      bytesAfter: replacements.reduce((sum, item) => sum + item.size, 0),
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

/** An `.mp4` keeps its name, since a case-only rename like `.MP4` to `.mp4` collides with itself on macOS and Windows. */
function mp4Path(path: string): string {
  return extname(path).toLowerCase() === ".mp4"
    ? path
    : path.replace(/\.[^.]+$/, ".mp4");
}

/** The encoded source still sits at its path unchanged, and its MP4 name is free on a case-insensitive disk. */
function isStillReplaceable(save: VideoSave, item: EncodedVideo): boolean {
  const files = save.files ?? [];
  const source = files.find((file) => file.path === item.file.path);
  if (
    !source ||
    source.sha256 !== item.file.sha256 ||
    source.size !== item.file.size
  )
    return false;
  const target = item.path.toLowerCase();
  return !files.some(
    (file) =>
      file.path.toLowerCase() === target && file.path !== item.file.path,
  );
}

/** Windows and Linux builds may lack the HEVC decoder and `libx265` encoder the compressed copies need. */
export function assertVideoCompressionSupported(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin")
    throw new Error("Video compression is available on macOS only.");
}

/** Only one-stream, 8-bit SDR 4:2:0 sources with a known length keep everything through `yuv420p` and `0:v:0`. */
export function isSafeSource(probe: VideoProbe): boolean {
  return (
    probe.videoCodec !== null &&
    SAFE_SOURCE_CODECS.has(probe.videoCodec) &&
    probe.pixelFormat === "yuv420p" &&
    probe.videoStreams === 1 &&
    !probe.hdr &&
    probe.duration !== null &&
    probe.duration > 0
  );
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
  if (source.duration === null || encoded.duration === null) return false;
  const tolerance = Math.max(0.5, source.duration * 0.02);
  return Math.abs(source.duration - encoded.duration) <= tolerance;
}

function videoCompressionTransaction(
  save: VideoSave,
  replacements: readonly EncodedVideo[],
): Transaction {
  const byPath = new Map(replacements.map((item) => [item.file.path, item]));
  const files = (save.files ?? []).map((file): SaveFile => {
    const replacement = byPath.get(file.path);
    if (!replacement) return file;
    return {
      ...file,
      path: replacement.path,
      mimeType: "video/mp4",
      size: replacement.size,
      sha256: replacement.sha256,
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
        ? primaryReplacement.size / primary.size
        : null;
    patch.fileSize = primaryReplacement.size;
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
    fileMoves: replacements.map((item) => ({
      sourcePath: item.output,
      filename: item.path,
    })),
    meta: { actor: "user", actorReason: "video:compress" },
  };
  if (renames.length > 0) transaction.fileRenames = renames;
  return transaction;
}

function ffmpegInfo(ffmpeg: string, path: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      ffmpeg,
      ["-hide_banner", "-i", path],
      { maxBuffer: 1024 * 1024, windowsHide: true },
      (_error, _stdout, output) => resolve(String(output)),
    );
  });
}

/** Reads the fields that decide whether a source is safe to re-encode from `ffmpeg -i` output. */
export function parseVideoProbe(output: string): VideoProbe {
  const lines = output.split(/\r?\n/);
  const videoStreams = lines.filter((line) => VIDEO_STREAM.test(line));
  const video = videoStreams[0] ?? "";
  return {
    videoCodec: firstMatch(/Video:\s*([^,\s]+)/, video),
    audioCodec: firstMatch(/Stream #.*?: Audio:\s*([^,\s]+)/, output),
    duration: parseDuration(output),
    pixelFormat: firstMatch(/Video:[^,]*,\s*([a-z0-9_]+)/i, video),
    videoStreams: videoStreams.length,
    hdr: HDR_COLOR.test(video) || /DOVI configuration/i.test(output),
  };
}

function firstMatch(pattern: RegExp, text: string): string | null {
  return pattern.exec(text)?.[1]?.toLowerCase() ?? null;
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
