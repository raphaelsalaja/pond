import type { DownloadRange } from "@shared/downloader-contracts";

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

const TIMING =
  /^((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
const PARAGRAPH_SECONDS = 30;

function seconds(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function clean(line: string): string {
  return line
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads WebVTT or SRT cues; YouTube's rolling captions repeat each line, so lines dedupe against the last one kept. */
export function parseCaptions(text: string): CaptionCue[] {
  const cues: CaptionCue[] = [];
  let last = "";
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex < 0) continue;
    const match = TIMING.exec(lines[timingIndex] ?? "");
    if (!match?.[1] || !match[2]) continue;
    const start = seconds(match[1]);
    const end = seconds(match[2]);
    for (const raw of lines.slice(timingIndex + 1)) {
      const line = clean(raw);
      if (!line || line === last) continue;
      last = line;
      cues.push({ start, end, text: line });
    }
  }
  return cues;
}

export function formatTimestamp(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function cueStamp(totalSeconds: number, separator: "," | "."): string {
  const millis = Math.max(0, Math.round(totalSeconds * 1000));
  const h = String(Math.floor(millis / 3_600_000)).padStart(2, "0");
  const m = String(Math.floor((millis % 3_600_000) / 60_000)).padStart(2, "0");
  const s = String(Math.floor((millis % 60_000) / 1000)).padStart(2, "0");
  const ms = String(millis % 1000).padStart(3, "0");
  return `${h}:${m}:${s}${separator}${ms}`;
}

/** SubRip or WebVTT, clipped to the range and shifted so the clip starts at zero. */
export function cuesToSubtitles(
  cues: CaptionCue[],
  format: "srt" | "vtt",
  range: DownloadRange | null = null,
): string {
  const offset = range?.start ?? 0;
  const merged: CaptionCue[] = [];
  for (const cue of cues) {
    if (range && (cue.end <= range.start || cue.start >= range.end)) continue;
    const start = Math.max(0, cue.start - offset);
    const end = Math.max(
      start,
      Math.min(cue.end, range?.end ?? cue.end) - offset,
    );
    const last = merged.at(-1);
    if (last && last.start === start && last.end === end) {
      last.text = `${last.text}\n${cue.text}`;
    } else {
      merged.push({ start, end, text: cue.text });
    }
  }
  const separator = format === "srt" ? "," : ".";
  const blocks = merged.map((cue, index) => {
    const timing = `${cueStamp(cue.start, separator)} --> ${cueStamp(cue.end, separator)}`;
    return format === "srt"
      ? `${index + 1}\n${timing}\n${cue.text}`
      : `${timing}\n${cue.text}`;
  });
  const body = blocks.join("\n\n");
  return format === "srt" ? `${body}\n` : `WEBVTT\n\n${body}\n`;
}

/** Paragraphs of about thirty seconds, each led by its timestamp, relative to the clip when trimmed. */
export function cuesToTranscript(
  cues: CaptionCue[],
  range: DownloadRange | null = null,
): string {
  const offset = range?.start ?? 0;
  const paragraphs: string[] = [];
  let current: { start: number; words: string[] } | null = null;
  for (const cue of cues) {
    if (range && (cue.end <= range.start || cue.start >= range.end)) continue;
    const at = Math.max(0, cue.start - offset);
    if (!current || at - current.start >= PARAGRAPH_SECONDS) {
      if (current) {
        paragraphs.push(
          `${formatTimestamp(current.start)} ${current.words.join(" ")}`,
        );
      }
      current = { start: at, words: [] };
    }
    current.words.push(cue.text);
  }
  if (current) {
    paragraphs.push(
      `${formatTimestamp(current.start)} ${current.words.join(" ")}`,
    );
  }
  return paragraphs.join("\n\n");
}
