import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { Source, VideoDownloadSettings } from "@pond/schema/db";
import log from "electron-log/main.js";
import { getVideoDownloadPrefs } from "../prefs";
import { binariesAvailable } from "./binaries";
import { writeNetscapeCookies } from "./cookies";

/**
 * Wraps the bundled yt-dlp CLI for the in-app refresh path. Given a
 * page URL (Twitter status, IG reel, Cosmos element, TikTok post,
 * YouTube watch, etc.) and a source the caller has classified, runs
 *
 *   yt-dlp -f "<format>" --cookies <jar> --no-playlist
 *          --max-filesize 200M -o "<tmpdir>/%(id)s.%(ext)s"
 *          --ffmpeg-location <ffmpeg> <url>
 *
 * and returns the resulting file path on success, `null` on any
 * failure (binary missing, network blip, extractor error, oversize,
 * timeout, etc.). The caller is expected to treat `null` as
 * "fall back to the poster-only path" — never as a hard error.
 *
 * Lifecycle responsibilities:
 *  - Caller provides nothing; we manage cookies jar + tmpdir + cleanup.
 *  - On success the returned `path` lives inside our tmpdir; the
 *    caller is responsible for moving / copying the file before
 *    `cleanup()` is invoked. Most callers will hand the path straight
 *    to `readLocalToTxFile` (in `lib/blob.ts`) which slurps the bytes
 *    into memory, so cleanup is safe immediately after.
 *
 * Concurrency: each call spins its own tmpdir, so multiple refreshes
 * can run in parallel without trampling each other.
 */

export interface DownloadVideoArgs {
  /** Page URL — same string passed to the harvester. */
  url: string;
  /** Source classification, used to pick a per-site format selector. */
  source: Source | null;
}

export interface DownloadedVideo {
  /** Absolute path to the on-disk file. Lives inside our tmpdir. */
  path: string;
  /** Best-effort MIME type, derived from the file extension. */
  mimeType: string;
  /** File size in bytes. */
  size: number;
  /**
   * yt-dlp `--write-info-json` sidecar, lifted from disk before
   * `cleanup()` runs. Caller can merge interesting fields into
   * `raw.<source>` (view_count / like_count / duration / chapters).
   * `null` when the sidecar was missing or unreadable.
   */
  infoJson: Record<string, unknown> | null;
  /** Caller MUST invoke this in a finally{} to remove the tmpdir. */
  cleanup: () => Promise<void>;
}

const HARD_TIMEOUT_MS = 90_000;

/**
 * Per-source format selector. yt-dlp's selector syntax is documented at
 * https://github.com/yt-dlp/yt-dlp#format-selection.
 *
 * Codec policy (the part that actually matters for playability):
 *   We constrain to H.264 video (`vcodec^=avc1`) + AAC audio
 *   (`acodec^=mp4a`) wherever possible. Electron's bundled Chromium
 *   ffmpeg plays H.264/AAC reliably across all renderer process tabs,
 *   but barfs with `ffmpeg_common.cc Unsupported pixel format: -1` on
 *   AV1, HEVC/H.265, and 10-bit VP9. Without these constraints yt-dlp
 *   happily picks AV1 / HEVC when YouTube and TikTok offer them, and
 *   the saved card silently fails to render. The chained fallbacks
 *   keep us alive when a site has no avc1 stream at all (rare on
 *   modern YouTube; occasionally on niche sources).
 *
 * Resolution cap is configurable via Settings → Video downloads. We
 * apply it inline to every selector branch (yt-dlp evaluates the cap
 * per-format, not as a post-filter). A `null` cap means "no limit"
 * and drops the `[height<=N]` predicate — useful for users who want
 * the original 4K source even though it'll burn disk.
 */
function formatSelector(
  source: Source | null,
  maxHeight: number | null,
): string {
  const h = maxHeight ? `[height<=${maxHeight}]` : "";
  switch (source) {
    case "tiktok":
      // TikTok: prefer the no-watermark in-feed stream (`format_note`
      // contains "play") over the watermarked download endpoint, then
      // fall through to any avc1 stream, then anything that fits.
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

/** Format `--max-filesize` argument, or `null` if no cap is configured. */
function maxFilesizeArg(prefs: VideoDownloadSettings): string | null {
  const mb = prefs.maxFileSizeMb;
  if (mb === null || mb === undefined || mb <= 0) return null;
  return `${mb}M`;
}

/**
 * Download the video for `url` to a temp path. Returns `null` and
 * logs (at most) a warning on any failure — never throws.
 */
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
      // Persist the per-video metadata sidecar so the post-download
      // merge can lift `view_count`, `like_count`, `duration`,
      // `chapters`, `uploader_id` etc. into `raw.<source>` without a
      // second extractor run.
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
      // Without ffmpeg we can't mux adaptive streams. Force yt-dlp to
      // pick a format that's single-stream so it doesn't fail at the
      // post-processing stage.
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

/**
 * Read the `--write-info-json` sidecar, then lift the curated subset of
 * fields downstream callers actually need. yt-dlp dumps a *huge*
 * payload (per-format ladders, raw extractor blob, …); we only return
 * the curated dict so the rest can be GC'd before the cleanup step.
 *
 * The keep-list mirrors `RawYtdlp` in `packages/schema/src/raw.ts` —
 * keep them aligned. New fields are additive: an extractor that
 * doesn't expose `repost_count` simply omits the key, and downstream
 * consumers feature-detect.
 *
 * Returns `null` when the sidecar is missing or unparseable — callers
 * already treat the value as best-effort.
 */
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

/**
 * Fields lifted from the `--write-info-json` sidecar onto
 * `raw.<source>.ytdlp`. Mirrors `RawYtdlp` — when adding a key here,
 * add it to the typed shape too. Order kept loosely grouped (identity
 * → metrics → time → format → music → playlist) for diff readability.
 */
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

  // format hints (helps diagnose codec / pixel-format playback bugs)
  "width",
  "height",
  "fps",
  "format_note",
  "vcodec",
  "acodec",
  "filesize",
  "filesize_approx",
  "tbr",

  // music videos (auto-populated by YouTube extractor on VEVO etc.)
  "track",
  "artist",
  "album",
  "genre",
  "release_year",

  "language",
  "tags",
  "categories",
  "chapters",

  // playlist context (when yt-dlp was given a playlist URL)
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
      // yt-dlp can be chatty; cap our buffered tail so a misbehaving
      // extractor doesn't OOM us with multi-MB stdout.
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

/**
 * yt-dlp's `-o "%(id)s.%(ext)s"` writes one file per video. After a
 * successful run we expect exactly one entry in the output dir; pick
 * the largest if there's somehow more (postprocessor leftovers should
 * have been cleaned up by `--no-part`, but be defensive).
 */
async function pickProducedFile(
  dir: string,
): Promise<{ path: string; size: number; mimeType: string } | null> {
  const entries = await readdir(dir);
  if (entries.length === 0) return null;

  const sized = await Promise.all(
    entries
      // Skip the info-json sidecar so it can never accidentally be
      // chosen as the produced file (largest-by-bytes is paranoid
      // enough to handle this regardless, but be explicit).
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
