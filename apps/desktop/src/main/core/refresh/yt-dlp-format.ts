import type { Source, VideoDownloadSettings } from "@pond/schema/db";
import type {
  DownloadRange,
  DownloadRequest,
} from "@shared/downloader-contracts";
import { YTDLP_PROGRESS_TEMPLATE } from "./yt-dlp-progress";

const YTDLP_CONCURRENT_FRAGMENTS = 8;
export const YTDLP_TRANSFER_FLAGS = [
  "--concurrent-fragments",
  String(YTDLP_CONCURRENT_FRAGMENTS),
] as const;

/** yt-dlp format filters; `~=` regex-matches the codec name variants a platform reports. */
function videoCodecFilter(codec: VideoDownloadSettings["videoCodec"]): string {
  switch (codec) {
    case "h264":
      return "[vcodec~='^(avc1|h264)']";
    case "hevc":
      return "[vcodec~='^(hev1|hvc1|h265)']";
    case "av1":
      return "[vcodec~='^(av01|av1)']";
    case "vp9":
      return "[vcodec~='^(vp09|vp9)']";
    default:
      return "";
  }
}

function audioCodecFilter(codec: VideoDownloadSettings["audioCodec"]): string {
  switch (codec) {
    case "aac":
      return "[acodec~='^(mp4a|aac)']";
    case "opus":
      return "[acodec^=opus]";
    default:
      return "";
  }
}

function formatSelector(
  source: Source | null,
  prefs: VideoDownloadSettings,
): string {
  const h = prefs.maxHeight ? `[height<=${prefs.maxHeight}]` : "";
  const f = prefs.maxFps ? `[fps<=${prefs.maxFps}]` : "";
  const limits = `${h}${f}`;
  const vf = videoCodecFilter(prefs.videoCodec);
  const af = audioCodecFilter(prefs.audioCodec);

  const chain: string[] = [];
  if (source === "tiktok") {
    chain.push(`bv*${vf}[format_note*=play]${limits}+ba${af}`);
  }
  chain.push(
    `bv*${vf}${limits}+ba${af}`,
    `bv*${limits}+ba`,
    `b${vf}${limits}`,
    `b${limits}`,
    "b",
  );
  return chain.join("/");
}

/**
 * Signed-in YouTube clients need a JS runtime the app does not ship, so try signed out first.
 * @see https://github.com/yt-dlp/yt-dlp/wiki/EJS
 */
export function cookieAttempts(
  source: Source | null,
  cookieCount: number,
): readonly boolean[] {
  if (cookieCount === 0) return [false];
  return source === "youtube" ? [false, true] : [true];
}

function maxFilesizeArg(prefs: VideoDownloadSettings): string | null {
  const mb = prefs.maxFileSizeMb;
  if (mb === null || mb === undefined || mb <= 0) return null;
  return `${mb}M`;
}

function sectionArg(range: DownloadRange): string {
  return `*${range.start.toFixed(2)}-${range.end.toFixed(2)}`;
}

/** GIF is encoded from an MP4 after the download, so yt-dlp fetches MP4 for it. */
function requestedContainer(
  request: DownloadRequest | undefined,
): "mp4" | "webm" | null {
  if (!request?.container) return null;
  return request.container === "webm" ? "webm" : "mp4";
}

interface DownloadArgvInput {
  source: Source | null;
  prefs: VideoDownloadSettings;
  ffmpeg: string | null;
  allowPlaylist: boolean;
  request?: DownloadRequest | undefined;
}

/** Everything but cookies, the manifest and the output template, which change per attempt. */
export function downloadArgv(input: DownloadArgvInput): string[] {
  const { source, request, ffmpeg } = input;
  const audio = request?.mode === "audio";
  const prefs: VideoDownloadSettings = request
    ? { ...input.prefs, maxHeight: request.maxHeight, maxFileSizeMb: null }
    : input.prefs;
  const range = ffmpeg ? (request?.range ?? null) : null;

  const argv = [
    input.allowPlaylist ? "--yes-playlist" : "--no-playlist",
    "--no-warnings",
    "--newline",
    "--progress",
    "--progress-delta",
    "0.5",
    "--progress-template",
    `download:${YTDLP_PROGRESS_TEMPLATE}`,
    "--no-part",
    "--restrict-filenames",
    "--write-info-json",
    "--socket-timeout",
    "30",
    "--retries",
    "3",
    ...YTDLP_TRANSFER_FLAGS,
    "-f",
    audio
      ? ffmpeg
        ? "ba/b"
        : "ba[ext=m4a]/ba/b"
      : formatSelector(source, prefs),
  ];
  if (request || source === "youtube" || prefs.embedThumbnail) {
    argv.push("--write-thumbnail", "--convert-thumbnails", "jpg");
  }
  const filesize = maxFilesizeArg(prefs);
  if (filesize) argv.unshift("--max-filesize", filesize);

  if (ffmpeg) {
    argv.push("--ffmpeg-location", ffmpeg);
    if (audio && request) {
      argv.push(
        "-x",
        "--audio-format",
        request.audioFormat,
        "--audio-quality",
        "0",
      );
      if (prefs.embedMetadata) argv.push("--embed-metadata");
      if (prefs.embedThumbnail) argv.push("--embed-thumbnail");
    } else {
      const container = requestedContainer(request);
      if (container) {
        argv.push(
          "-S",
          container === "webm" ? "ext:webm:webm" : "ext:mp4:m4a",
          "--merge-output-format",
          container,
        );
      } else if (prefs.container !== "auto") {
        argv.push("--merge-output-format", prefs.container);
      }
      if (prefs.embedMetadata) argv.push("--embed-metadata");
      if (prefs.embedThumbnail) argv.push("--embed-thumbnail");
      if (prefs.embedChapters && !range) argv.push("--embed-chapters");
      if (prefs.sponsorblockRemove && !range) {
        argv.push("--sponsorblock-remove", "all");
      }
      if (prefs.subtitles === "embed") {
        argv.push("--embed-subs", "--sub-langs", prefs.subtitleLang);
      }
    }
    if (range) {
      argv.push("--download-sections", sectionArg(range));
      if (!audio) argv.push("--force-keyframes-at-cuts");
    }
  } else if (!audio) {
    argv.push("-f", "b[ext=mp4]/b");
  }

  if (!audio && prefs.subtitles === "download") {
    argv.push(
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      prefs.subtitleLang,
    );
    if (ffmpeg) argv.push("--convert-subs", "srt");
  }
  return argv;
}
