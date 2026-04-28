import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";

/**
 * Resolves the on-disk paths to bundled CLI binaries the refresh
 * pipeline shells out to (currently yt-dlp + ffmpeg). Pond ships a
 * pinned yt-dlp via `scripts/download-yt-dlp.mjs` and a static ffmpeg
 * via the `ffmpeg-static` npm package; we look in two places at
 * runtime so the same code path works in dev and in packaged builds.
 *
 * Order of resolution:
 *   1. Packaged: `process.resourcesPath/bin/<name>` — wired by
 *      `electron-builder.yml > extraResources`.
 *   2. Dev: `apps/desktop/resources/bin/<name>` for yt-dlp,
 *      `node_modules/ffmpeg-static/ffmpeg` for ffmpeg.
 *   3. PATH lookup as a last-ditch escape hatch (e.g. CI without
 *      the postinstall, or a user who installed brew yt-dlp).
 *
 * `null` is a first-class result so callers can short-circuit cleanly
 * — the refresh path treats missing binaries as "skip video download,
 * keep the poster" rather than failing the refresh.
 */

export interface ResolvedBinaries {
  ytdlp: string | null;
  ffmpeg: string | null;
}

const YTDLP_FILENAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const FFMPEG_FILENAME = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

let cached: ResolvedBinaries | null = null;

/**
 * Returns the resolved paths. Cached for the lifetime of the main
 * process — these don't change at runtime. Call `invalidateBinariesCache`
 * after a re-install if you want the lookup to retry.
 */
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
  const candidates: string[] = [];
  // Packaged: extraResources flattens our `resources/bin/` next to
  // Electron's resources root.
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, "bin", YTDLP_FILENAME));
  }
  // Dev: postinstall script writes here.
  candidates.push(
    resolve(__dirname, "../../../../resources/bin", YTDLP_FILENAME),
  );
  candidates.push(
    resolve(process.cwd(), "apps/desktop/resources/bin", YTDLP_FILENAME),
  );
  candidates.push(resolve(process.cwd(), "resources/bin", YTDLP_FILENAME));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // PATH escape hatch.
  const onPath = lookupOnPath(YTDLP_FILENAME);
  return onPath;
}

function resolveFfmpeg(): string | null {
  const candidates: string[] = [];
  if (app.isPackaged) {
    candidates.push(join(process.resourcesPath, "bin", FFMPEG_FILENAME));
  }
  // Dev: ffmpeg-static publishes the binary path as default export, but
  // we resolve via require so we don't pull a CJS module into an ESM
  // graph. Cheaper to just hard-code the relative path the package
  // ships (`ffmpeg`) and let `existsSync` filter.
  candidates.push(
    resolve(__dirname, "../../../node_modules/ffmpeg-static/ffmpeg"),
  );
  candidates.push(
    resolve(process.cwd(), "apps/desktop/node_modules/ffmpeg-static/ffmpeg"),
  );
  candidates.push(resolve(process.cwd(), "node_modules/ffmpeg-static/ffmpeg"));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return lookupOnPath(FFMPEG_FILENAME);
}

/**
 * Walk `$PATH` (or `%PATH%` on Windows) for an executable. We don't
 * shell out to `which` because that would block on a process spawn for
 * every cache-miss; the manual scan is faster and dependency-free.
 */
function lookupOnPath(name: string): string | null {
  const path = process.env.PATH;
  if (!path) return null;
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of path.split(sep)) {
    if (!dir) continue;
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
