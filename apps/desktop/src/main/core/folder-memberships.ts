import { saveFolders as saveFoldersTable } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import { getDb } from "../db";

export async function folderIdsForSave(saveId: string): Promise<Array<string>> {
  const db = await getDb();
  const rows = await db
    .select({ folderId: saveFoldersTable.folderId })
    .from(saveFoldersTable)
    .where(eq(saveFoldersTable.saveId, saveId));
  return rows.map((row) => row.folderId);
}
