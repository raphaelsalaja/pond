import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { readLibraryPointer } from "./lib/library-pointer";

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

export function defaultLibraryRoot(): string {
  return join(app.getPath("home"), "Pond", "My Pond.library");
}

// Bust the cache. Call this after writing a new pointer so the next
// call to resolvePaths() picks up the user's choice. In practice we
// always pair this with `app.relaunch(); app.exit(0)` — live re-pointing
// is hard because many modules captured the old paths at boot.
export function invalidatePaths(): void {
  cached = null;
}

export function resolvePaths(libraryRootOverride?: string): PondPaths {
  if (cached && !libraryRootOverride) return cached;

  const appData = ensureDir(app.getPath("userData"));
  const cache = ensureDir(join(appData, "cache"));
  const logs = ensureDir(app.getPath("logs"));

  const libraryRoot = ensureDir(
    libraryRootOverride ?? readLibraryPointer() ?? defaultLibraryRoot(),
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
