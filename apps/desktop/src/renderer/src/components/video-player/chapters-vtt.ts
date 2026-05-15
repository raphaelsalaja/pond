export interface ChapterCue {
  title: string;
  startSec: number;
  endSec?: number;
}

type ChapterLike =
  | { title?: string | null; startSec?: number | null; endSec?: number | null }
  | {
      title?: string | null;
      start_time?: number | null;
      end_time?: number | null;
    };

const SENTINEL_END_SEC = 359_999.999;

export function normalizeChapters(input: readonly ChapterLike[]): ChapterCue[] {
  const cues: ChapterCue[] = [];
  for (const c of input) {
    if (!c) continue;
    const title = (c.title ?? "").trim();
    if (!title) continue;
    const startRaw =
      "startSec" in c ? c.startSec : "start_time" in c ? c.start_time : null;
    const start = typeof startRaw === "number" ? startRaw : null;
    if (start === null || !Number.isFinite(start) || start < 0) continue;
    const endRaw =
      "endSec" in c ? c.endSec : "end_time" in c ? c.end_time : null;
    const end =
      typeof endRaw === "number" && Number.isFinite(endRaw) && endRaw > start
        ? endRaw
        : undefined;
    cues.push({ title, startSec: start, endSec: end });
  }
  cues.sort((a, b) => a.startSec - b.startSec);
  return cues;
}

export function chaptersToVtt(input: readonly ChapterLike[]): string | null {
  const cues = normalizeChapters(input);
  if (cues.length === 0) return null;

  const lines: string[] = ["WEBVTT", ""];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;
    const next = cues[i + 1];
    const end = cue.endSec ?? next?.startSec ?? SENTINEL_END_SEC;
    lines.push(`${formatVttTime(cue.startSec)} --> ${formatVttTime(end)}`);
    lines.push(cue.title);
    lines.push("");
  }
  return lines.join("\n");
}

export function chaptersToVttUrl(input: readonly ChapterLike[]): string | null {
  const text = chaptersToVtt(input);
  if (!text) return null;
  const blob = new Blob([text], { type: "text/vtt" });
  return URL.createObjectURL(blob);
}

function formatVttTime(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped - hours * 3600 - minutes * 60;
  const wholeSeconds = Math.floor(seconds);
  const millis = Math.round((seconds - wholeSeconds) * 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(wholeSeconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`,
  ].join(":");
}
