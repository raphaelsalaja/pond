import type { Source } from "@pond/schema/db";
import type {
  DownloadCaption,
  DownloadChapter,
  DownloadHeatPoint,
  DownloadPlaylistEntry,
  DownloadProbe,
  DownloadStoryboard,
  DownloadVideoOption,
} from "@shared/downloader-contracts";
import { z } from "zod";

const Num = z.number().finite().nullable().optional().catch(null);
const Str = z.string().nullable().optional().catch(null);

const FormatSchema = z.looseObject({
  format_id: Str,
  format_note: Str,
  ext: Str,
  vcodec: Str,
  acodec: Str,
  width: Num,
  height: Num,
  fps: Num,
  tbr: Num,
  abr: Num,
  filesize: Num,
  filesize_approx: Num,
  columns: Num,
  rows: Num,
  url: Str,
  protocol: Str,
  http_headers: z
    .record(z.string(), z.string().catch(""))
    .nullable()
    .optional()
    .catch(null),
  fragments: z
    .array(z.looseObject({ url: Str, duration: Num }))
    .nullable()
    .optional()
    .catch(null),
});
type Format = z.infer<typeof FormatSchema>;

const ThumbnailSchema = z.looseObject({
  url: Str,
  width: Num,
  preference: Num,
});

const CaptionTrackSchema = z.looseObject({ ext: Str, name: Str });
const CaptionMapSchema = z
  .record(z.string(), z.array(CaptionTrackSchema).catch([]))
  .nullable()
  .optional()
  .catch(null);

const EntrySchema = z.looseObject({
  id: Str,
  url: Str,
  webpage_url: Str,
  title: Str,
  duration: Num,
  thumbnail: Str,
  thumbnails: z.array(ThumbnailSchema).nullable().optional().catch(null),
});

export const YtdlpProbeInfoSchema = z.looseObject({
  _type: Str,
  id: Str,
  title: Str,
  uploader: Str,
  channel: Str,
  artist: Str,
  duration: Num,
  thumbnail: Str,
  thumbnails: z.array(ThumbnailSchema).nullable().optional().catch(null),
  webpage_url: Str,
  original_url: Str,
  webpage_url_domain: Str,
  is_live: z.boolean().nullable().optional().catch(null),
  live_status: Str,
  heatmap: z
    .array(z.looseObject({ start_time: Num, end_time: Num, value: Num }))
    .nullable()
    .optional()
    .catch(null),
  chapters: z
    .array(z.looseObject({ start_time: Num, end_time: Num, title: Str }))
    .nullable()
    .optional()
    .catch(null),
  formats: z.array(FormatSchema.catch({})).nullable().optional().catch(null),
  subtitles: CaptionMapSchema,
  automatic_captions: CaptionMapSchema,
  entries: z.array(EntrySchema.catch({})).nullable().optional().catch(null),
});
export type YtdlpProbeInfo = z.infer<typeof YtdlpProbeInfoSchema>;

const MAX_ENTRIES = 500;
const MAX_CAPTIONS = 40;

export function toDownloadProbe(
  info: YtdlpProbeInfo,
  requestedUrl: string,
  source: Source | null,
): DownloadProbe {
  const url = info.webpage_url || info.original_url || requestedUrl;
  const site = siteOf(info.webpage_url_domain, url);
  const author = info.uploader || info.channel || info.artist || null;
  const title = info.title?.trim() || "Untitled";

  if (info._type === "playlist" || (info.entries && !info.formats)) {
    return {
      kind: "playlist",
      url,
      source,
      site,
      title,
      author,
      entries: playlistEntries(info.entries ?? []),
    };
  }

  const duration = positive(info.duration);
  const formats = info.formats ?? [];
  return {
    kind: "single",
    url,
    source,
    site,
    title,
    author,
    duration,
    thumbnail: info.thumbnail || bestThumbnail(info.thumbnails),
    isLive: info.is_live === true || info.live_status === "is_live",
    heatmap: heatmapOf(info.heatmap),
    chapters: chaptersOf(info.chapters, duration),
    storyboard: storyboardOf(formats),
    videoOptions: videoOptionsOf(formats, duration),
    audioSize: bestAudio(formats, duration)?.size ?? null,
    captions: captionsOf(info.subtitles, info.automatic_captions),
    preview: previewOf(formats),
    existingSaveId: null,
  };
}

