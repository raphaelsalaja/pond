import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { resolveLibraryId } from "./lib/library-id";
import {
  classifyLibraryPlacement,
  currentLibraryAnchor,
  observeLibrarySync,
} from "./lib/library-placement";
import { readLibraryPointer } from "./lib/library-pointer";
import { isSamePath } from "./lib/path-identity";

export interface PondPaths {
  appData: string;
  cache: string;
  globalDb: string;
  indexDb: string;
  indexesDir: string;
  thumbnailCache: string;
  config: string;
  libraryId: string;
  libraryRoot: string;
  savesDir: string;
  trashDir: string;
  libraryMetadata: string;
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

export function invalidatePaths(): void {
  cached = null;
}

export function resolvePaths(libraryRootOverride?: string): PondPaths {
  if (cached && !libraryRootOverride) return cached;

  const appData = ensureDir(app.getPath("userData"));
  /** Keep Pond derivatives separate from Chromium's case-insensitive `Cache` directory. */
  const cache = ensureDir(join(appData, "pond-cache"));
  const indexesDir = ensureDir(join(appData, "indexes"));

  const pointer = readLibraryPointer();
  const root = libraryRootOverride ?? pointer ?? defaultLibraryRoot();
  const open = currentLibraryAnchor();
  /** The open folder was moved or replaced. Keep its index id and do not recreate items/. */
  const displaced =
    open != null &&
    isSamePath(open.root, root) &&
    classifyLibraryPlacement(open, observeLibrarySync(root)) !== "present";
  const committed =
    libraryRootOverride != null || pointer != null || existsSync(root);
  if (committed && !displaced) ensureLibraryDirs(root);

  const libraryId =
    displaced && open ? open.libraryId : resolveLibraryId(root, committed);

  const paths: PondPaths = {
    appData,
    cache,
    globalDb: join(appData, "global.db"),
    indexDb: join(indexesDir, `${libraryId}.db`),
    indexesDir,
    thumbnailCache: ensureDir(join(cache, "thumbs", libraryId)),
    config: join(appData, "config.json"),
    libraryId,
    libraryRoot: root,
    savesDir: join(root, "items"),
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

export function saveDirIn(root: string, id: string): string {
  return join(root, "items", `${id}.info`);
}

export function trashSaveDirIn(root: string, id: string): string {
  return join(root, "trash", `${id}.info`);
}

export function saveDir(id: string): string {
  return saveDirIn(resolvePaths().libraryRoot, id);
}

export function saveFile(id: string, file: string): string {
  return join(saveDir(id), file);
}

export function appDataRoot(): string {
  return resolvePaths().appData;
}

export function libraryRoot(): string {
  return resolvePaths().libraryRoot;
}

export function libraryId(): string {
  return resolvePaths().libraryId;
}

export function thumbnailCacheRoot(): string {
  return resolvePaths().thumbnailCache;
}

export function savesRoot(): string {
  return resolvePaths().savesDir;
}

export function trashRoot(): string {
  return resolvePaths().trashDir;
}
