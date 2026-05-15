import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { Source, VideoDownloadSettings } from "@pond/schema/db";
import log from "electron-log/main.js";
import { getVideoDownloadPrefs } from "../prefs";
import { binariesAvailable } from "./binaries";
import { writeNetscapeCookies } from "./cookies";

export interface DownloadVideoArgs {
  url: string;
  source: Source | null;
}

export interface DownloadedVideo {
  path: string;
  mimeType: string;
  size: number;
  infoJson: Record<string, unknown> | null;
  cleanup: () => Promise<void>;
}

const HARD_TIMEOUT_MS = 90_000;

function formatSelector(
  source: Source | null,
  maxHeight: number | null,
): string {
  const h = maxHeight ? `[height<=${maxHeight}]` : "";
  switch (source) {
    case "tiktok":
      return [
        `bv*[ext=mp4][vcodec^=avc1][format_note*=play]${h}+ba[acodec^=mp4a]`,
        `bv*[ext=mp4][vcodec^=avc1]${h}+ba[acodec^=mp4a]`,
        `b[ext=mp4][vcodec^=avc1]${h}`,
        `b[ext=mp4]${h}`,
        `b${h}`,
      ].join("/");
    case "youtube":
      return [
        `bv*[ext=mp4][vcodec^=avc1]${h}+ba[ext=m4a][acodec^=mp4a]`,
        `b[ext=mp4][vcodec^=avc1]${h}`,
        `bv*[vcodec^=avc1]${h}+ba[acodec^=mp4a]`,
        `b[ext=mp4]${h}`,
        `b${h}`,
      ].join("/");
    default:
      return [
        `bv*[ext=mp4][vcodec^=avc1]${h}+ba[ext=m4a][acodec^=mp4a]`,
        `b[ext=mp4][vcodec^=avc1]${h}`,
        `bv*[vcodec^=avc1]${h}+ba[acodec^=mp4a]`,
        `b[ext=mp4]${h}`,
        `b${h}`,
      ].join("/");
  }
}

function maxFilesizeArg(prefs: VideoDownloadSettings): string | null {
  const mb = prefs.maxFileSizeMb;
  if (mb === null || mb === undefined || mb <= 0) return null;
  return `${mb}M`;
}

export async function downloadVideo(
  args: DownloadVideoArgs,
): Promise<DownloadedVideo | null> {
  const { ytdlp, ffmpeg } = binariesAvailable();
  if (!ytdlp) {
    log.debug("[pond yt-dlp] binary unavailable, skipping", args.url);
    return null;
  }

  let cookies: Awaited<ReturnType<typeof writeNetscapeCookies>> | null = null;
  let outputDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (cookies) await cookies.cleanup();
    if (outputDir) {
      try {
        await rm(outputDir, { recursive: true, force: true });
      } catch (err) {
        log.warn("[pond yt-dlp] tmpdir cleanup failed", outputDir, err);
      }
    }
  };

  try {
    const prefs = await getVideoDownloadPrefs();
    cookies = await writeNetscapeCookies();
    outputDir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));

    const argv = [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--no-part",
      "--restrict-filenames",
      "--write-info-json",
      "--socket-timeout",
      "30",
      "--retries",
      "3",
      "-f",
      formatSelector(args.source, prefs.maxHeight),
      "--cookies",
      cookies.path,
      "-o",
      join(outputDir, "%(id)s.%(ext)s"),
    ];
    const filesize = maxFilesizeArg(prefs);
    if (filesize) argv.unshift("--max-filesize", filesize);
    if (ffmpeg) {
      argv.push("--ffmpeg-location", ffmpeg);
    } else {
      argv.push("-f", "b[ext=mp4]/b");
    }
    argv.push(args.url);

    log.info(
      "[pond yt-dlp] downloading",
      args.url,
      `(cookies=${cookies.count})`,
    );
    const { code, stderr } = await runWithTimeout(ytdlp, argv, HARD_TIMEOUT_MS);
    if (code !== 0) {
      log.warn(
        "[pond yt-dlp] non-zero exit",
        code,
        args.url,
        stderr.slice(-400),
      );
      await cleanup();
      return null;
    }

    const produced = await pickProducedFile(outputDir);
    if (!produced) {
      log.warn("[pond yt-dlp] no output file produced", args.url);
      await cleanup();
      return null;
    }

    const infoJson = await readInfoJson(outputDir, produced.path);
    log.info("[pond yt-dlp] wrote", produced.path, `(${produced.size} bytes)`);
    return {
      path: produced.path,
      mimeType: produced.mimeType,
      size: produced.size,
      infoJson,
      cleanup,
    };
  } catch (err) {
    log.warn("[pond yt-dlp] unexpected error", args.url, err);
    await cleanup();
    return null;
  }
}

async function readInfoJson(
  dir: string,
  videoPath: string,
): Promise<Record<string, unknown> | null> {
  const stem = basename(videoPath, extname(videoPath));
  const sidecar = join(dir, `${stem}.info.json`);
  try {
    const raw = await readFile(sidecar, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of YTDLP_KEEP_KEYS) {
      const v = parsed[k];
      if (v !== undefined && v !== null) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

const YTDLP_KEEP_KEYS = [
  "id",
  "title",
  "description",
  "thumbnail",
  "webpage_url",
  "original_url",
  "extractor",
  "extractor_key",

  "view_count",
  "like_count",
  "dislike_count",
  "comment_count",
  "repost_count",
  "concurrent_view_count",
  "average_rating",

  "duration",
  "uploader",
  "uploader_id",
  "uploader_url",
  "channel",
  "channel_id",
  "channel_url",

  "upload_date",
  "release_date",
  "release_timestamp",
  "timestamp",
  "live_status",
  "was_live",
  "availability",
  "age_limit",

  "width",
  "height",
  "fps",
  "format_note",
  "vcodec",
  "acodec",
  "filesize",
  "filesize_approx",
  "tbr",

  "track",
  "artist",
  "album",
  "genre",
  "release_year",

  "language",
  "tags",
  "categories",
  "chapters",

  "playlist",
  "playlist_id",
  "playlist_title",
  "playlist_index",
  "n_entries",
] as const;

interface ProcOutcome {
  code: number;
  stderr: string;
}

function runWithTimeout(
  bin: string,
  argv: string[],
  timeoutMs: number,
): Promise<ProcOutcome> {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore — process may have already exited */
      }
      resolve({ code: 124, stderr: `${stderr}\n[pond yt-dlp] timeout` });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 64_000) stdout = stdout.slice(-64_000);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stderr: String(err) });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

async function pickProducedFile(
  dir: string,
): Promise<{ path: string; size: number; mimeType: string } | null> {
  const entries = await readdir(dir);
  if (entries.length === 0) return null;

  const sized = await Promise.all(
    entries
      .filter((name) => !/\.info\.json$/i.test(name))
      .map(async (name) => {
        const full = join(dir, name);
        try {
          const s = await stat(full);
          return { path: full, size: s.size };
        } catch {
          return null;
        }
      }),
  );
  const valid = sized.filter(
    (e): e is { path: string; size: number } => e !== null && e.size > 0,
  );
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.size - a.size);
  const winner = valid[0];
  if (!winner) return null;
  return { ...winner, mimeType: mimeFor(winner.path) };
}

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "video/mp4";
  }
}