function siteOf(domain: string | null | undefined, url: string): string {
  if (domain) return domain.replace(/^www\./, "");
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function positive(value: number | null | undefined): number | null {
  return value != null && value > 0 ? value : null;
}

function bestThumbnail(
  thumbnails: YtdlpProbeInfo["thumbnails"],
): string | null {
  let best: { url: string; score: number } | null = null;
  for (const thumb of thumbnails ?? []) {
    if (!thumb.url?.startsWith("http")) continue;
    const score = (thumb.preference ?? 0) * 10_000 + (thumb.width ?? 0);
    if (!best || score > best.score) best = { url: thumb.url, score };
  }
  return best?.url ?? null;
}

function playlistEntries(
  entries: NonNullable<YtdlpProbeInfo["entries"]>,
): DownloadPlaylistEntry[] {
  const out: DownloadPlaylistEntry[] = [];
  for (const entry of entries) {
    const url = entry.webpage_url || entry.url;
    if (!url?.startsWith("http")) continue;
    out.push({
      url,
      title: entry.title?.trim() || "Untitled",
      duration: positive(entry.duration),
      thumbnail: entry.thumbnail || bestThumbnail(entry.thumbnails),
    });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

function heatmapOf(heatmap: YtdlpProbeInfo["heatmap"]): DownloadHeatPoint[] {
  const points: DownloadHeatPoint[] = [];
  for (const point of heatmap ?? []) {
    const start = point.start_time;
    const end = point.end_time;
    const value = point.value;
    if (start == null || end == null || value == null || end <= start) {
      continue;
    }
    points.push({ start, end, value: Math.max(0, value) });
  }
  const peak = Math.max(0, ...points.map((point) => point.value));
  if (peak <= 0) return [];
  return points.map((point) => ({ ...point, value: point.value / peak }));
}

function chaptersOf(
  chapters: YtdlpProbeInfo["chapters"],
  duration: number | null,
): DownloadChapter[] {
  const out: DownloadChapter[] = [];
  for (const chapter of chapters ?? []) {
    const start = chapter.start_time ?? null;
    const end = chapter.end_time ?? duration;
    if (start == null || end == null || end <= start) continue;
    out.push({ start, end, title: chapter.title?.trim() || "Chapter" });
  }
  return out;
}

function isStoryboard(format: Format): boolean {
  return format.format_note === "storyboard" || format.ext === "mhtml";
}

function storyboardOf(formats: Format[]): DownloadStoryboard | null {
  let best: DownloadStoryboard | null = null;
  for (const format of formats) {
    if (!isStoryboard(format)) continue;
    const columns = format.columns ?? 0;
    const rows = format.rows ?? 0;
    const tileWidth = format.width ?? 0;
    const tileHeight = format.height ?? 0;
    if (columns < 1 || rows < 1 || tileWidth < 1 || tileHeight < 1) continue;
    const sheets: DownloadStoryboard["sheets"] = [];
    let start = 0;
    for (const fragment of format.fragments ?? []) {
      const duration = fragment.duration ?? 0;
      if (!fragment.url?.startsWith("http") || duration <= 0) continue;
      sheets.push({ url: fragment.url, start, duration });
      start += duration;
    }
    const first = sheets[0];
    if (!first) continue;
    const interval =
      format.fps && format.fps > 0
        ? 1 / format.fps
        : first.duration / (columns * rows);
    if (best && best.tileWidth >= tileWidth) continue;
    best = { tileWidth, tileHeight, columns, rows, interval, sheets };
  }
  return best;
}

function sizeOf(format: Format, duration: number | null): number | null {
  const reported = format.filesize ?? format.filesize_approx;
  if (reported && reported > 0) return reported;
  if (format.tbr && duration)
    return Math.round((format.tbr * 1000 * duration) / 8);
  return null;
}

function hasCodec(codec: string | null | undefined): boolean {
  return !!codec && codec !== "none";
}

/** yt-dlp writes "none" for a missing stream and leaves the codec unset when it doesn't know it. */
function hasVideo(format: Format): boolean {
  return (
    format.vcodec !== "none" &&
    (hasCodec(format.vcodec) || (format.height ?? 0) > 0)
  );
}

/** yt-dlp lists formats worst to best, so the last match is the one `ba` would pick. */
function bestAudio(
  formats: Format[],
  duration: number | null,
): { size: number | null } | null {
  let best: { size: number | null } | null = null;
  for (const format of formats) {
    if (isStoryboard(format)) continue;
    if (hasCodec(format.vcodec) || !hasCodec(format.acodec)) continue;
    best = { size: sizeOf(format, duration) };
  }
  return best;
}

/** The last format at each height, which is what `bv*[height<=N]` downloads. */
function videoOptionsOf(
  formats: Format[],
  duration: number | null,
): DownloadVideoOption[] {
  const audio = bestAudio(formats, duration);
  const byHeight = new Map<number, DownloadVideoOption>();
  for (const format of formats) {
    if (isStoryboard(format)) continue;
    const height = format.height ?? 0;
    if (height < 144 || !hasVideo(format)) continue;
    const own = sizeOf(format, duration);
    const muxed = format.acodec !== "none";
    const size = own == null ? null : muxed ? own : own + (audio?.size ?? 0);
    byHeight.set(height, { height, fps: format.fps ?? null, size });
  }
  return [...byHeight.values()].sort((a, b) => b.height - a.height);
}

const PLAYABLE = new Set(["mp4", "webm", "m4a", "mp3"]);
const PREVIEW_MAX_HEIGHT = 720;
/** A media element sends no custom headers, so streams gated on these can't play. */
const GATED_HEADERS = /^(cookie|authorization|referer|origin)$/i;

function playableUrl(format: Format): string | null {
  const url = format.url;
  if (!url?.startsWith("http")) return null;
  if (format.protocol && !/^https?$/.test(format.protocol)) return null;
  if (
    Object.keys(format.http_headers ?? {}).some((key) =>
      GATED_HEADERS.test(key),
    )
  )
    return null;
  let ext = format.ext;
  if (!ext) {
    try {
      ext = new URL(url).pathname.split(".").at(-1) ?? null;
    } catch {
      return null;
    }
  }
  return ext && PLAYABLE.has(ext.toLowerCase()) ? url : null;
}

/** A direct stream the editor can play: sound and picture together, sharpest up to 720p. */
function previewOf(formats: Format[]): string | null {
  let best: { url: string; height: number } | null = null;
  let audioOnly: string | null = null;
  for (const format of formats) {
    if (isStoryboard(format) || format.acodec === "none") continue;
    const url = playableUrl(format);
    if (!url) continue;
    if (!hasVideo(format)) {
      audioOnly ??= url;
      continue;
    }
    const height = format.height ?? 0;
    const fits = height <= PREVIEW_MAX_HEIGHT;
    const better =
      !best ||
      (fits
        ? best.height > PREVIEW_MAX_HEIGHT || height >= best.height
        : best.height > PREVIEW_MAX_HEIGHT && height < best.height);
    if (better) best = { url, height };
  }
  return best?.url ?? (formats.some(hasVideo) ? null : audioOnly);
}

export interface FrameSource {
  url: string;
  headers: Record<string, string>;
  duration: number;
}

/** The smallest direct video stream, so seeking a frame reads as few bytes as possible. */
export function frameSourceOf(info: YtdlpProbeInfo): FrameSource | null {
  const duration = positive(info.duration);
  if (!duration) return null;
  let best: { format: Format; height: number } | null = null;
  for (const format of info.formats ?? []) {
    if (isStoryboard(format) || !hasVideo(format)) continue;
    if (!format.url?.startsWith("http")) continue;
    if (format.protocol && !/^(https?|m3u8|m3u8_native)$/.test(format.protocol))
      continue;
    const height = format.height ?? 0;
    if (height < 144) continue;
    if (best && best.height <= height) continue;
    best = { format, height };
  }
  if (!best?.format.url) return null;
  return {
    url: best.format.url,
    headers: best.format.http_headers ?? {},
    duration,
  };
}

function captionsOf(
  manual: YtdlpProbeInfo["subtitles"],
  automatic: YtdlpProbeInfo["automatic_captions"],
): DownloadCaption[] {
  const out: DownloadCaption[] = [];
  const seen = new Set<string>();
  for (const [lang, tracks] of Object.entries(manual ?? {})) {
    if (lang === "live_chat" || tracks.length === 0) continue;
    seen.add(lang);
    out.push({ lang, name: tracks[0]?.name || lang, automatic: false });
  }
  for (const [lang, tracks] of Object.entries(automatic ?? {})) {
    if (!lang.endsWith("-orig") || tracks.length === 0) continue;
    const base = lang.slice(0, -"-orig".length);
    if (seen.has(base)) continue;
    seen.add(base);
    const name = (tracks[0]?.name || base).replace(/\s*\(Original\)$/i, "");
    out.push({ lang, name, automatic: true });
  }
  return out.slice(0, MAX_CAPTIONS);
}
