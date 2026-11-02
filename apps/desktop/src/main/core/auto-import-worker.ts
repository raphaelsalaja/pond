import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";

const Checkpoints = z.record(z.string(), z.string());
type ImportCheckpoints = z.infer<typeof Checkpoints>;
interface Observation {
  size: number;
  mtime: number;
  since: number;
  retryAt: number;
  failures: number;
  completed: boolean;
}

export interface AutoImportWorkerOptions {
  directory: string;
  checkpointPath: string;
  mode: "copy" | "move";
  ingest(input: {
    path: string;
    sourceId: string;
  }): Promise<{ ok: boolean; id?: string }>;
  /** Moves a source file to the Trash after its import is durable. */
  trash(path: string): Promise<void>;
  report?(entry: { name: string; ok: boolean; id?: string }): Promise<void>;
  stableMs?: number;
  now?: () => number;
}

async function digest(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function readCheckpoints(path: string): Promise<ImportCheckpoints> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return {};
    throw error;
  }
  return Checkpoints.parse(JSON.parse(raw));
}

export async function createAutoImportWorker(options: AutoImportWorkerOptions) {
  const observations = new Map<string, Observation>();
  const now = options.now ?? Date.now;
  let checkpoints = await readCheckpoints(options.checkpointPath);
  let stopped = false;
  let active: Promise<void> = Promise.resolve();

  async function scan() {
    if (stopped) return;
    let paths: string[];
    try {
      paths = await filesUnder(options.directory);
    } catch {
      return;
    }
    const present = new Set(paths);
    for (const path of observations.keys())
      if (!present.has(path)) observations.delete(path);
    for (const path of paths) {
      if (stopped) return;
      const details = await stat(path).catch(() => null);
      if (!details?.isFile() || details.size === 0) continue;
      const previous = observations.get(path);
      if (
        !previous ||
        previous.size !== details.size ||
        previous.mtime !== details.mtimeMs
      ) {
        observations.set(path, {
          size: details.size,
          mtime: details.mtimeMs,
          since: now(),
          retryAt: 0,
          failures: 0,
          completed: false,
        });
        continue;
      }
      if (
        previous.completed ||
        now() - previous.since < (options.stableMs ?? 1500) ||
        now() < previous.retryAt
      )
        continue;
      let staging: string | undefined;
      try {
        const hash = await digest(path);
        if (checkpoints[path] === hash) {
          if (options.mode === "move") {
            const current = await stat(path);
            if (
              current.size === details.size &&
              current.mtimeMs === details.mtimeMs
            )
              await options.trash(path);
          }
          previous.completed = true;
          continue;
        }
        staging = await mkdtemp(join(tmpdir(), "pond-auto-import-"));
        const snapshot = join(staging, basename(path));
        await copyFile(path, snapshot);
        const afterCopy = await stat(path);
        if (
          afterCopy.size !== details.size ||
          afterCopy.mtimeMs !== details.mtimeMs ||
          (await digest(snapshot)) !== hash
        ) {
          observations.delete(path);
          continue;
        }
        if (stopped) return;
        const sourceId = `auto:${createHash("sha256").update(`${path}\0${hash}`).digest("hex")}`;
        const result = await options.ingest({ path: snapshot, sourceId });
        if (!result.ok || !result.id)
          throw new Error("File import did not complete.");
        const next = { ...checkpoints, [path]: hash };
        await mkdir(dirname(options.checkpointPath), { recursive: true });
        const temporary = `${options.checkpointPath}.tmp`;
        await writeFile(temporary, JSON.stringify(next));
        await rename(temporary, options.checkpointPath);
        checkpoints = next;
        if (options.mode === "move") {
          const current = await stat(path).catch(() => null);
          if (
            current?.size === details.size &&
            current.mtimeMs === details.mtimeMs &&
            (await digest(path)) === hash
          )
            await options.trash(path);
        }
        previous.failures = 0;
        previous.completed = true;
        await options.report?.({
          name: basename(path),
          ok: true,
          id: result.id,
        });
      } catch {
        previous.failures += 1;
        previous.retryAt =
          now() +
          Math.min(60_000, 1000 * 2 ** Math.min(previous.failures - 1, 6));
        await options.report?.({ name: basename(path), ok: false });
      } finally {
        if (staging) await rm(staging, { recursive: true, force: true });
      }
    }
  }

  return {
    scan() {
      active = active.catch(() => {}).then(scan);
      return active;
    },
    async stop() {
      stopped = true;
      await active;
    },
  };
}
