import { readdir, stat, statfs } from "node:fs/promises";
import { join, sep } from "node:path";
import log from "electron-log/main.js";
import { itemsRoot, libraryRoot, resolvePaths } from "../paths";

/**
 * Disk-usage accounting for the on-disk library.
 *
 * Every renderer surface that wants to show "Pond is using X GB" funnels
 * through `getStorageSnapshot()`; the watcher in `storage-watcher.ts`
 * reuses the same path so a single TTL cache shields the disk from a
 * burst of reads (settings page first paint + watcher tick + the next
 * watcher tick all collapse to one walk).
 *
 * Walks are recursive but skip symlinks and swallow per-file errors so
 * one unreadable entry can't fail the whole pass. The result is
 * intentionally a flat byte count per category — finer-grained
 * subtotals would need to live in the renderer if we ever want them.
 */

export interface LibraryBreakdown {
  items: number;
  videoCache: number;
  thumbs: number;
  meta: number;
  db: number;
  other: number;
  total: number;
}

export interface DeviceDiskInfo {
  totalBytes: number;
  freeBytes: number;
  usedByOthers: number;
}

export interface StorageSnapshot {
  pondBytes: number;
  breakdown: Omit<LibraryBreakdown, "total">;
  deviceTotalBytes: number;
  deviceFreeBytes: number;
  deviceUsedByOthersBytes: number;
  libraryRoot: string;
  computedAt: string;
}

/**
 * Subdirectory names we recognise inside `libraryRoot`. Anything else
 * is bucketed as `other`. The DB lives outside the library root (in
 * `appData/index.db`) so we account for it separately.
 */
const KNOWN_BUCKETS: ReadonlyArray<{
  dir: string;
  bucket: keyof Omit<LibraryBreakdown, "total">;
}> = [
  { dir: "items", bucket: "items" },
  { dir: "_video_cache", bucket: "videoCache" },
  { dir: "_thumbs", bucket: "thumbs" },
  { dir: "_meta", bucket: "meta" },
];

const CACHE_TTL_MS = 30_000;

let cached: { snapshot: StorageSnapshot; computedAtMs: number } | null = null;
let inflight: Promise<StorageSnapshot> | null = null;

export function invalidateStorageSnapshot(): void {
  cached = null;
  inflight = null;
}

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  const now = Date.now();
  if (cached && now - cached.computedAtMs < CACHE_TTL_MS) {
    return cached.snapshot;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const root = libraryRoot();
    const breakdown = await computeLibraryBreakdown();
    const device = await getDeviceDiskInfo(root);
    const snapshot: StorageSnapshot = {
      pondBytes: breakdown.total,
      breakdown: {
        items: breakdown.items,
        videoCache: breakdown.videoCache,
        thumbs: breakdown.thumbs,
        meta: breakdown.meta,
        db: breakdown.db,
        other: breakdown.other,
      },
      deviceTotalBytes: device.totalBytes,
      deviceFreeBytes: device.freeBytes,
      deviceUsedByOthersBytes: Math.max(
        0,
        device.totalBytes - device.freeBytes - breakdown.total,
      ),
      libraryRoot: root,
      computedAt: new Date().toISOString(),
    };
    cached = { snapshot, computedAtMs: Date.now() };
    return snapshot;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Walk the library root and bucket every file's size into one of the
 * recognised categories. The SQLite db lives outside the library
 * (under `appData/`), so we resolve and stat it separately and roll
 * its bytes into the `db` bucket.
 */
export async function computeLibraryBreakdown(): Promise<LibraryBreakdown> {
  const root = libraryRoot();
  const itemsAbs = itemsRoot();
  const buckets: Omit<LibraryBreakdown, "total"> = {
    items: 0,
    videoCache: 0,
    thumbs: 0,
    meta: 0,
    db: 0,
    other: 0,
  };

  let entries: { name: string; isDir: boolean; abs: string }[];
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    entries = dirents.map((d) => ({
      name: d.name,
      isDir: d.isDirectory(),
      abs: join(root, d.name),
    }));
  } catch (err) {
    log.warn("[pond storage-stats] failed to read library root", err);
    return { ...buckets, total: 0 };
  }

  for (const entry of entries) {
    const known = KNOWN_BUCKETS.find((k) => k.dir === entry.name);
    const bucket = known?.bucket ?? "other";
    if (entry.isDir) {
      buckets[bucket] += await sumDirSizes(entry.abs);
    } else {
      buckets[bucket] += await safeFileSize(entry.abs);
    }
  }

  // Items can also live nested under `items/<id>.info/` — already
  // covered by the recursive walk above. The branch is purely defensive
  // for edge cases where the items dir is symlinked outside `root`.
  if (!entries.some((e) => e.abs === itemsAbs) && itemsAbs.startsWith(root)) {
    buckets.items += await sumDirSizes(itemsAbs);
  }

  try {
    const dbPath = (await import("../paths")).resolvePaths().indexDb;
    buckets.db += await safeFileSize(dbPath);
    // Also account for SQLite's wal/shm sidecars when they exist —
    // they can balloon between checkpoints and the user has every
    // right to see their footprint.
    buckets.db += await safeFileSize(`${dbPath}-wal`);
    buckets.db += await safeFileSize(`${dbPath}-shm`);
  } catch (err) {
    log.warn("[pond storage-stats] failed to stat indexDb", err);
  }

  const total =
    buckets.items +
    buckets.videoCache +
    buckets.thumbs +
    buckets.meta +
    buckets.db +
    buckets.other;
  return { ...buckets, total };
}

/**
 * Volume-level free / total bytes, plus a "used by other apps"
 * derivation (`total - free - libraryTotal`). `statfs` lands on
 * Node 18+, available in Electron's bundled Node since 22.
 */
export async function getDeviceDiskInfo(path: string): Promise<DeviceDiskInfo> {
  try {
    const stats = await statfs(path);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    // `bavail` is "blocks available to non-superuser" which is what
    // Finder shows; `bfree` would include reserved blocks the kernel
    // reserves for root.
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    return {
      totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
      freeBytes: Number.isFinite(freeBytes) ? freeBytes : 0,
      usedByOthers: 0,
    };
  } catch (err) {
    log.warn("[pond storage-stats] statfs failed", err);
    return { totalBytes: 0, freeBytes: 0, usedByOthers: 0 };
  }
}

async function sumDirSizes(dir: string): Promise<number> {
  let total = 0;
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    log.debug("[pond storage-stats] readdir failed", dir, err);
    return 0;
  }
  for (const entry of dirents) {
    if (entry.isSymbolicLink()) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await sumDirSizes(abs);
      // Yield to the event loop every once in a while so a huge
      // library can't starve the main process. The breakdown is run
      // off a TTL cache so the user-visible cost of yielding is nil.
      if (abs.split(sep).length % 4 === 0) {
        await Promise.resolve();
      }
    } else if (entry.isFile()) {
      total += await safeFileSize(abs);
    }
  }
  return total;
}

async function safeFileSize(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return Number.isFinite(s.size) ? s.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Compatibility re-export so callers that already imported
 * `resolvePaths` from `paths.ts` keep working when this file is
 * stubbed out in unit tests.
 */
export { resolvePaths };
