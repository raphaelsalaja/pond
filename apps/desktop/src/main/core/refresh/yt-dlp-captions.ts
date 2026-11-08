import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Source } from "@pond/schema/db";
import type { RawYtdlp } from "@pond/schema/raw";
import log from "electron-log/main.js";
import { partitionForIngest } from "../sync/accounts";
import { binariesAvailable } from "./binaries";
import { writeNetscapeCookies } from "./cookies";
import { cookieAttempts } from "./yt-dlp-format";
import {
  pickSubtitleFiles,
  readSidecars,
  type SubtitleFile,
} from "./yt-dlp-output";
import { runWithTimeout } from "./yt-dlp-process";
import { ensureYtDlp } from "./yt-dlp-updater";

const CAPTIONS_TIMEOUT_MS = 60_000;
const DEFAULT_LANGS = "en.*,en-orig";

export interface DownloadedCaptions {
  subtitle: SubtitleFile;
  text: string;
  infoJson: RawYtdlp | null;
  posterPath: string | null;
  posterMimeType: string | null;
  cleanup: () => Promise<void>;
}

export async function downloadCaptions(args: {
  url: string;
  source: Source | null;
  accountId?: string | null;
  lang: string | null;
  signal?: AbortSignal;
}): Promise<DownloadedCaptions | null> {
  await ensureYtDlp();
  const { ytdlp, ffmpeg } = binariesAvailable();
  if (!ytdlp) return null;

  const partition = args.source
    ? await partitionForIngest(args.source, args.accountId)
    : undefined;
  const cookies = await writeNetscapeCookies(partition);
  let dir: string | null = null;
  const cleanup = async () => {
    await cookies.cleanup();
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    for (const withCookies of cookieAttempts(args.source, cookies.count)) {
      if (dir) await rm(dir, { recursive: true, force: true });
      dir = await mkdtemp(join(tmpdir(), "pond-captions-"));
      const argv = [
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "30",
        "--write-info-json",
        "--write-thumbnail",
        "--convert-thumbnails",
        "jpg",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        args.lang ?? DEFAULT_LANGS,
        "--sub-format",
        "vtt/srt/best",
        ...(ffmpeg
          ? ["--ffmpeg-location", ffmpeg, "--convert-subs", "vtt"]
          : []),
        ...(withCookies ? ["--cookies", cookies.path] : []),
        "-o",
        join(dir, "%(id)s.%(ext)s"),
        args.url,
      ];
      const { code, stderr } = await runWithTimeout(
        ytdlp,
        argv,
        CAPTIONS_TIMEOUT_MS,
        args.signal,
      );
      const subtitle = (await pickSubtitleFiles(dir))[0];
      if (subtitle) {
        const [text, sidecars] = await Promise.all([
          readFile(subtitle.path, "utf8"),
          readSidecars(dir),
        ]);
        return {
          subtitle,
          text,
          infoJson: sidecars.infoJson,
          posterPath: sidecars.poster?.path ?? null,
          posterMimeType: sidecars.poster?.mimeType ?? null,
          cleanup,
        };
      }
      log.info("[pond yt-dlp] no captions", args.url, code, stderr.slice(-300));
      if (args.signal?.aborted) break;
    }
  } catch (err) {
    log.warn("[pond yt-dlp] captions failed", args.url, err);
  }
  await cleanup();
  return null;
}
