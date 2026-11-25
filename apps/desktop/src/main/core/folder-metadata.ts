import { folderMetadata, folders } from "@pond/schema/db";
import type { FolderMetadata } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import type { OkResult } from "../../shared/query-contracts-shared";
import { getDb } from "../db";
import { libraryRoot } from "../paths";
import { withMutationScope } from "./executor";
import { writeOrganizationBundle } from "./organization-bundle";

export interface FolderMetadataInput {
  description: string | null;
  externalLink: string | null;
}

export function normalizeFolderMetadata(
  input: FolderMetadataInput,
): FolderMetadataInput {
  const description = input.description?.trim() || null;
  const candidate = input.externalLink?.trim() || null;
  if (!candidate) return { description, externalLink: null };
  const link = new URL(candidate);
  if (link.protocol !== "http:" && link.protocol !== "https:") {
    throw new Error("External link must use HTTP or HTTPS.");
  }
  return { description, externalLink: link.toString() };
}

export async function getFolderMetadata(
  folderId: string,
): Promise<FolderMetadata> {
  const db = await getDb();
  const row = db
    .select()
    .from(folderMetadata)
    .where(eq(folderMetadata.folderId, folderId))
    .get();
  return (
    row ?? {
      folderId,
      description: null,
      externalLink: null,
    }
  );
}

export async function setFolderMetadata(
  folderId: string,
  input: FolderMetadataInput,
): Promise<OkResult> {
  return withMutationScope(async () => {
    const db = await getDb();
    const exists = db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.id, folderId))
      .get();
    if (!exists) return { ok: false, error: "Folder not found." };
    const next = normalizeFolderMetadata(input);
    if (!next.description && !next.externalLink) {
      db.delete(folderMetadata)
        .where(eq(folderMetadata.folderId, folderId))
        .run();
    } else {
      db.insert(folderMetadata)
        .values({ folderId, ...next })
        .onConflictDoUpdate({
          target: folderMetadata.folderId,
          set: next,
        })
        .run();
    }
    writeOrganizationBundle(db, libraryRoot());
    return { ok: true };
  });
}
