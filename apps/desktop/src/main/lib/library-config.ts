import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import log from "electron-log/main.js";
import { z } from "zod";
import { renameSyncWithRetry } from "./rename-retry";

const BUNDLE_JSON_SCHEMA = 1;

interface BundleEnvelope<T> {
  schemaVersion: number;
  updatedAt: number;
  data: T;
}

export interface BundleJsonRead<T> {
  updatedAt: number;
  data: T;
}

export function writeBundleJson<T>(file: string, data: T): void {
  const body: BundleEnvelope<T> = {
    schemaVersion: BUNDLE_JSON_SCHEMA,
    updatedAt: Date.now(),
    data,
  };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.tmp`);
  writeFileSync(tmp, JSON.stringify(body, null, 2));
  renameSyncWithRetry(tmp, file);
}

export function readBundleJson<T>(
  file: string,
  backupDir?: string,
): BundleJsonRead<T> | null {
  if (!existsSync(file)) return null;
  const direct = parseEnvelope<T>(file);
  if (direct) return direct;

  log.error("[pond bundle] corrupt root JSON, trying backups", file);
  if (backupDir) {
    const recovered = recoverFromBackups<T>(file, backupDir);
    if (recovered) {
      log.warn("[pond bundle] recovered from backup", file);
      return recovered;
    }
  }
  log.error("[pond bundle] no parseable backup found", file);
  return null;
}

const EnvelopeSchema = z.object({
  updatedAt: z.number().catch(0),
  data: z.unknown(),
});

function parseEnvelope<T>(file: string): BundleJsonRead<T> | null {
  if (!existsSync(file)) return null;
  const contents = readFileSync(file, "utf8");
  try {
    const parsed = EnvelopeSchema.safeParse(JSON.parse(contents));
    if (!parsed.success || parsed.data.data === undefined) return null;
    /** SAFETY: `T` is what the caller wrote through `writeBundleJson`; every reader re-validates it. */
    return {
      updatedAt: parsed.data.updatedAt,
      data: parsed.data.data as T,
    };
  } catch {
    return null;
  }
}

function recoverFromBackups<T>(
  file: string,
  backupDir: string,
): BundleJsonRead<T> | null {
  const name = basename(file);
  for (const dir of listBackupDirsNewestFirst(backupDir)) {
    const candidate = parseEnvelope<T>(join(backupDir, dir, name));
    if (candidate) return candidate;
  }
  return null;
}

function listBackupDirsNewestFirst(backupDir: string): string[] {
  try {
    return readdirSync(backupDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

const BACKUP_KEEP = 10;

export function rotateBundleBackups(backupDir: string, files: string[]): void {
  const present = files.filter((f) => existsSync(f));
  if (present.length === 0) return;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = join(backupDir, stamp);
  try {
    mkdirSync(target, { recursive: true });
    for (const file of present) {
      cpSync(file, join(target, basename(file)));
    }
  } catch (err) {
    log.warn("[pond bundle] backup snapshot failed", err);
    return;
  }

  const dirs = listBackupDirsNewestFirst(backupDir);
  for (const dir of dirs.slice(BACKUP_KEEP)) {
    try {
      rmSync(join(backupDir, dir), { recursive: true, force: true });
    } catch (err) {
      log.warn("[pond bundle] backup prune failed", dir, err);
    }
  }
}

interface DebouncedTask {
  schedule(): void;
  flush(): Promise<void>;
}

export function createDebouncedTask(
  fn: () => Promise<void>,
  waitMs = 1000,
): DebouncedTask {
  let timer: NodeJS.Timeout | null = null;

  const run = async (): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      log.warn("[pond bundle] debounced task failed", err);
    }
  };

  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, waitMs);
    },
    async flush() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      await run();
    },
  };
}
