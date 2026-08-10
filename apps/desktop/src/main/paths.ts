import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { readLibraryPointer } from "./lib/library-pointer";
import { resolvePondId } from "./lib/pond-identity";

interface PondPaths {
  appData: string;
  cache: string;
  logs: string;
  /** App-global state (settings, prefs, onboarded); one file shared by every pond. */
  globalDb: string;
  /** Active pond's index cache; switching ponds swaps this file. */
  indexDb: string;
  indexesDir: string;
  /** Rebuildable per-pond previews stay local even when the library is in iCloud. */
  thumbnailCache: string;
  config: string;
  libraryRoot: string;
  itemsDir: string;
  trashDir: string;
  libraryMetadata: string;
  /** Per-pond root JSONs living inside the bundle: settings, tags, and rolling backups of both. */
  settingsFile: string;
  tagsFile: string;
  backupDir: string;
}

let cached: PondPaths | null = null;

function ensureDir(p: string): string {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
  return p;
}

function defaultLibraryRoot(): string {
  return join(app.getPath("home"), "Pond", "My Pond.pond");
}

/** Busts the cache after writing a new pointer; usually paired with a relaunch. */
export function invalidatePaths(): void {
  cached = null;
}

export function resolvePaths(libraryRootOverride?: string): PondPaths {
  if (cached && !libraryRootOverride) return cached;

  const appData = ensureDir(app.getPath("userData"));
  /** Keep Pond derivatives separate from Chromium's case-insensitive `Cache` directory. */
  const cache = ensureDir(join(appData, "pond-cache"));
  const logs = ensureDir(app.getPath("logs"));
  const indexesDir = ensureDir(join(appData, "indexes"));

  const pointer = readLibraryPointer();
  const root = libraryRootOverride ?? pointer ?? defaultLibraryRoot();
  /** Only materialize the bundle once committed (override, pointer, or existing root). */
  const committed =
    libraryRootOverride != null || pointer != null || existsSync(root);
  if (committed) ensureLibraryDirs(root);

  const pondId = resolvePondId(root, committed);

  const paths: PondPaths = {
    appData,
    cache,
    logs,
    globalDb: join(appData, "global.db"),
    indexDb: join(indexesDir, `${pondId}.db`),
    indexesDir,
    thumbnailCache: ensureDir(join(cache, "thumbs", pondId)),
    config: join(appData, "config.json"),
    libraryRoot: root,
    itemsDir: join(root, "items"),
    trashDir: join(root, "trash"),
    libraryMetadata: join(root, "metadata.json"),
    settingsFile: join(root, "settings.json"),
    tagsFile: join(root, "tags.json"),
    backupDir: join(root, "backup"),
  };

  cached = paths;
  return paths;
}

function ensureLibraryDirs(root: string): void {
  ensureDir(root);
  ensureDir(join(root, "items"));
  ensureDir(join(root, "trash"));
}

export function itemDir(id: string): string {
  return join(resolvePaths().itemsDir, `${id}.info`);
}

export function itemFile(id: string, file: string): string {
  return join(itemDir(id), file);
}

export function appDataRoot(): string {
  return resolvePaths().appData;
}

export function libraryRoot(): string {
  return resolvePaths().libraryRoot;
}

export function thumbnailCacheRoot(): string {
  return resolvePaths().thumbnailCache;
}

export function itemsRoot(): string {
  return resolvePaths().itemsDir;
}

export function trashRoot(): string {
  return resolvePaths().trashDir;
}
