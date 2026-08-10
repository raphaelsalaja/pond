import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  type NewSave,
  type Save,
  type SaveFile,
  saves,
  syncActions,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../../db";
import { withRawSlim } from "../../../lib/raw-slim";
import { itemDir } from "../../../paths";
import { broadcastSyncAction } from "../../executor";

interface WriteFileMetadata {
  kind: SaveFile["kind"];
  filename: string;
  mimeType?: string;
  width?: number;
  height?: number;
  /** Origin URL this file was downloaded from; persisted for smart per-URL skip. */
  sourceUrl?: string;
}

export type WriteFileArgs = WriteFileMetadata &
  (
    | { bytes: Buffer; sourcePath?: never }
    | { bytes?: never; sourcePath: string }
  );

interface ApplyPatchOptions {
  actorReason: string;
  newFiles?: WriteFileArgs[];
  replaceFilesWithKind?: SaveFile["kind"] | SaveFile["kind"][];
}

export async function applySavePatch(
  saveId: string,
  patch: Partial<NewSave>,
  opts: ApplyPatchOptions,
): Promise<Save | null> {
  const db = await getDb();
  /** Select only the columns this patch needs, not the whole row; avoids loading `raw_json` on every patch. */
  const cols: Record<string, SQLiteColumn> = {
    id: saves.id,
    files: saves.files,
  };
  const columnByKey = saves as unknown as Record<string, SQLiteColumn>;
  for (const key of Object.keys(patch)) {
    const col = columnByKey[key];
    if (col) cols[key] = col;
  }
  const rows = await db.select(cols).from(saves).where(eq(saves.id, saveId));
  const current = rows[0] as Partial<Save> | undefined;
  if (!current) {
    log.warn("[pond pipeline] applySavePatch: save vanished", saveId);
    return null;
  }

  const replaceKinds =
    opts.replaceFilesWithKind == null
      ? null
      : new Set<SaveFile["kind"]>(
          Array.isArray(opts.replaceFilesWithKind)
            ? opts.replaceFilesWithKind
            : [opts.replaceFilesWithKind],
        );
  /** Replaced kinds free their filenames, so regenerations overwrite in place instead of accumulating suffixed copies. */
  const baseFiles = replaceKinds
    ? (current.files ?? []).filter((f) => !replaceKinds.has(f.kind))
    : (current.files ?? []);

  const written: SaveFile[] = [];
  if (opts.newFiles && opts.newFiles.length > 0) {
    const dir = itemDir(saveId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    for (const file of opts.newFiles) {
      const target = uniqueFilename(file.filename, baseFiles, written);
      const targetPath = join(dir, target);
      const details = await persistWriteFile(file, targetPath);
      if (!details) {
        log.warn(
          "[pond pipeline] applySavePatch: empty file skipped",
          saveId,
          file.filename,
        );
        continue;
      }
      const entry: SaveFile = {
        kind: file.kind,
        path: target,
        sha256: details.sha256,
        size: details.size,
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        ...(file.width ? { width: file.width } : {}),
        ...(file.height ? { height: file.height } : {}),
        ...(file.sourceUrl ? { sourceUrl: file.sourceUrl } : {}),
      };
      written.push(entry);
    }
  }
  const nextFiles =
    written.length > 0 ? [...baseFiles, ...written] : current.files;

  const fullPatch: Partial<NewSave> = {
    ...patch,
    ...(written.length > 0 ? { files: nextFiles } : {}),
  };

  db.update(saves)
    .set(withRawSlim(fullPatch))
    .where(eq(saves.id, saveId))
    .run();
  const updated = (
    await db.select().from(saves).where(eq(saves.id, saveId))
  )[0];
  if (!updated) return null;

  const inserted = db
    .insert(syncActions)
    .values({
      modelName: "save",
      modelId: saveId,
      action: "U",
      data: fullPatch as unknown,
      prevData: pickPrev(current, fullPatch),
      actor: "system",
      actorReason: opts.actorReason,
      batchId: ulid(),
    })
    .returning()
    .all()[0];
  if (inserted) broadcastSyncAction(inserted);

  return updated;
}

/** Materialize a pending file without requiring large derivatives in memory. */
export async function persistWriteFile(
  file: WriteFileArgs,
  targetPath: string,
): Promise<{ sha256: string; size: number } | null> {
  if (file.bytes) {
    if (file.bytes.byteLength === 0) return null;
    await writeFile(targetPath, file.bytes);
    return {
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      size: file.bytes.byteLength,
    };
  }

  await copyFile(file.sourcePath, targetPath);
  const { size } = await stat(targetPath);
  if (size === 0) {
    await rm(targetPath, { force: true });
    return null;
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(targetPath)) hash.update(chunk);
  return { sha256: hash.digest("hex"), size };
}

export async function readSave(saveId: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  return rows[0] ?? null;
}

function pickPrev(current: Partial<Save>, patch: Partial<NewSave>): unknown {
  const prev: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = (current as Record<string, unknown>)[key];
  }
  return prev;
}

function uniqueFilename(
  desired: string,
  existing: ReadonlyArray<SaveFile>,
  pending: ReadonlyArray<SaveFile>,
): string {
  const taken = new Set<string>();
  for (const f of existing) taken.add(f.path);
  for (const f of pending) taken.add(f.path);
  if (!taken.has(desired)) return desired;
  const ext = extname(desired);
  const base = desired.slice(0, desired.length - ext.length);
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}
