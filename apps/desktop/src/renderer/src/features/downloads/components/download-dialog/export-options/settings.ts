import { GIF_FPS, GIF_MAX_SECONDS } from "@shared/downloader-contracts";
import type {
  DownloadCompression,
  DownloadContainer,
  DownloadRequest,
  TranscriptFormat,
} from "@shared/downloader-contracts";
import { useState } from "react";
import type { Clip } from "../lib/clip";

export type { TranscriptFormat };
export { GIF_FPS, GIF_MAX_SECONDS };
export type Container = DownloadContainer;
export type CompressionLevel = DownloadCompression;
export type ExportDestination = "library" | "file" | "clipboard";

export function saveToHint({
  destination,
  folder,
  existingSaveId,
  copies,
}: {
  destination: ExportDestination;
  folder: string | null;
  existingSaveId: string | null;
  copies: string;
}): string | null {
  if (destination === "library") {
    return existingSaveId
      ? "Already in your library. This adds to the same save."
      : "Adds a save to your library.";
  }
  if (destination === "clipboard") {
    return `Copies ${copies}, ready to paste.`;
  }
  return folder ? `Saves to ${folder}.` : null;
}

export interface ExportSettings {
  container: Container;
  /** Frames per second, or null to keep the source rate. */
  fps: number | null;
  compression: CompressionLevel;
  transcript: TranscriptFormat;
  destination: ExportDestination;
}

export interface Settings {
  value: ExportSettings;
  patch: (next: Partial<ExportSettings>) => void;
}

/** Rough output share of the source file for each compression level. */
export const COMPRESSION_FACTOR = {
  original: 1,
  high: 0.7,
  balanced: 0.45,
  small: 0.25,
} satisfies Record<CompressionLevel, number>;

export function useExportSettings(initial?: Partial<ExportSettings>): Settings {
  const [value, setValue] = useState<ExportSettings>({
    container: "mp4",
    fps: null,
    compression: "original",
    transcript: "txt",
    destination: "library",
    ...initial,
  });
  return {
    value,
    patch: (next) => setValue((current) => ({ ...current, ...next })),
  };
}

export function gifAllowed(clip: Clip): boolean {
  return (
    clip.duration > 0 && clip.range.end - clip.range.start <= GIF_MAX_SECONDS
  );
}

/** The request main runs: the clip's trim and mode plus the export options. */
export function requestOf(clip: Clip, value: ExportSettings): DownloadRequest {
  const video = clip.request.mode === "video";
  const container =
    value.container === "gif" && !gifAllowed(clip) ? "mp4" : value.container;
  return {
    ...clip.request,
    range:
      clip.duration <= 0 || (clip.full && container !== "gif")
        ? null
        : clip.range,
    container: video ? container : null,
    fps: video ? value.fps : null,
    compression: video ? value.compression : "original",
    transcriptFormat: value.transcript,
  };
}
