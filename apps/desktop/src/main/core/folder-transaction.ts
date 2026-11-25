import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { folders, saveFolders, saves } from "@pond/schema/db";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { StoredInfoDocSchema } from "../lib/library-format";
import { saveDir } from "../paths";

export async function writeFolderMemberships(
  saveId: string,
  folderIds: ReadonlyArray<string>,
  directory = saveDir(saveId),
): Promise<void> {
  const path = join(directory, "info.json");
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    /** Filing can race enqueue, and a missing sidecar is not a gone pin. */
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  const info = StoredInfoDocSchema.parse(JSON.parse(raw));
  info.folderIds = [...new Set(folderIds)];
  await writeFile(path, JSON.stringify(info, null, 2));
}

export function replaceFolderMemberships(
  db: Db,
  saveId: string,
  folderIds: ReadonlyArray<string>,
): void {
  const unique = [...new Set(folderIds)];
  if (
    !db.select({ id: saves.id }).from(saves).where(eq(saves.id, saveId)).get()
  ) {
    throw new Error("The Save no longer exists.");
  }
  const valid = unique.length
    ? db
        .select({ id: folders.id })
        .from(folders)
        .where(inArray(folders.id, unique))
        .all()
    : [];
  if (valid.length !== unique.length) {
    throw new Error("A destination folder no longer exists.");
  }
  db.delete(saveFolders).where(eq(saveFolders.saveId, saveId)).run();
  if (unique.length) {
    db.insert(saveFolders)
      .values(unique.map((folderId) => ({ saveId, folderId })))
      .run();
  }
}
