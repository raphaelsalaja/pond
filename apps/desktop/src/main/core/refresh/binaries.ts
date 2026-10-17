import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import * as electron from "electron";
import log from "electron-log/main.js";
import which from "which";

/** Utility processes get an `electron` module without `app`, and queue workers load this file. */
const app: typeof electron.app | undefined = electron.app;

/** Main resolves ffmpeg and hands the path to queue workers, which can't see `app.isPackaged`. */
export const FFMPEG_PATH_ENV = "POND_FFMPEG_PATH";

interface ResolvedBinaries {
  ytdlp: string | null;
  ffmpeg: string | null;
}

export const YTDLP_FILENAME =
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const FFMPEG_FILENAME = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

export function userBinDir(): string {
  if (!app) throw new Error("The managed binary folder is only known in main.");
  return join(app.getPath("userData"), "bin");
}

let cached: ResolvedBinaries | null = null;

export function binariesAvailable(): ResolvedBinaries {
  if (cached) return cached;
  cached = { ytdlp: resolveYtDlp(), ffmpeg: resolveFfmpeg() };
  log.info("[pond binaries] resolved", {
    ytdlp: cached.ytdlp,
    ffmpeg: cached.ffmpeg,
  });
  return cached;
}

export function invalidateBinariesCache(): void {
  cached = null;
}

function resolveYtDlp(): string | null {
  if (app) {
    const managed = join(userBinDir(), YTDLP_FILENAME);
    if (existsSync(managed)) return managed;
  }
  return lookupOnPath(YTDLP_FILENAME);
}

function resolveFfmpeg(): string | null {
  const handed = process.env[FFMPEG_PATH_ENV];
  if (handed && existsSync(handed)) return handed;
  const candidates: string[] = [];
  if (app?.isPackaged) {
    candidates.push(join(process.resourcesPath, "bin", FFMPEG_FILENAME));
  }
  candidates.push(
    resolve(__dirname, "../../../node_modules/ffmpeg-static", FFMPEG_FILENAME),
  );
  candidates.push(
    resolve(
      process.cwd(),
      "apps/desktop/node_modules/ffmpeg-static",
      FFMPEG_FILENAME,
    ),
  );
  candidates.push(
    resolve(process.cwd(), "node_modules/ffmpeg-static", FFMPEG_FILENAME),
  );

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return lookupOnPath(FFMPEG_FILENAME);
}

function lookupOnPath(name: string): string | null {
  return which.sync(name, { nothrow: true });
}
