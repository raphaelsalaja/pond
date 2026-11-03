import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import { createMemoCache } from "../lib/memo-cache";
import { libraryRoot, savesRoot, thumbnailCacheRoot } from "../paths";

interface LibraryBreakdown {
  items: number;
  videoCache: number;
  thumbs: number;
  meta: number;
  db: number;
  other: number;
  total: number;
}

interface DeviceDiskInfo {
  totalBytes: number;
  freeBytes: number;
  usedByOthers: number;
}

interface StorageSnapshot {
  pondBytes: number;
  breakdown: Omit<LibraryBreakdown, "total">;
  deviceTotalBytes: number;
  deviceFreeBytes: number;
  deviceUsedByOthersBytes: number;
  libraryRoot: string;
  computedAt: string;
}

const KNOWN_BUCKETS: ReadonlyArray<{
  dir: string;
  bucket: keyof Omit<LibraryBreakdown, "total">;
}> = [
  { dir: "items", bucket: "items" },
  { dir: "_video_cache", bucket: "videoCache" },
  { dir: "_meta", bucket: "meta" },
];

const CACHE_TTL_MS = 30_000;

const snapshotCache = createMemoCache<StorageSnapshot>(computeSnapshot, {
  ttlMs: CACHE_TTL_MS,
});

export async function getStorageSnapshot(): Promise<StorageSnapshot> {
  return snapshotCache.get();
}

async function computeSnapshot(): Promise<StorageSnapshot> {
  const root = libraryRoot();
  const [breakdown, device] = await Promise.all([
    computeLibraryBreakdown(),
    getDeviceDiskInfo(root),
  ]);
  return {
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
}

async function computeLibraryBreakdown(): Promise<LibraryBreakdown> {
  const root = libraryRoot();
  const itemsAbs = savesRoot();
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

  const [entrySizes, extraItems, thumbs, db] = await Promise.all([
    Promise.all(
      entries.map((entry) =>
        entry.isDir ? sumDirSizes(entry.abs) : safeFileSize(entry.abs),
      ),
    ),
    !entries.some((e) => e.abs === itemsAbs) && itemsAbs.startsWith(root)
      ? sumDirSizes(itemsAbs)
      : 0,
    sumDirSizes(thumbnailCacheRoot()),
    indexDbSize(),
  ]);
  entries.forEach((entry, index) => {
    const known = KNOWN_BUCKETS.find((k) => k.dir === entry.name);
    buckets[known?.bucket ?? "other"] += entrySizes[index] ?? 0;
  });
  buckets.items += extraItems;
  buckets.thumbs += thumbs;
  buckets.db += db;

  const total =
    buckets.items +
    buckets.videoCache +
    buckets.thumbs +
    buckets.meta +
    buckets.db +
    buckets.other;
  return { ...buckets, total };
}

async function getDeviceDiskInfo(path: string): Promise<DeviceDiskInfo> {
  try {
    const stats = await statfs(path);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
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

async function indexDbSize(): Promise<number> {
  try {
    const dbPath = (await import("../paths")).resolvePaths().indexDb;
    const sizes = await Promise.all(
      [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map(safeFileSize),
    );
    return sizes.reduce((sum, size) => sum + size, 0);
  } catch (err) {
    log.warn("[pond storage-stats] failed to stat indexDb", err);
    return 0;
  }
}

/** Caps in-flight readdir/stat calls so a large library walk never floods libuv's shared thread pool. */
const fsLimit = pLimit(8);

async function sumDirSizes(dir: string): Promise<number> {
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fsLimit(() => readdir(dir, { withFileTypes: true }));
  } catch (err) {
    log.debug("[pond storage-stats] readdir failed", dir, err);
    return 0;
  }
  const sizes = await Promise.all(
    dirents.map((entry) => {
      if (entry.isSymbolicLink()) return 0;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) return sumDirSizes(abs);
      if (entry.isFile()) return safeFileSize(abs);
      return 0;
    }),
  );
  return sizes.reduce((sum, size) => sum + size, 0);
}

async function safeFileSize(path: string): Promise<number> {
  try {
    const s = await fsLimit(() => stat(path));
    return Number.isFinite(s.size) ? s.size : 0;
  } catch {
    return 0;
  }
}
