import type { BulkEdit } from "../../shared/bulk-contracts";
import { activeLibraryId } from "../core/active-library-query";
import { type Db, getDb } from "../db";
import { bulkQueries } from "../ipc/queries/bulk";
import { foldersQueries } from "../ipc/queries/folders";
import { PondError } from "../lib/pond-error";

export type FolderAssignment = {
  saveIds: string[];
  addIds: string[];
  removeIds: string[];
};

export interface ApiRuntime {
  getDb(): Promise<Db>;
  libraryId(): string;
  bulkEdit(input: BulkEdit): Promise<{ changed: number }>;
  assignFolders(input: FolderAssignment): Promise<void>;
}

export const apiRuntime: ApiRuntime = {
  getDb,
  libraryId: activeLibraryId,
  async bulkEdit(input) {
    const { changed } = await bulkQueries["saves.bulkEdit"](input);
    return { changed };
  },
  async assignFolders(input) {
    await foldersQueries["folders.assign"](input);
  },
};

/** Rejects requests pinned to a Library that is no longer active. */
export function requireLibrary(
  runtime: ApiRuntime,
  requested: string | undefined,
): string {
  const active = runtime.libraryId();
  if (requested && requested !== active)
    throw new PondError(
      "library_mismatch",
      "The active Library changed. Run the request again.",
    );
  return active;
}
