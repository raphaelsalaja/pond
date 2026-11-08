import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  type DownloadCompression,
  type DownloadRequest,
  GIF_FPS,
} from "@shared/downloader-contracts";
import { requireConversionCapability } from "../conversion-capabilities";
import { runFfmpeg } from "../convert-media";
import { binariesAvailable } from "./binaries";
import type { DownloadedVideoItem } from "./yt-dlp";

type TranscodeTarget = "mp4" | "webm" | "gif";

const X264_CRF = {
  original: 18,
  high: 20,
  balanced: 26,
  small: 32,
} satisfies Record<DownloadCompression, number>;
const VP9_CRF = {
  original: 24,
  high: 28,
  balanced: 34,
  small: 40,
} satisfies Record<DownloadCompression, number>;
const AUDIO_BITRATE = {
  original: "192k",
  high: "160k",
  balanced: "128k",
  small: "96k",
} satisfies Record<DownloadCompression, string>;
const GIF_COLORS = {
  original: 256,
  high: 256,
  balanced: 128,
  small: 64,
} satisfies Record<DownloadCompression, number>;
/** Palette GIFs above this height are mostly bytes nobody can see. */
const GIF_MAX_HEIGHT = 480;

const MIME_TYPES = {
  mp4: "video/mp4",
  webm: "video/webm",
  gif: "image/gif",
} satisfies Record<TranscodeTarget, string>;

/** The container a video download should end in, or null when anything yt-dlp produced is fine. */
export function transcodeTarget(
  request: DownloadRequest,
  extension: string,
): TranscodeTarget | null {
  if (request.mode !== "video") return null;
  if (request.container === "gif") return "gif";
  const reencode = request.fps !== null || request.compression !== "original";
  if (!request.container && !reencode) return null;
  const wanted = request.container ?? (extension === ".webm" ? "webm" : "mp4");
  return reencode || extension !== `.${wanted}` ? wanted : null;
}

export function transcodeArgs(
  request: DownloadRequest,
  target: TranscodeTarget,
  input: string,
  output: string,
): string[] {
  const args = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-i",
    input,
  ];
  const { compression, fps } = request;

  if (target === "gif") {
    const height = Math.min(
      request.maxHeight ?? GIF_MAX_HEIGHT,
      GIF_MAX_HEIGHT,
    );
    const filters = [
      `fps=${fps ?? GIF_FPS}`,
      `scale=-2:'min(${height},ih)':flags=lanczos`,
      "split[a][b]",
      `[a]palettegen=max_colors=${GIF_COLORS[compression]}:stats_mode=diff[p]`,
      "[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
    ];
    args.push(
      "-filter_complex",
      `${filters[0]},${filters[1]},${filters[2]};${filters[3]};${filters[4]}`,
      "-loop",
      "0",
      "-an",
    );
  } else {
    if (fps) args.push("-vf", `fps=${fps}`);
    if (target === "mp4") {
      args.push(
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        String(X264_CRF[compression]),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        AUDIO_BITRATE[compression],
        "-movflags",
        "+faststart",
      );
    } else {
      args.push(
        "-c:v",
        "libvpx-vp9",
        "-crf",
        String(VP9_CRF[compression]),
        "-b:v",
        "0",
        "-row-mt",
        "1",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        "-c:a",
        "libopus",
        "-b:a",
        AUDIO_BITRATE[compression],
      );
    }
  }
  args.push("-y", output);
  return args;
}

export interface TranscodedFile {
  path: string;
  mimeType: string;
  size: number;
}

/** Converts each item that needs it; untouched items pass through, and `cleanup` drops the converted files. */
export async function transcodeItems(input: {
  items: readonly DownloadedVideoItem[];
  request: DownloadRequest;
  signal?: AbortSignal | undefined;
}): Promise<{ items: DownloadedVideoItem[]; cleanup: () => Promise<void> }> {
  const { items, request } = input;
  const targets = items.map((item) =>
    transcodeTarget(request, extname(item.path).toLowerCase()),
  );
  if (targets.every((target) => target === null)) {
    return { items: [...items], cleanup: async () => {} };
  }
  const { ffmpeg } = binariesAvailable();
  if (!ffmpeg) throw new Error("FFmpeg is required to convert this download.");
  const root = await mkdtemp(join(tmpdir(), "pond-transcode-"));
  const cleanup = () => rm(root, { recursive: true, force: true });
  try {
    const converted: DownloadedVideoItem[] = [];
    for (const [index, item] of items.entries()) {
      const target = targets[index];
      if (!target) {
        converted.push(item);
        continue;
      }
      const directory = join(root, String(index));
      await mkdir(directory);
      const duration = request.range
        ? request.range.end - request.range.start
        : Number(item.infoJson?.duration) || 60;
      const file = await transcodeDownload({
        request,
        target,
        source: item.path,
        directory,
        duration,
        ffmpeg,
        signal: input.signal,
      });
      converted.push({
        ...item,
        path: file.path,
        mimeType: file.mimeType,
        size: file.size,
      });
    }
    return { items: converted, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Re-encodes a downloaded video into `directory`; the caller owns cleanup. */
async function transcodeDownload(input: {
  request: DownloadRequest;
  target: TranscodeTarget;
  source: string;
  directory: string;
  duration: number;
  ffmpeg: string;
  signal?: AbortSignal | undefined;
  onProgress?: (progress: number) => void;
}): Promise<TranscodedFile> {
  await requireConversionCapability(input.target, input.ffmpeg);
  const output = join(input.directory, `transcoded.${input.target}`);
  const run: Parameters<typeof runFfmpeg>[0] = {
    path: input.ffmpeg,
    args: transcodeArgs(input.request, input.target, input.source, output),
    signal: input.signal ?? new AbortController().signal,
    duration: Math.max(1, input.duration),
  };
  if (input.onProgress) run.onProgress = input.onProgress;
  await runFfmpeg(run);
  const { size } = await stat(output);
  return { path: output, mimeType: MIME_TYPES[input.target], size };
}
