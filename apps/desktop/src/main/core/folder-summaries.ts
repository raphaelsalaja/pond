import { folders, saveFolders, saves } from "@pond/schema/db";
import {
  and,
  count,
  countDistinct,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { FolderSummary } from "../../shared/folder-contracts";
import type { Db } from "../database/client";
import { getDb } from "../db";

export async function folderSummaries(
  parentId: string,
): Promise<FolderSummary[]> {
  return queryFolderSummaries(await getDb(), parentId);
}

export async function folderDownloadingCount(
  folderIds: string[],
): Promise<number> {
  return queryFolderDownloadingCount(await getDb(), folderIds);
}

/** Folder views only list complete saves, so this counts the members still on their way in. */
export async function queryFolderDownloadingCount(
  db: Db,
  folderIds: string[],
): Promise<number> {
  if (folderIds.length === 0) return 0;
  const [row] = await db
    .select({ value: countDistinct(saveFolders.saveId) })
    .from(saveFolders)
    .innerJoin(saves, eq(saveFolders.saveId, saves.id))
    .where(
      and(
        inArray(saveFolders.folderId, folderIds),
        isNull(saves.deletedAt),
        eq(saves.status, "ingesting"),
      ),
    );
  return row?.value ?? 0;
}

export async function queryFolderSummaries(
  db: Db,
  parentId: string,
): Promise<FolderSummary[]> {
  const children = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.parentId, parentId))
    .orderBy(folders.sortOrder, folders.name);
  const ids = children.map((folder) => folder.id);
  if (ids.length === 0) return [];

  const directCounts = (status: "complete" | "ingesting") =>
    db
      .select({
        id: saveFolders.folderId,
        value: count(saveFolders.saveId),
      })
      .from(saveFolders)
      .innerJoin(saves, eq(saveFolders.saveId, saves.id))
      .where(
        and(
          inArray(saveFolders.folderId, ids),
          isNull(saves.deletedAt),
          eq(saves.status, status),
        ),
      )
      .groupBy(saveFolders.folderId);
  const [saveCounts, downloadingCounts, childCounts, coversById] =
    await Promise.all([
      directCounts("complete"),
      directCounts("ingesting"),
      db
        .select({ id: folders.parentId, value: count(folders.id) })
        .from(folders)
        .where(inArray(folders.parentId, ids))
        .groupBy(folders.parentId),
      queryFolderPreviews(db, ids, 4),
    ]);

  const saveCountById = new Map(saveCounts.map((row) => [row.id, row.value]));
  const downloadingById = new Map(
    downloadingCounts.map((row) => [row.id, row.value]),
  );
  const childCountById = new Map(
    childCounts.flatMap((row) => (row.id ? [[row.id, row.value]] : [])),
  );

  return children.map((folder) => ({
    id: folder.id,
    directSaveCount: saveCountById.get(folder.id) ?? 0,
    downloadingCount: downloadingById.get(folder.id) ?? 0,
    childFolderCount: childCountById.get(folder.id) ?? 0,
    previewSaveIds: coversById[folder.id] ?? [],
  }));
}

export async function folderPreviews(
  folderIds: string[],
  limit: number,
): Promise<Record<string, string[]>> {
  return queryFolderPreviews(await getDb(), folderIds, limit);
}

/** The newest finished Saves in each folder or any of its subfolders, newest first. */
export async function queryFolderPreviews(
  db: Db,
  folderIds: string[],
  limit: number,
): Promise<Record<string, string[]>> {
  if (folderIds.length === 0) return {};
  const roots = sql.join(
    folderIds.map((id) => sql`${id}`),
    sql`,`,
  );
  const rows = z.array(z.object({ id: z.string(), saveId: z.string() })).parse(
    db.all(
      sql`with recursive folder_tree(root_id,folder_id) as (
          select id,id from folders where id in (${roots})
          union all
          select folder_tree.root_id,folders.id
          from folder_tree
          join folders on folders.parent_id=folder_tree.folder_id
        ),
        candidates(root_id,save_id,saved_at) as (
          select folder_tree.root_id,saves.id,saves.saved_at
          from folder_tree
          join save_folders on save_folders.folder_id=folder_tree.folder_id
          join saves on saves.id=save_folders.save_id
          where saves.deleted_at is null
            and saves.status='complete'
          group by folder_tree.root_id,saves.id,saves.saved_at
        ),
        ranked(root_id,save_id,rank) as (
          select root_id,save_id,row_number() over (
            partition by root_id order by saved_at desc,save_id desc
          )
          from candidates
        )
        select root_id as id,save_id as saveId
        from ranked
        where rank<=${limit}
        order by root_id,rank`,
    ),
  );
  const previews: Record<string, string[]> = {};
  for (const row of rows) {
    const ids = previews[row.id] ?? [];
    ids.push(row.saveId);
    previews[row.id] = ids;
  }
  return previews;
}
