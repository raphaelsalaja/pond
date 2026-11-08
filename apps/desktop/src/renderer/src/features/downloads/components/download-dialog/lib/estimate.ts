import type {
  DownloadRange,
  DownloadRequest,
  DownloadSingleProbe,
} from "@shared/downloader-contracts";

export const LIST_HEIGHTS = [2160, 1440, 1080, 720, 480, 360] as const;

/** Megabits per second for video and audio together, from typical YouTube AV1 and VP9 streams. */
const TYPICAL_MBPS = [
  [4320, 24],
  [2160, 9.2],
  [1440, 4.7],
  [1080, 1.3],
  [720, 0.8],
  [480, 0.5],
  [360, 0.34],
  [240, 0.25],
  [144, 0.19],
] as const;
const MP3_MBPS = 0.245;
const M4A_MBPS = 0.13;

export function qualityLabel(height: number): string {
  if (height >= 4320) return "8K";
  if (height >= 2160) return "4K";
  return `${height}p`;
}

function rangeFraction(
  range: DownloadRange | null,
  duration: number | null,
): number {
  if (!range || !duration) return 1;
  return Math.min(1, Math.max(0, (range.end - range.start) / duration));
}

function typicalMbps(maxHeight: number | null): number {
  const height = maxHeight ?? 1080;
  return (TYPICAL_MBPS.find(([known]) => known <= height) ??
    TYPICAL_MBPS[8])[1];
}

function bytesFor(seconds: number, mbps: number): number {
  return Math.round((seconds * mbps * 1_000_000) / 8);
}

/** The option yt-dlp lands on for a height cap: the tallest one at or under it. */
export function videoOptionFor(
  probe: Pick<DownloadSingleProbe, "videoOptions">,
  maxHeight: number | null,
): DownloadSingleProbe["videoOptions"][number] | null {
  if (maxHeight == null) return probe.videoOptions[0] ?? null;
  return (
    probe.videoOptions.find((option) => option.height <= maxHeight) ??
    probe.videoOptions.at(-1) ??
    null
  );
}

export function estimateSingle(
  probe: DownloadSingleProbe,
  request: Pick<
    DownloadRequest,
    "mode" | "maxHeight" | "audioFormat" | "range"
  >,
): number | null {
  const fraction = rangeFraction(request.range, probe.duration);
  if (request.mode === "transcript") return null;
  if (request.mode === "audio") {
    if (request.audioFormat === "m4a" && probe.audioSize) {
      return Math.round(probe.audioSize * fraction);
    }
    if (!probe.duration) return null;
    return bytesFor(
      probe.duration * fraction,
      request.audioFormat === "mp3" ? MP3_MBPS : M4A_MBPS,
    );
  }
  const option = videoOptionFor(probe, request.maxHeight);
  if (option?.size) return Math.round(option.size * fraction);
  if (!probe.duration) return null;
  return bytesFor(probe.duration * fraction, typicalMbps(request.maxHeight));
}

export function estimateByDuration(
  duration: number | null,
  request: Pick<DownloadRequest, "mode" | "maxHeight" | "audioFormat">,
): number | null {
  if (!duration || request.mode === "transcript") return null;
  if (request.mode === "audio") {
    return bytesFor(
      duration,
      request.audioFormat === "mp3" ? MP3_MBPS : M4A_MBPS,
    );
  }
  return bytesFor(duration, typicalMbps(request.maxHeight));
}
