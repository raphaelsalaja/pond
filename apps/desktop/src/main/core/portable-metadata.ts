import { existsSync } from "node:fs";
import { writeOrganizationBundle } from "./organization-bundle";
export async function flushPortableMetadata(): Promise<void> {
  const { getDb } = await import("../db");
  const { libraryRoot, saveFile } = await import("../paths");
  const { saves } = await import("@pond/schema/db");
  const { and, asc, gt, isNull } = await import("drizzle-orm");
  const { readFile } = await import("node:fs/promises");
  const { StoredInfoDocSchema } = await import("../lib/library-format");
  const { writeSaveInfo } = await import("../lib/library");
  const db = await getDb();
  const root = libraryRoot();
  writeOrganizationBundle(db, root);
  let cursor = "";
  while (true) {
    if (libraryRoot() !== root) {
      throw new Error("The library changed while preparing its metadata.");
    }
    const rows = await db
      .select()
      .from(saves)
      .where(and(gt(saves.id, cursor), isNull(saves.deletedAt)))
      .orderBy(asc(saves.id))
      .limit(250);
    if (!rows.length) {
      return;
    }
    for (const row of rows) {
      const path = saveFile(row.id, "info.json");
      if (!existsSync(path)) {
        continue;
      }
      const info = StoredInfoDocSchema.parse(
        JSON.parse(await readFile(path, "utf8")),
      );
      if (!info.userData) {
        await writeSaveInfo(row);
      }
    }
    cursor = rows.at(-1)?.id ?? cursor;
  }
}
