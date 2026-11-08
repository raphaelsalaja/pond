import type {
  DownloadHeatPoint,
  DownloadRange,
  DownloadStoryboard,
} from "@shared/downloader-contracts";

export const MIN_CLIP_SECONDS = 1;
const REPLAY_FLOOR = 0.6;
const REPLAY_MIN_SECONDS = 8;
const REPLAY_MAX_SECONDS = 60;

export function clampRange(
  range: DownloadRange,
  duration: number,
): DownloadRange {
  const min = Math.min(MIN_CLIP_SECONDS, duration);
  const start = Math.min(Math.max(0, range.start), duration - min);
  const end = Math.max(Math.min(duration, range.end), start + min);
  return { start, end };
}

export function isFullRange(range: DownloadRange, duration: number): boolean {
  return range.start <= 0.25 && range.end >= duration - 0.25;
}

/** Moves the whole window, keeping its length, so dragging the middle never resizes it. */
export function shiftRange(
  range: DownloadRange,
  delta: number,
  duration: number,
): DownloadRange {
  const length = range.end - range.start;
  const start = Math.min(Math.max(0, range.start + delta), duration - length);
  return { start, end: start + length };
}

/** The span around the replay peak that stays above most of its height. */
export function mostReplayed(
  heatmap: readonly DownloadHeatPoint[],
  duration: number,
): DownloadRange | null {
  if (heatmap.length < 3) return null;
  let peak = 0;
  for (let index = 1; index < heatmap.length; index++) {
    if ((heatmap[index]?.value ?? 0) > (heatmap[peak]?.value ?? 0))
      peak = index;
  }
  const top = heatmap[peak];
  if (!top) return null;
  const floor = top.value * REPLAY_FLOOR;
  let left = peak;
  let right = peak;
  while (left > 0 && (heatmap[left - 1]?.value ?? 0) >= floor) left -= 1;
  while (
    right < heatmap.length - 1 &&
    (heatmap[right + 1]?.value ?? 0) >= floor
  )
    right += 1;
  let start = heatmap[left]?.start ?? top.start;
  let end = heatmap[right]?.end ?? top.end;
  const center = (top.start + top.end) / 2;
  if (end - start < REPLAY_MIN_SECONDS) {
    start = center - REPLAY_MIN_SECONDS / 2;
    end = center + REPLAY_MIN_SECONDS / 2;
  }
  if (end - start > REPLAY_MAX_SECONDS) {
    start = Math.max(start, center - REPLAY_MAX_SECONDS / 2);
    end = start + REPLAY_MAX_SECONDS;
  }
  const length = Math.min(end - start, duration);
  const clampedStart = Math.min(Math.max(0, start), duration - length);
  return { start: clampedStart, end: clampedStart + length };
}

export interface StoryboardTile {
  url: string;
  column: number;
  row: number;
  columns: number;
  rows: number;
  aspect: number;
}

export function storyboardTile(
  storyboard: DownloadStoryboard,
  time: number,
): StoryboardTile | null {
  const { sheets, columns, rows, interval } = storyboard;
  if (sheets.length === 0 || interval <= 0) return null;
  const sheet =
    sheets.find((item) => time < item.start + item.duration) ?? sheets.at(-1);
  if (!sheet) return null;
  const perSheet = columns * rows;
  const index = Math.min(
    perSheet - 1,
    Math.max(0, Math.floor((time - sheet.start) / interval)),
  );
  return {
    url: sheet.url,
    column: index % columns,
    row: Math.floor(index / columns),
    columns,
    rows,
    aspect: storyboard.tileWidth / storyboard.tileHeight,
  };
}

/** Catmull-Rom through the replay points, as an SVG area in a 1000 by 100 box. */
export function heatmapPath(
  heatmap: readonly DownloadHeatPoint[],
  duration: number,
): string | null {
  if (heatmap.length < 2 || duration <= 0) return null;
  const points = heatmap.map((point) => ({
    x: ((point.start + point.end) / 2 / duration) * 1000,
    y: 100 - point.value * 92,
  }));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  let d = `M 0 100 L 0 ${first.y.toFixed(1)} L ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  d += ` L 1000 ${last.y.toFixed(1)} L 1000 100 Z`;
  return d;
}

export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
