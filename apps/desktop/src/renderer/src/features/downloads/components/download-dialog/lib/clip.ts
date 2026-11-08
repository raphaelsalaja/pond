import type {
  DownloadHeatPoint,
  DownloadRange,
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";
import type { CSSProperties } from "react";
import { estimateSingle } from "./estimate";
import { clampRange, isFullRange, mostReplayed } from "./range";

export interface Clip {
  probe: DownloadSingleProbe;
  duration: number;
  frames: readonly string[];
  heatmap: readonly DownloadHeatPoint[];
  replay: DownloadRange | null;
  request: DownloadRequest;
  range: DownloadRange;
  full: boolean;
  size: number | null;
  patch: (patch: Partial<DownloadRequest>) => void;
  setRange: (range: DownloadRange) => void;
}

export function clipOf(
  probe: DownloadSingleProbe,
  frames: readonly string[],
  request: DownloadRequest,
  patch: (patch: Partial<DownloadRequest>) => void,
): Clip {
  const duration = probe.duration ?? 0;
  const range = request.range ?? { start: 0, end: duration };
  return {
    probe,
    duration,
    frames: frames.length ? frames : probe.thumbnail ? [probe.thumbnail] : [],
    heatmap: probe.heatmap,
    replay: mostReplayed(probe.heatmap, duration),
    request,
    range,
    full: isFullRange(range, duration),
    size: estimateSingle(probe, request),
    patch,
    setRange: (next) => patch({ range: clampRange(next, duration) }),
  };
}

/** The frame nearest a time, from the evenly spaced frames yt-dlp pulled. */
export function frameAt(clip: Clip, time: number): string | null {
  if (clip.frames.length === 0 || clip.duration <= 0) return null;
  const index = Math.min(
    clip.frames.length - 1,
    Math.floor((time / clip.duration) * clip.frames.length),
  );
  return clip.frames[index] ?? null;
}

export function percentOf(clip: Clip, time: number): string {
  return clip.duration > 0 ? `${(time / clip.duration) * 100}%` : "0%";
}

export function rangeStyle(clip: Clip): CSSProperties {
  const style: CSSProperties & { "--start": string; "--end": string } = {
    "--start": percentOf(clip, clip.range.start),
    "--end": percentOf(clip, clip.range.end),
  };
  return style;
}
