import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * All filesystem paths the main process uses. Centralised so every module
 * agrees on "where does the SQLite index live" and Phase 3's "Switch
 * library" can flip the `libraryRoot` once, not in 20 places.
 *
 * Two-location split (see plan § "Where stuff is saved on disk"):
 *
 *  - `appData` / `cache` / `logs`      -> rebuildable, invisible in Finder
 *  - `libraryRoot`                     -> source of truth, Finder-browsable
 */
export interface PondPaths {
  appData: string;
  cache: string;
  logs: string;
  indexDb: string;
  config: string;
  libraryRoot: string;
  itemsDir: string;
  trashDir: string;
  libraryMetadata: string;
}

let cached: PondPaths | null = null;

function ensureDir(p: string): string {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Resolve paths lazily so unit tests can call this before `app.setName()`
 * without Electron being fully initialised.
 */
export function resolvePaths(libraryRootOverride?: string): PondPaths {
  if (cached && !libraryRootOverride) return cached;

  const appData = ensureDir(app.getPath("userData"));
  const cache = ensureDir(join(appData, "cache"));
  const logs = ensureDir(app.getPath("logs"));

  const libraryRoot = ensureDir(
    libraryRootOverride ?? join(app.getPath("home"), "Pond", "My Pond.library"),
  );
  const itemsDir = ensureDir(join(libraryRoot, "items"));
  const trashDir = ensureDir(join(libraryRoot, "trash"));

  const paths: PondPaths = {
    appData,
    cache,
    logs,
    indexDb: join(appData, "index.db"),
    config: join(appData, "config.json"),
    libraryRoot,
    itemsDir,
    trashDir,
    libraryMetadata: join(libraryRoot, "metadata.json"),
  };

  cached = paths;
  return paths;
}

export function itemDir(id: string): string {
  return join(resolvePaths().itemsDir, `${id}.info`);
}

export function itemFile(id: string, file: string): string {
  return join(itemDir(id), file);
}

/** Convenience accessors so callers don't need to destructure `resolvePaths()`. */
export function appDataRoot(): string {
  return resolvePaths().appData;
}

export function libraryRoot(): string {
  return resolvePaths().libraryRoot;
}

export function itemsRoot(): string {
  return resolvePaths().itemsDir;
}

export function trashRoot(): string {
  return resolvePaths().trashDir;
}
