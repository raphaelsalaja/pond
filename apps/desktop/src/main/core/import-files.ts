import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { ImportOrigin } from "@pond/schema/import-origin";
import type {
  ManualSaveResult,
  SavesImportFilesResult,
} from "@shared/saves-import-contracts";
import { createFolder, setSaveFolders } from "./folders";
import { runLibraryTransfer } from "./library-transfers";
import { createManualSave } from "./manual-import";

interface FileImportRuntime {
  createFolder(input: {
    name: string;
    parentId: string | null;
  }): Promise<{ id: string }>;
  importFile(input: {
    filePaths: string[];
    tags: string[];
    importedFrom: ImportOrigin;
  }): Promise<ManualSaveResult>;
  assignFolders(id: string, folderIds: string[]): Promise<{ ok: boolean }>;
}

const runtime: FileImportRuntime = {
  createFolder,
  importFile: createManualSave,
  assignFolders: setSaveFolders,
};

async function importPaths(
  input: {
    paths: readonly string[];
    tags?: string[];
    folderIds?: string[];
    useExisting?: Readonly<Record<string, string>>;
    origin?: ImportOrigin;
  },
  dependencies: FileImportRuntime = runtime,
): Promise<SavesImportFilesResult> {
  const ids: string[] = [];
  const failedPaths: string[] = [];
  const visited = new Set<string>();
  const tags = input.tags ?? [];
  const folderIds = input.folderIds ?? [];

  async function visit(path: string, parentId: string | null) {
    const absolute = resolve(path);
    if (visited.has(absolute) || basename(path).startsWith(".")) return;
    visited.add(absolute);
    try {
      const details = await stat(path);
      if (details.isDirectory()) {
        const folder = await dependencies.createFolder({
          name: basename(path),
          parentId,
        });
        const entries = await readdir(path, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() || entry.isFile())
            await visit(join(path, entry.name), folder.id);
        }
      } else if (details.isFile() && details.size > 0) {
        const assigned = [
          ...new Set([...folderIds, ...(parentId ? [parentId] : [])]),
        ];
        const existingId = input.useExisting?.[absolute];
        if (existingId) {
          if (assigned.length > 0) {
            const result = await dependencies.assignFolders(
              existingId,
              assigned,
            );
            if (!result.ok)
              throw new Error("Existing file folders could not be assigned.");
          }
          ids.push(existingId);
          return;
        }
        const imported = await dependencies.importFile({
          filePaths: [path],
          tags,
          importedFrom: input.origin ?? "files",
        });
        if (!imported.ok) throw new Error(imported.error);
        if (assigned.length > 0) {
          const result = await dependencies.assignFolders(
            imported.id,
            assigned,
          );
          if (!result.ok)
            throw new Error("Imported file folders could not be assigned.");
        }
        ids.push(imported.id);
      }
    } catch {
      failedPaths.push(path);
    }
  }

  for (const path of input.paths) await visit(path, folderIds[0] ?? null);
  if (ids.length === 0) return { ok: false, failedPaths, error: "no_files" };
  return { ok: true, ids: [...new Set(ids)], failedPaths };
}

export function importFiles(
  input: {
    paths: readonly string[];
    tags?: string[];
    folderIds?: string[];
    useExisting?: Readonly<Record<string, string>>;
    origin?: ImportOrigin;
  },
  dependencies: FileImportRuntime = runtime,
) {
  return runLibraryTransfer(() => importPaths(input, dependencies));
}
