import { createHash, webcrypto } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { saves, syncActions } from "@pond/schema/db";
import type { NewSave, Save, SaveFile } from "@pond/schema/db";
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

interface StagedFile extends WriteFileMetadata {
  stagingPath: string;
  sha256: string;
  size: number;
}

/** New files written and hashed next to a Save before its write lock is taken. */
export interface StagedSaveFiles {
  readonly dir: string;
  readonly files: ReadonlyArray<StagedFile>;
  /** Removes staged files that were never moved into the Save. */
  discard(): Promise<void>;
}

const STAGING_PREFIX = ".pond-staging-";

/**
 * Writing media into the Library, often on iCloud, and hashing it takes far longer than the
 * index update. Doing it here, before `withMutationScope`, keeps every other edit and ingest
 * task from queuing behind the copy; the scoped step only renames the staged files.
 */
export async function stageSaveFiles(
  saveId: string,
  files: ReadonlyArray<WriteFileArgs>,
): Promise<StagedSaveFiles> {
  const blocked = libraryWriteBlock(libraryRoot());
  if (blocked) throw userError(blocked);
  const dir = saveDir(saveId);
  const staged: Array<StagedFile> = [];
  const discard = async () => {
    await Promise.all(
      staged.map((file) =>
        rm(file.stagingPath, { force: true }).catch((cause: unknown) => {
          log.warn("[pond pipeline] failed to remove staged file", cause);
        }),
      ),
    );
  };
  try {
    await mkdir(dir, { recursive: true });
    for (const file of files) {
      const stagingPath = join(dir, `${STAGING_PREFIX}${ulid()}`);
      const details = await persistWriteFile(file, stagingPath);
      if (!details) {
        log.warn(
          "[pond pipeline] applySavePatch: empty file skipped",
          saveId,
          file.filename,
        );
        continue;
      }
      staged.push({
        kind: file.kind,
        filename: file.filename,
        mimeType: file.mimeType,
        width: file.width,
        height: file.height,
        sourceUrl: file.sourceUrl,
        custom: file.custom,
        stagingPath,
        ...details,
      });
    }
  } catch (error) {
    await discard();
    throw error;
  }
  return { dir, files: staged, discard };
}

interface ApplyPatchOptions {
  actorReason: string;
  staged?: StagedSaveFiles;
  replaceFilesWithKind?: SaveFile["kind"] | Array<SaveFile["kind"]>;
}

export function mergeSaveFiles(
  current: ReadonlyArray<SaveFile>,
  written: ReadonlyArray<SaveFile>,
  replaceKinds?: SaveFile["kind"] | ReadonlyArray<SaveFile["kind"]> | null,
): Array<SaveFile> {
  const kinds =
    replaceKinds === null || replaceKinds === undefined
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
      opts.replaceFilesWithKind === undefined
        ? null
        : new Set<SaveFile["kind"]>(
            Array.isArray(opts.replaceFilesWithKind)
              ? opts.replaceFilesWithKind
              : [opts.replaceFilesWithKind],
          );
    const written: Array<SaveFile> = [];
    const staged = opts.staged?.files ?? [];
    if (staged.length > 0) {
      const dir = saveDir(saveId);
      if (resolve(dir) !== resolve(opts.staged?.dir ?? "")) {
        throw new Error(
          "The Library changed while this Save's files were written.",
        );
      }
      const existingForNames = replaceKinds
        ? (current.files ?? []).filter((file) => !replaceKinds.has(file.kind))
        : (current.files ?? []);
      for (const file of staged) {
        const target = uniqueFilename(file.filename, existingForNames, written);
        await rename(file.stagingPath, join(dir, target));
        const entry: SaveFile = {
          kind: file.kind,
          path: target,
          sha256: file.sha256,
          size: file.size,
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

    if (fullPatch.title !== undefined && hasUserTitle(saveId)) {
      delete fullPatch.title;
    }
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
        if (!replaceKinds.has(file.kind) || retainedPaths.has(file.path)) {
          continue;
        }
        const path = resolve(join(dir, file.path));
        if (path === dir || !path.startsWith(`${dir}${sep}`)) {
          continue;
        }
        await rm(path, { force: true }).catch((cause: unknown) => {
          log.warn(
            "[pond pipeline] failed to remove replaced file",
            path,
            cause,
          );
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
    /** Web Crypto hashes on a worker thread, so a large video doesn't block the main thread. */
    const [digest] = await Promise.all([
      webcrypto.subtle.digest("SHA-256", file.bytes),
      writeLibraryMedia(targetPath, file.bytes),
    ]);
    return {
      sha256: Buffer.from(digest).toString("hex"),
      size: file.bytes.byteLength,
    };
  }

  const { size } = await stat(file.sourcePath);
  if (size === 0) {
    return null;
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file.sourcePath)) {
    if (Buffer.isBuffer(chunk)) {
      hash.update(chunk);
    }
  }
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
