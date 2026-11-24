import { randomUUID } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { JsonValue } from "@pond/schema/json";
import log from "electron-log/main.js";
import { z } from "zod";
import { renameSyncWithRetry, renameWithRetry } from "./rename-retry";

const BUNDLE_JSON_SCHEMA = 1;

interface BundleEnvelope<T> {
  schemaVersion: number;
  updatedAt: number;
  data: T;
}

export interface BundleJsonRead {
  updatedAt: number;
  data: JsonValue;
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

export async function writeBundleJsonAsync<T>(
  file: string,
  data: T,
): Promise<void> {
  const body: BundleEnvelope<T> = {
    schemaVersion: BUNDLE_JSON_SCHEMA,
    updatedAt: Date.now(),
    data,
  };
  await mkdir(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(body, null, 2));
  await renameWithRetry(tmp, file);
}

export async function readBundleJsonAsync(
  file: string,
): Promise<BundleJsonRead | null> {
  let contents: string;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (z.object({ code: z.literal("ENOENT") }).safeParse(error).success) {
      return null;
    }
    throw error;
  }
  return parseContents(contents);
}

export function readBundleJson(
  file: string,
  backupDir?: string,
): BundleJsonRead | null {
  if (!existsSync(file)) {
    return null;
  }
  const direct = parseEnvelope(file);
  if (direct) {
    return direct;
  }

  log.error("[pond bundle] corrupt root JSON, trying backups", file);
  if (backupDir) {
    const recovered = recoverFromBackups(file, backupDir);
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
  data: z.json(),
});

function parseEnvelope(file: string): BundleJsonRead | null {
  if (!existsSync(file)) {
    return null;
  }
  const contents = readFileSync(file, "utf8");
  return parseContents(contents);
}

function parseContents(contents: string): BundleJsonRead | null {
  try {
    const parsed = EnvelopeSchema.safeParse(JSON.parse(contents));
    if (!parsed.success) {
      return null;
    }
    return {
      updatedAt: parsed.data.updatedAt,
      data: parsed.data.data,
    };
  } catch {
    return null;
  }
}

function recoverFromBackups(
  file: string,
  backupDir: string,
): BundleJsonRead | null {
  const name = basename(file);
  for (const dir of listBackupDirsNewestFirst(backupDir)) {
    const candidate = parseEnvelope(join(backupDir, dir, name));
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function listBackupDirsNewestFirst(backupDir: string): Array<string> {
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

export function rotateBundleBackups(
  backupDir: string,
  files: Array<string>,
): void {
  const present = files.filter((f) => existsSync(f));
  if (present.length === 0) {
    return;
  }

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const target = join(backupDir, stamp);
  try {
    mkdirSync(target, { recursive: true });
    for (const file of present) {
      cpSync(file, join(target, basename(file)));
    }
  } catch (error) {
    log.warn("[pond bundle] backup snapshot failed", error);
    return;
  }

  const dirs = listBackupDirsNewestFirst(backupDir);
  for (const dir of dirs.slice(BACKUP_KEEP)) {
    try {
      rmSync(join(backupDir, dir), { recursive: true, force: true });
    } catch (error) {
      log.warn("[pond bundle] backup prune failed", dir, error);
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
    } catch (error) {
      log.warn("[pond bundle] debounced task failed", error);
    }
  };

  return {
    schedule() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, waitMs);
    },
    async flush() {
      if (!timer) {
        return;
      }
      clearTimeout(timer);
      timer = null;
      await run();
    },
  };
}
