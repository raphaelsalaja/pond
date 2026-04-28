import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { Save } from "@pond/schema/db";
import type { TxSaveFile } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { LIBRARY_SCHEMA_VERSION } from "../../shared/constants";
import { itemDir, itemFile, resolvePaths } from "../paths";

/**
 * File-first library writer. The executor in `core/` is the ONLY caller;
 * every tx gets turned into a sequence of:
 *
 *   writeItemFiles(id, metadata, files)   -> creates items/<id>.info/
 *   moveToTrash(id)                       -> items -> trash
 *   restoreFromTrash(id)                  -> trash -> items
 *   removeItem(id)                        -> rm -rf items/<id>.info/
 *
 * The `metadata.json` written here is the **source of truth**. Everything
 * else (SQLite rows, FTS5, vec0) is a rebuildable index over these files.
 */

/** Per-item metadata.json schema. Superset of Eagle's. */
export interface ItemMetadata {
  id: string;
  source: string;
  sourceId: string;
  url: string;
  name: string | null;
  annotation: string;
  tags: string[];
  aiTags: string[];
  aiCaption: string | null;
  folders: string[];
  palettes: Array<{ hex: string; weight: number }>;
  ext: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  btime: number;
  mtime: number;
  importedAt: number;
  archivedAt: number | null;
  isDeleted: boolean;
  files: Array<{
    kind: string;
    path: string;
    sha256: string;
    size: number;
  }>;
  pond: {
    schemaVersion: number;
    rawSource?: unknown;
    ocrText?: string | null;
    description?: string | null;
    author?: string | null;
    notes?: string | null;
    mediaType?: string | null;
    coverIndex?: number;
    enrichedAt?: number;
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function inferKindFromFilename(filename: string): string {
  if (filename.startsWith("cover")) return "cover";
  if (filename.startsWith("video")) return "video";
  if (filename.startsWith("media-")) return "media";
  if (filename.startsWith("poster-")) return "poster";
  if (filename.startsWith("avatar")) return "avatar";
  return "other";
}

function decodeFile(file: TxSaveFile): { filename: string; buf: Buffer } {
  const buf = Buffer.from(file.base64, "base64");
  return { filename: file.filename, buf };
}

/**
 * Build the on-disk `metadata.json` shape from a `Save` row. Callers pass
 * the set of files that exist in `items/<id>.info/` so we can fill in the
 * `files[]` descriptor with sha256 + size.
 */
export async function buildItemMetadata(
  save: Save,
  writtenFiles: Array<{ filename: string; buf: Buffer; kind?: string }>,
): Promise<ItemMetadata> {
  const now = Date.now();
  const files = writtenFiles.map((f) => ({
    kind: f.kind ?? inferKindFromFilename(f.filename),
    path: f.filename,
    sha256: sha256(f.buf),
    size: f.buf.length,
  }));

  return {
    id: save.id,
    source: save.source,
    sourceId: save.sourceId,
    url: save.url,
    name: save.title,
    annotation: save.notes ?? "",
    tags: save.tags ?? [],
    aiTags: save.aiTags ?? [],
    aiCaption: save.aiCaption,
    folders: [],
    palettes: save.dominantColors ?? [],
    ext: files[0] ? extname(files[0].path).slice(1) || null : null,
    size: save.fileSize ?? files[0]?.size ?? null,
    width: save.width,
    height: save.height,
    btime: save.createdAt?.getTime?.() ?? now,
    mtime: now,
    importedAt: save.savedAt?.getTime?.() ?? now,
    archivedAt: save.archivedAt?.getTime?.() ?? null,
    isDeleted: save.deletedAt !== null,
    files,
    pond: {
      schemaVersion: LIBRARY_SCHEMA_VERSION,
      rawSource: save.rawJson,
      ocrText: save.ocrText,
      description: save.description,
      author: save.author,
      notes: save.notes,
      mediaType: save.mediaType,
      coverIndex: save.coverIndex,
    },
  };
}

/**
 * Writes `items/<id>.info/{metadata.json, file1, file2, ...}`. Directory
 * is created with `recursive: true` so concurrent callers don't race.
 *
 * Returns the written file descriptors so the executor can pass them
 * through to `saves.blob_url` / `pond://<id>/...` URIs.
 */
export async function writeItemFiles(
  id: string,
  save: Save,
  files: TxSaveFile[] = [],
): Promise<{
  metadata: ItemMetadata;
  written: Array<{ filename: string; buf: Buffer }>;
}> {
  const dir = itemDir(id);
  await mkdir(dir, { recursive: true });

  const decoded = files.map(decodeFile);
  for (const { filename, buf } of decoded) {
    await writeFile(join(dir, filename), buf);
  }

  const metadata = await buildItemMetadata(save, decoded);
  await writeFile(
    join(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );
  return { metadata, written: decoded };
}

export async function readItemMetadata(
  id: string,
): Promise<ItemMetadata | null> {
  const file = itemFile(id, "metadata.json");
  if (!existsSync(file)) return null;
  try {
    const text = await readFile(file, "utf8");
    return JSON.parse(text) as ItemMetadata;
  } catch (err) {
    log.warn("[pond library] corrupt metadata.json", id, err);
    return null;
  }
}

/**
 * Soft-delete: items/<id>.info  ->  trash/<id>.info  and stamp
 * `metadata.json.isDeleted = true`. The executor also updates the
 * `saves.deleted_at` index column.
 */
export async function moveToTrash(id: string): Promise<void> {
  const from = itemDir(id);
  if (!existsSync(from)) return;
  const to = join(resolvePaths().trashDir, basename(from));
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);

  try {
    const metaPath = join(to, "metadata.json");
    if (existsSync(metaPath)) {
      const current = JSON.parse(
        await readFile(metaPath, "utf8"),
      ) as ItemMetadata;
      current.isDeleted = true;
      current.mtime = Date.now();
      await writeFile(metaPath, JSON.stringify(current, null, 2));
    }
  } catch (err) {
    log.warn("[pond library] trash metadata stamp failed", id, err);
  }
}

export async function restoreFromTrash(id: string): Promise<void> {
  const from = join(resolvePaths().trashDir, `${id}.info`);
  if (!existsSync(from)) return;
  const to = itemDir(id);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);

  const metaPath = join(to, "metadata.json");
  if (existsSync(metaPath)) {
    const current = JSON.parse(
      await readFile(metaPath, "utf8"),
    ) as ItemMetadata;
    current.isDeleted = false;
    current.mtime = Date.now();
    await writeFile(metaPath, JSON.stringify(current, null, 2));
  }
}

/** Hard delete. Use with care — no undo once the folder is rm -rf'd. */
export async function removeItem(id: string): Promise<void> {
  const path = itemDir(id);
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true });
  }
  const trashPath = join(resolvePaths().trashDir, `${id}.info`);
  if (existsSync(trashPath)) {
    await rm(trashPath, { recursive: true, force: true });
  }
}

/**
 * Walk `items/` and stat each directory. Returns a stream of
 * `{ id, mtimeMs, metadata }` entries so the executor can reconcile
 * incrementally against the `library_scan` table.
 *
 * Cheap at pond scale — reading ~5000 directories + JSON on APFS is
 * well under a second.
 */
export async function* scanLibrary(): AsyncGenerator<{
  id: string;
  mtimeMs: number;
  metadata: ItemMetadata | null;
}> {
  const paths = resolvePaths();
  let entries: string[] = [];
  try {
    entries = await readdir(paths.itemsDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith(".info")) continue;
    const id = entry.slice(0, -".info".length);
    const dir = join(paths.itemsDir, entry);
    try {
      const info = await stat(dir);
      const metadata = await readItemMetadata(id);
      yield { id, mtimeMs: info.mtimeMs, metadata };
    } catch (err) {
      log.warn("[pond library] scan stat failed", id, err);
    }
  }
}
