import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
// oxlint-disable-next-line import/no-namespace -- utility processes load an `electron` module without `app`, so a named import would fail to link there
import * as electron from "electron";
import log from "electron-log/main.js";
import which from "which";

/** Utility processes get an `electron` module without `app`, and queue workers load this file. */
const app: typeof electron.app | undefined = electron.app;

/** Main resolves ffmpeg and hands the path to queue workers, which can't see `app.isPackaged`. */
export const FFMPEG_PATH_ENV = "POND_FFMPEG_PATH";
export const FFPROBE_PATH_ENV = "POND_FFPROBE_PATH";

interface ResolvedBinaries {
  ytdlp: string | null;
  ffmpeg: string | null;
  ffprobe: string | null;
}

export const YTDLP_FILENAME =
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const FFMPEG_FILENAME = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const FFPROBE_FILENAME =
  process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

export function userBinDir(): string {
  if (!app) throw new Error("The managed binary folder is only known in main.");
  return join(app.getPath("userData"), "bin");
}

let cached: ResolvedBinaries | null = null;

export function binariesAvailable(): ResolvedBinaries {
  if (cached) return cached;
  cached = colocateAvBinaries({
    ytdlp: resolveYtDlp(),
    ffmpeg: resolveFfmpeg(),
    ffprobe: resolveFfprobe(),
  });
  log.info("[pond binaries] resolved", {
    ytdlp: cached.ytdlp,
    ffmpeg: cached.ffmpeg,
    ffprobe: cached.ffprobe,
  });
  return cached;
}

/** yt-dlp only probes for ffprobe beside `--ffmpeg-location`, never on PATH, so dev binaries from separate packages get linked into one folder. */
function colocateAvBinaries(binaries: ResolvedBinaries): ResolvedBinaries {
  const { ffmpeg, ffprobe } = binaries;
  if (!app || !ffmpeg || !ffprobe) return binaries;
  if (dirname(ffmpeg) === dirname(ffprobe)) return binaries;
  try {
    return stageAvBinaries(binaries, ffmpeg, ffprobe);
  } catch (error) {
    log.warn("[pond binaries] av staging failed", error);
    return binaries;
  }
}

function stageAvBinaries(
  binaries: ResolvedBinaries,
  ffmpeg: string,
  ffprobe: string,
): ResolvedBinaries {
  const dir = join(userBinDir(), "av");
  mkdirSync(dir, { recursive: true });
  const staged = { ...binaries };
  for (const [tool, filename, target] of [
    ["ffmpeg", FFMPEG_FILENAME, ffmpeg],
    ["ffprobe", FFPROBE_FILENAME, ffprobe],
  ] as const) {
    const link = join(dir, filename);
    if (!linkCurrent(link, target)) {
      rmSync(link, { force: true });
      try {
        symlinkSync(target, link);
      } catch {
        stageCopy(link, target);
      }
    }
    staged[tool] = link;
  }
  return staged;
}

/** Hard links share the source's inode, so they never go stale; copies pin mtime so size+mtime equality detects an updated binary. */
function stageCopy(link: string, target: string): void {
  try {
    linkSync(target, link);
    return;
  } catch {
    /** A hard link needs the same volume; userData and node_modules can differ. */
  }
  copyFileSync(target, link);
  const info = statSync(target);
  utimesSync(link, info.atime, info.mtime);
}

function linkCurrent(link: string, target: string): boolean {
  try {
    const info = statSync(target);
    if (lstatSync(link).isSymbolicLink()) return readlinkSync(link) === target;
    const staged = statSync(link);
    return (
      staged.size === info.size &&
      Math.abs(staged.mtimeMs - info.mtimeMs) < 2000
    );
  } catch {
    return false;
  }
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
  if (handed && existsSync(handed)) {
    return handed;
  }
  const candidates: Array<string> = [];
  if (app?.isPackaged) {
    candidates.push(join(process.resourcesPath, "bin", FFMPEG_FILENAME));
  }
  candidates.push(
    resolve(__dirname, "../../../node_modules/ffmpeg-static", FFMPEG_FILENAME),
    resolve(
      process.cwd(),
      "apps/desktop/node_modules/ffmpeg-static",
      FFMPEG_FILENAME,
    ),
    resolve(process.cwd(), "node_modules/ffmpeg-static", FFMPEG_FILENAME),
  );

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return lookupOnPath(FFMPEG_FILENAME);
}

function resolveFfprobe(): string | null {
  const handed = process.env[FFPROBE_PATH_ENV];
  if (handed && existsSync(handed)) return handed;
  const candidates: Array<string> = [];
  if (app?.isPackaged) {
    candidates.push(join(process.resourcesPath, "bin", FFPROBE_FILENAME));
  }
  /** The vendored Mac build is the true-arch one; ffprobe-static's darwin/arm64 is really x86_64. */
  candidates.push(
    resolve(
      __dirname,
      "../../../vendor/ffmpeg",
      `${process.platform}-${process.arch}`,
      FFPROBE_FILENAME,
    ),
  );
  /** ffprobe-static carries one binary per platform and arch, unlike ffmpeg-static's flat file. */
  const ffprobeStatic = join(
    "ffprobe-static",
    "bin",
    process.platform,
    process.arch,
    FFPROBE_FILENAME,
  );
  candidates.push(
    resolve(__dirname, "../../../node_modules", ffprobeStatic),
    resolve(process.cwd(), "apps/desktop/node_modules", ffprobeStatic),
    resolve(process.cwd(), "node_modules", ffprobeStatic),
  );

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return lookupOnPath(FFPROBE_FILENAME);
}

function lookupOnPath(name: string): string | null {
  return which.sync(name, { nothrow: true });
}
