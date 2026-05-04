import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import archiver from "archiver";
import log from "electron-log/main.js";
import { libraryRoot } from "../paths";
import { getPrefs } from "./prefs";

/**
 * Local snapshot backups. Writes a versioned zip of the library
 * directory into `<library>/_snapshots/` on a schedule chosen by
 * the user. We keep the latest `retainCount` files and prune the
 * rest to stop disk usage from runaway-growing.
 *
 * On purpose: snapshots stay inside the library folder so when the
 * user backs up their `~/Pond/My Pond.library` to Time Machine /
 * iCloud / Backblaze the snapshots ride along automatically.
 */

export interface BackupSnapshot {
  path: string;
  filename: string;
  size: number;
  createdAt: number;
}

const SNAPSHOTS_DIR = "_snapshots";

function snapshotsDir(): string {
  return join(libraryRoot(), SNAPSHOTS_DIR);
}

export async function listSnapshots(): Promise<BackupSnapshot[]> {
  const dir = snapshotsDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: BackupSnapshot[] = [];
  for (const name of entries) {
    if (!name.endsWith(".zip")) continue;
    const path = join(dir, name);
    try {
      const info = await stat(path);
      out.push({
        path,
        filename: name,
        size: info.size,
        createdAt: info.birthtimeMs || info.mtimeMs,
      });
    } catch {
      /* ignore unreadable */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function snapshotNow(): Promise<BackupSnapshot> {
  const root = libraryRoot();
  const dir = snapshotsDir();
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pond-${stamp}.zip`;
  const dest = join(dir, filename);

  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(dest);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("warning", (err) => log.warn("[pond backup] archiver", err));
    archive.on("error", reject);
    archive.pipe(out);
    // Skip our own snapshots dir so we don't recursively zip yesterday's
    // archive into today's. archiver doesn't expose a native exclude
    // helper, so we walk the top-level entries and add each one
    // selectively.
    void (async () => {
      const top = await readdir(root);
      for (const name of top) {
        if (name === SNAPSHOTS_DIR) continue;
        const full = join(root, name);
        const info = await stat(full);
        if (info.isDirectory()) {
          archive.directory(full, name);
        } else {
          archive.file(full, { name });
        }
      }
      void archive.finalize();
    })();
  });

  const info = await stat(dest);
  log.info("[pond backup] wrote", filename, info.size);

  await pruneOldSnapshots();
  return {
    path: dest,
    filename,
    size: info.size,
    createdAt: info.birthtimeMs || info.mtimeMs,
  };
}

async function pruneOldSnapshots(): Promise<number> {
  const prefs = await getPrefs();
  const keep = Math.max(1, prefs.backups.retainCount);
  const list = await listSnapshots();
  if (list.length <= keep) return 0;
  const stale = list.slice(keep);
  let removed = 0;
  for (const s of stale) {
    try {
      await rm(s.path, { force: true });
      removed += 1;
    } catch (err) {
      log.warn("[pond backup] prune failed", basename(s.path), err);
    }
  }
  if (removed > 0) log.info(`[pond backup] pruned ${removed} old snapshots`);
  return removed;
}

/**
 * Hourly tick that decides whether the schedule says it's time for
 * a fresh snapshot. The check is cheap (read mtime of the latest
 * zip + a comparison) so running once an hour is fine even for
 * `monthly` schedules.
 */
export function startBackupCron(): void {
  const tick = async () => {
    try {
      const prefs = await getPrefs();
      const cadence = prefs.backups.schedule;
      if (cadence === "never") return;
      const latest = (await listSnapshots())[0];
      const elapsed = latest ? Date.now() - latest.createdAt : Infinity;
      const required = scheduleToMs(cadence);
      if (elapsed < required) return;
      log.info(`[pond backup-cron] firing ${cadence} snapshot`);
      await snapshotNow();
    } catch (err) {
      log.warn("[pond backup-cron] tick failed", err);
    }
  };
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), 60 * 60 * 1000);
}

function scheduleToMs(s: "daily" | "weekly" | "monthly"): number {
  if (s === "daily") return 24 * 60 * 60 * 1000;
  if (s === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}
