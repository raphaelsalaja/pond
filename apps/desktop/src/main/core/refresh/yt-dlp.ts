import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Source } from "@pond/schema/db";
import type { RawYtdlp } from "@pond/schema/raw";
import type { ReportDownloadActivity } from "@shared/download-activity";
import type { DownloadRequest } from "@shared/downloader-contracts";
import log from "electron-log/main.js";
import { TASK_WATCHDOG_MS } from "../pipeline/task-timeouts";
import { getVideoDownloadPrefs } from "../prefs";
import { partitionForIngest } from "../sync/accounts";
import { binariesAvailable } from "./binaries";
import { writeNetscapeCookies } from "./cookies";
import { cookieAttempts, downloadArgv } from "./yt-dlp-format";
import {
  keepsPartialDownload,
  pickProducedFiles,
  pickProducedPoster,
  pickSubtitleFiles,
  readCompletedFiles,
  type SubtitleFile,
} from "./yt-dlp-output";
import { runWithTimeout } from "./yt-dlp-process";
import { createYtdlpProgressReporter } from "./yt-dlp-progress";
import { ensureYtDlp } from "./yt-dlp-updater";

interface DownloadVideoArgs {
  url: string;
  source: Source | null;
  accountId?: string | null;
  signal?: AbortSignal;
  reportActivity?: ReportDownloadActivity;
  /** Quoted/carousel tweets are a yt-dlp playlist; YouTube watch URLs must never expand. */
  allowPlaylist?: boolean;
  expectedCount?: number;
  /** A download someone set up in the Download dialog; overrides the per-source preferences. */
  request?: DownloadRequest;
}

export interface DownloadedVideoItem {
  path: string;
  mimeType: string;
  size: number;
  infoJson: RawYtdlp | null;
  posterPath: string | null;
  posterMimeType: string | null;
  subtitles: SubtitleFile[];
}

interface DownloadedVideos {
  items: DownloadedVideoItem[];
  cleanup: () => Promise<void>;
}

const HARD_TIMEOUT_MS = 90_000;
const MAX_PLAYLIST_TIMEOUT_FACTOR = 4;
/** Cutting at exact frames re-encodes the section silently, so progress lines stall for longer. */
const SECTION_TIMEOUT_FACTOR = 4;
const VIDEO_WATCHDOG_MS = TASK_WATCHDOG_MS.fetch_video_ytdlp;

export async function downloadVideo(
  args: DownloadVideoArgs,
): Promise<DownloadedVideos | null> {
  await ensureYtDlp();
  const { ytdlp, ffmpeg } = binariesAvailable();
  if (!ytdlp) {
    log.debug("[pond yt-dlp] binary unavailable, skipping", args.url);
    return null;
  }
  if (args.signal?.aborted) {
    log.info("[pond yt-dlp] aborted before start", args.url);
    return null;
  }

  let cookies: Awaited<ReturnType<typeof writeNetscapeCookies>> | null = null;
  let attemptDir: string | null = null;
  let cleanupCalled = false;
  const cleanup = async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;
    if (cookies) await cookies.cleanup();
    if (attemptDir) {
      try {
        await rm(attemptDir, { recursive: true, force: true });
      } catch (err) {
        log.warn("[pond yt-dlp] tmpdir cleanup failed", attemptDir, err);
      }
    }
  };

  try {
    const prefs = await getVideoDownloadPrefs(args.source);
    const partition = args.source
      ? await partitionForIngest(args.source, args.accountId)
      : undefined;
    cookies = await writeNetscapeCookies(partition);

    const argv = downloadArgv({
      source: args.source,
      prefs,
      ffmpeg,
      allowPlaylist: Boolean(args.allowPlaylist),
      request: args.request,
    });

    const timeoutMs =
      HARD_TIMEOUT_MS *
      (args.request?.range ? SECTION_TIMEOUT_FACTOR : 1) *
      Math.min(
        MAX_PLAYLIST_TIMEOUT_FACTOR,
        Math.max(1, args.expectedCount ?? 1),
      );
    let outcome: {
      mediaDir: string;
      completed: ReadonlySet<string> | undefined;
    } | null = null;
    for (const withCookies of cookieAttempts(args.source, cookies.count)) {
      if (attemptDir) await rm(attemptDir, { recursive: true, force: true });
      attemptDir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
      const mediaDir = join(attemptDir, "media");
      const manifest = join(attemptDir, "completed.txt");
      const attemptArgv = [
        ...argv,
        ...(withCookies ? ["--cookies", cookies.path] : []),
        "--print-to-file",
        "after_move:%(filepath)s",
        manifest,
        "-o",
        join(mediaDir, "%(id)s.%(ext)s"),
        args.url,
      ];
      log.info(
        "[pond yt-dlp] downloading",
        args.url,
        `(cookies=${withCookies ? cookies.count : 0})`,
      );
      args.reportActivity?.({ phase: "harvesting" });
      const { code, stderr } = await runWithTimeout(
        ytdlp,
        attemptArgv,
        timeoutMs,
        args.signal,
        args.reportActivity
          ? createYtdlpProgressReporter(args.reportActivity)
          : undefined,
        VIDEO_WATCHDOG_MS,
      );
      if (code === 0) {
        outcome = { mediaDir, completed: undefined };
        break;
      }
      log.warn(
        "[pond yt-dlp] non-zero exit",
        code,
        args.url,
        stderr.slice(-400),
      );
      const completed = await readCompletedFiles(manifest);
      if (keepsPartialDownload(code, completed.size, args.expectedCount ?? 1)) {
        log.info(
          "[pond yt-dlp] keeping finished files despite a failed entry",
          args.url,
          `(${completed.size})`,
        );
        outcome = { mediaDir, completed };
        break;
      }
      if (args.signal?.aborted) break;
    }
    if (!outcome) {
      await cleanup();
      return null;
    }
    const { mediaDir } = outcome;

    args.reportActivity?.({ phase: "processing" });
    const produced = await pickProducedFiles(mediaDir, outcome.completed);
    if (produced.length === 0) {
      log.warn("[pond yt-dlp] no output file produced", args.url);
      await cleanup();
      return null;
    }

    const wantPoster =
      Boolean(args.request) ||
      args.source === "youtube" ||
      Boolean(prefs.embedThumbnail);
    const subtitles =
      prefs.subtitles === "download" && args.request?.mode !== "audio"
        ? await pickSubtitleFiles(mediaDir)
        : [];
    const items: DownloadedVideoItem[] = [];
    for (let i = 0; i < produced.length; i++) {
      const file = produced[i];
      if (!file) continue;
      const poster = wantPoster
        ? await pickProducedPoster(mediaDir, file.path)
        : null;
      items.push({
        path: file.path,
        mimeType: file.mimeType,
        size: file.size,
        infoJson: file.infoJson,
        posterPath: poster?.path ?? null,
        posterMimeType: poster?.mimeType ?? null,
        subtitles: i === 0 ? subtitles : [],
      });
      log.info("[pond yt-dlp] wrote", file.path, `(${file.size} bytes)`);
    }
    if (items.length === 0) {
      await cleanup();
      return null;
    }
    return { items, cleanup };
  } catch (err) {
    log.warn("[pond yt-dlp] unexpected error", args.url, err);
    await cleanup();
    return null;
  }
}
