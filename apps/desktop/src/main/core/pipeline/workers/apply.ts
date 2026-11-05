import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
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
import { userError } from "../../../../shared/user-error";
import { getDb } from "../../../db";
import { libraryWriteBlock } from "../../../lib/library-placement";
import { withRawSlim } from "../../../lib/raw-slim";
import { libraryRoot, saveDir } from "../../../paths";
import { broadcastSyncAction, withMutationScope } from "../../executor";
import {
  copyLibraryMediaFile,
  writeLibraryMedia,
} from "../../storage/library-media-storage";
import { hasUserTitle } from "../../user-metadata";

interface WriteFileMetadata {
  kind: SaveFile["kind"];
  filename: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sourceUrl?: string;
  custom?: boolean;
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

export function mergeSaveFiles(
  current: readonly SaveFile[],
  written: readonly SaveFile[],
  replaceKinds?: SaveFile["kind"] | readonly SaveFile["kind"][] | null,
): SaveFile[] {
  const kinds =
    replaceKinds == null
      ? null
      : new Set(Array.isArray(replaceKinds) ? replaceKinds : [replaceKinds]);
  const retained = kinds
    ? current.filter((file) => !kinds.has(file.kind))
    : current;
  return [...retained, ...written];
}

export async function applySavePatch(
  saveId: string,
  patch: Partial<NewSave>,
  opts: ApplyPatchOptions,
): Promise<Save | null> {
  return withMutationScope(async () => {
    const db = await getDb();
    const current = await readSave(saveId);
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
    const written: SaveFile[] = [];
    if (opts.newFiles && opts.newFiles.length > 0) {
      const blocked = libraryWriteBlock(libraryRoot());
      if (blocked) throw userError(blocked);
      const dir = saveDir(saveId);
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
      const existingForNames = replaceKinds
        ? (current.files ?? []).filter((file) => !replaceKinds.has(file.kind))
        : (current.files ?? []);
      for (const file of opts.newFiles) {
        const target = uniqueFilename(file.filename, existingForNames, written);
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
        };
        if (file.mimeType) entry.mimeType = file.mimeType;
        if (file.width) entry.width = file.width;
        if (file.height) entry.height = file.height;
        if (file.sourceUrl) entry.sourceUrl = file.sourceUrl;
        if (file.custom) entry.custom = true;
        written.push(entry);
      }
    }
    const nextFiles =
      written.length > 0 || replaceKinds
        ? mergeSaveFiles(
            current.files ?? [],
            written,
            opts.replaceFilesWithKind,
          )
        : current.files;

    const fullPatch: Partial<NewSave> = { ...patch };
    if (written.length > 0 || replaceKinds) fullPatch.files = nextFiles;

    if (fullPatch.title !== undefined && hasUserTitle(saveId))
      delete fullPatch.title;
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
        data: fullPatch,
        prevData: pickPrev(current, fullPatch),
        actor: "system",
        actorReason: opts.actorReason,
        batchId: ulid(),
      })
      .returning()
      .all()[0];
    if (inserted) broadcastSyncAction(inserted);

    if (replaceKinds) {
      const retainedPaths = new Set((nextFiles ?? []).map((file) => file.path));
      const dir = resolve(saveDir(saveId));
      for (const file of current.files ?? []) {
        if (!replaceKinds.has(file.kind) || retainedPaths.has(file.path))
          continue;
        const path = resolve(join(dir, file.path));
        if (path === dir || !path.startsWith(`${dir}${sep}`)) continue;
        await rm(path, { force: true }).catch((err) => {
          log.warn("[pond pipeline] failed to remove replaced file", path, err);
        });
      }
    }

    return updated;
  });
}

export async function persistWriteFile(
  file: WriteFileArgs,
  targetPath: string,
): Promise<{ sha256: string; size: number } | null> {
  if (file.bytes) {
    if (file.bytes.byteLength === 0) return null;
    await writeLibraryMedia(targetPath, file.bytes);
    return {
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      size: file.bytes.byteLength,
    };
  }

  const { size } = await stat(file.sourcePath);
  if (size === 0) {
    return null;
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file.sourcePath))
    hash.update(chunk);
  await copyLibraryMediaFile(file.sourcePath, targetPath);
  return { sha256: hash.digest("hex"), size };
}

export async function readSave(saveId: string): Promise<Save | null> {
  const db = await getDb();
  const rows = await db.select().from(saves).where(eq(saves.id, saveId));
  return rows[0] ?? null;
}

function pickPrev(current: Save, patch: Partial<NewSave>): Partial<Save> {
  const keys = new Set(Object.keys(patch));
  return Object.fromEntries(
    Object.entries(current).filter(([key]) => keys.has(key)),
  );
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
