import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  type NewSave,
  type Save,
  type SaveFile,
  saves,
  syncActions,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { getDb } from "../../../db";
import { itemDir } from "../../../paths";
import { broadcastSyncAction } from "../../executor";

export interface WriteFileArgs {
  kind: SaveFile["kind"];
  filename: string;
  bytes: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface ApplyPatchOptions {
  actorReason: string;
  newFiles?: WriteFileArgs[];
  replaceFilesWithKind?: SaveFile["kind"];
}

// applySavePatch — single helper for workers to update a save row and (when
// they produce new files) write them to disk + append to save.files. Emits a
// sync_actions row so the renderer's IPC listener gets the update.
export async function applySavePatch(
  saveId: string,
  patch: Partial<NewSave>,
  opts: ApplyPatchOptions,
): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  const current = rows[0];
  if (!current) {
    log.warn("[pond pipeline] applySavePatch: save vanished", saveId);
    return null;
  }

  const written: SaveFile[] = [];
  if (opts.newFiles && opts.newFiles.length > 0) {
    const dir = itemDir(saveId);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    for (const file of opts.newFiles) {
      if (file.bytes.byteLength === 0) {
        log.warn(
          "[pond pipeline] applySavePatch: empty file skipped",
          saveId,
          file.filename,
        );
        continue;
      }
      const target = uniqueFilename(
        file.filename,
        current.files ?? [],
        written,
      );
      await writeFile(join(dir, target), file.bytes);
      const entry: SaveFile = {
        kind: file.kind,
        path: target,
        sha256: createHash("sha256").update(file.bytes).digest("hex"),
        size: file.bytes.byteLength,
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        ...(file.width ? { width: file.width } : {}),
        ...(file.height ? { height: file.height } : {}),
      };
      written.push(entry);
    }
  }

  const baseFiles =
    opts.replaceFilesWithKind != null
      ? (current.files ?? []).filter(
          (f) => f.kind !== opts.replaceFilesWithKind,
        )
      : (current.files ?? []);
  const nextFiles =
    written.length > 0 ? [...baseFiles, ...written] : current.files;

  const fullPatch: Partial<NewSave> = {
    ...patch,
    ...(written.length > 0 ? { files: nextFiles } : {}),
  };

  db.update(saves).set(fullPatch).where(eq(saves.id, saveId)).run();
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

export async function readSave(saveId: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  return rows[0] ?? null;
}

export async function fileExistsOnDisk(
  saveId: string,
  filename: string,
): Promise<boolean> {
  return existsSync(join(itemDir(saveId), filename));
}

export async function readFileBytes(
  saveId: string,
  filename: string,
): Promise<Buffer | null> {
  try {
    return await readFile(join(itemDir(saveId), filename));
  } catch {
    return null;
  }
}

function pickPrev(current: Save, patch: Partial<NewSave>): unknown {
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
