import type { Source } from "@pond/schema/db";
import { z } from "zod";

export const DownloadModeSchema = z.enum(["video", "audio", "transcript"]);
export type DownloadMode = z.infer<typeof DownloadModeSchema>;

const AudioFormatSchema = z.enum(["mp3", "m4a"]);

export const DownloadRangeSchema = z
  .object({
    start: z.number().min(0).max(864_000),
    end: z.number().min(0).max(864_000),
  })
  .refine((range) => range.end - range.start >= 1, {
    message: "A clip must be at least one second long.",
  });
export type DownloadRange = z.infer<typeof DownloadRangeSchema>;

/** GIF stores every frame as a palette image, so long clips get huge fast. */
export const GIF_MAX_SECONDS = 30;
/** Frame rate a GIF gets when no rate is picked. */
export const GIF_FPS = 15;

export const DownloadContainerSchema = z.enum(["mp4", "webm", "gif"]);
export type DownloadContainer = z.infer<typeof DownloadContainerSchema>;

export const DownloadCompressionSchema = z.enum([
  "original",
  "high",
  "balanced",
  "small",
]);
export type DownloadCompression = z.infer<typeof DownloadCompressionSchema>;

export const TranscriptFormatSchema = z.enum(["txt", "srt", "vtt"]);
export type TranscriptFormat = z.infer<typeof TranscriptFormatSchema>;

export const DownloadRequestSchema = z
  .object({
    mode: DownloadModeSchema,
    maxHeight: z.number().int().min(144).max(8640).nullable().default(null),
    audioFormat: AudioFormatSchema.default("mp3"),
    range: DownloadRangeSchema.nullable().default(null),
    subtitleLang: z.string().trim().min(1).max(40).nullable().default(null),
    /** Null keeps the per-source container preference. */
    container: DownloadContainerSchema.nullable().default(null),
    /** Null keeps the source frame rate. */
    fps: z.number().int().min(1).max(120).nullable().default(null),
    compression: DownloadCompressionSchema.default("original"),
    transcriptFormat: TranscriptFormatSchema.default("txt"),
  })
  .refine(
    (request) =>
      request.container !== "gif" ||
      (request.range !== null &&
        request.range.end - request.range.start <= GIF_MAX_SECONDS),
    { message: `A GIF must be trimmed to ${GIF_MAX_SECONDS} seconds or less.` },
  );
export type DownloadRequest = z.infer<typeof DownloadRequestSchema>;

export interface DownloadHeatPoint {
  start: number;
  end: number;
  /** Relative replay intensity, 0 to 1. */
  value: number;
}

export interface DownloadChapter {
  start: number;
  end: number;
  title: string;
}

export interface DownloadStoryboardSheet {
  url: string;
  start: number;
  duration: number;
}

export interface DownloadStoryboard {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  /** Seconds covered by one tile. */
  interval: number;
  sheets: DownloadStoryboardSheet[];
}

export interface DownloadVideoOption {
  height: number;
  fps: number | null;
  /** Bytes for video and audio together, when the site reports it. */
  size: number | null;
}

export interface DownloadCaption {
  lang: string;
  name: string;
  automatic: boolean;
}

export interface DownloadSingleProbe {
  kind: "single";
  url: string;
  source: Source | null;
  site: string;
  title: string;
  author: string | null;
  duration: number | null;
  thumbnail: string | null;
  isLive: boolean;
  heatmap: DownloadHeatPoint[];
  chapters: DownloadChapter[];
  storyboard: DownloadStoryboard | null;
  videoOptions: DownloadVideoOption[];
  audioSize: number | null;
  captions: DownloadCaption[];
  /** A direct stream a media element can play, or null when the site offers none. */
  preview: string | null;
  existingSaveId: string | null;
}

export interface DownloadPlaylistEntry {
  url: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
}

export interface DownloadPlaylistProbe {
  kind: "playlist";
  url: string;
  source: Source | null;
  site: string;
  title: string;
  author: string | null;
  entries: DownloadPlaylistEntry[];
}

export type DownloadProbe = DownloadSingleProbe | DownloadPlaylistProbe;

export const DOWNLOAD_PROBE_FAILURES = [
  "invalid",
  "unsupported",
  "sign-in",
  "unavailable",
  "timeout",
  "failed",
] as const;
export type DownloadProbeFailure = (typeof DOWNLOAD_PROBE_FAILURES)[number];

export interface DownloadProbeError {
  reason: DownloadProbeFailure;
  message: string;
}

export type DownloadProbeResult =
  | { ok: true; probe: DownloadProbe }
  | ({ ok: false; source?: Source } & DownloadProbeError);

export const DownloadProbeInputSchema = z.object({
  url: z.string().trim().min(1).max(4096),
});

export const DownloadFramesInputSchema = z.object({
  url: z.string().trim().min(1).max(4096),
  count: z.number().int().min(2).max(24).default(12),
});

export const DownloadStartInputSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(4096)).min(1).max(500),
  request: DownloadRequestSchema,
});

export interface DownloadStartResult {
  ids: string[];
  failed: string[];
}

/** Export skips the library: the file goes to a folder or the clipboard. */
export const DownloadExportDestinationSchema = z.enum(["file", "clipboard"]);
export type DownloadExportDestination = z.infer<
  typeof DownloadExportDestinationSchema
>;

export const DownloadExportInputSchema = z.object({
  url: z.string().trim().min(1).max(4096),
  request: DownloadRequestSchema,
  destination: DownloadExportDestinationSchema,
});

export type DownloadExportResult =
  | {
      ok: true;
      destination: DownloadExportDestination;
      /** Null when a transcript went to the clipboard as text. */
      path: string | null;
    }
  | { ok: false; message: string };

export interface DownloadExportFolder {
  path: string;
  name: string;
}

export const DownloadRevealInputSchema = z.object({
  path: z.string().min(1).max(4096),
});

export interface DownloaderQueryInputs {
  "downloader.clipboardLinks": Record<string, never>;
  "downloader.probe": z.input<typeof DownloadProbeInputSchema>;
  "downloader.frames": z.input<typeof DownloadFramesInputSchema>;
  "downloader.start": z.input<typeof DownloadStartInputSchema>;
  "downloader.export": z.input<typeof DownloadExportInputSchema>;
  "downloader.exportFolder": Record<string, never>;
  "downloader.pickExportFolder": Record<string, never>;
  "downloader.reveal": z.input<typeof DownloadRevealInputSchema>;
}

export interface DownloaderQueryResults {
  "downloader.clipboardLinks": { urls: string[] };
  "downloader.probe": DownloadProbeResult;
  "downloader.frames": { frames: string[] };
  "downloader.start": DownloadStartResult;
  "downloader.export": DownloadExportResult;
  "downloader.exportFolder": DownloadExportFolder;
  "downloader.pickExportFolder": DownloadExportFolder | null;
  "downloader.reveal": { ok: boolean };
}

const LINK_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const MAX_LINKS = 500;

/** Every http(s) link in pasted text, in order, without trailing punctuation or repeats. */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(LINK_PATTERN)) {
    const url = match[0].replace(/[),.;:!?\]]+$/, "");
    try {
      seen.add(new URL(url).toString());
    } catch {}
    if (seen.size >= MAX_LINKS) break;
  }
  return [...seen];
}
