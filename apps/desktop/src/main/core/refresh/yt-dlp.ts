import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import type { Source } from "@pond/schema/db";
import log from "electron-log/main.js";
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
  /** Caller MUST invoke this in a finally{} to remove the tmpdir. */
  cleanup: () => Promise<void>;
}

const HARD_TIMEOUT_MS = 90_000;
const MAX_FILESIZE = "200M";

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
 * Resolution cap: 1080p everywhere. 4K streams pull multi-GB
 * intermediates through ffmpeg's mux stage and routinely blow past
 * `--max-filesize 200M` *after* we've already wasted time downloading.
 */
function formatSelector(source: Source | null): string {
  switch (source) {
    case "tiktok":
      // TikTok: prefer the no-watermark in-feed stream (`format_note`
      // contains "play") over the watermarked download endpoint, then
      // fall through to any avc1 stream, then anything that fits.
      return [
        "bv*[ext=mp4][vcodec^=avc1][format_note*=play]+ba[acodec^=mp4a]",
        "bv*[ext=mp4][vcodec^=avc1]+ba[acodec^=mp4a]",
        "b[ext=mp4][vcodec^=avc1]",
        "b[ext=mp4]",
        "b",
      ].join("/");
    case "youtube":
      return [
        "bv*[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a][acodec^=mp4a]",
        "b[ext=mp4][vcodec^=avc1][height<=1080]",
        "bv*[vcodec^=avc1][height<=1080]+ba[acodec^=mp4a]",
        "b[ext=mp4][height<=1080]",
        "b[height<=1080]",
      ].join("/");
    default:
      return [
        "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a][acodec^=mp4a]",
        "b[ext=mp4][vcodec^=avc1]",
        "bv*[vcodec^=avc1]+ba[acodec^=mp4a]",
        "b[ext=mp4]",
        "b",
      ].join("/");
  }
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
    cookies = await writeNetscapeCookies();
    outputDir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));

    const argv = [
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--no-part",
      "--restrict-filenames",
      "--max-filesize",
      MAX_FILESIZE,
      "--socket-timeout",
      "30",
      "--retries",
      "3",
      "-f",
      formatSelector(args.source),
      "--cookies",
      cookies.path,
      "-o",
      join(outputDir, "%(id)s.%(ext)s"),
    ];
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

    log.info("[pond yt-dlp] wrote", produced.path, `(${produced.size} bytes)`);
    return {
      path: produced.path,
      mimeType: produced.mimeType,
      size: produced.size,
      cleanup,
    };
  } catch (err) {
    log.warn("[pond yt-dlp] unexpected error", args.url, err);
    await cleanup();
    return null;
  }
}

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
    entries.map(async (name) => {
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
