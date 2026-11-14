import type { ApiSave } from "@pond/schema/api";
import { saveFolders, saves } from "@pond/schema/db";
import { durationProjection } from "@pond/schema/filters/fields";
import { pickCardFile } from "@shared/save-file-names";
import {
  and,
  desc,
  inArray,
  isNull,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import { PondError } from "../lib/pond-error";
import type { ApiRuntime } from "./api-runtime";

function present(column: SQLWrapper) {
  return sql<number>`(${column} is not null and ${column} != '')`;
}

const COLUMNS = {
  id: saves.id,
  source: saves.source,
  url: saves.url,
  title: saves.title,
  description: saves.description,
  author: saves.author,
  siteName: saves.siteName,
  tags: saves.tags,
  notes: saves.notes,
  rating: saves.rating,
  favorite: saves.favorite,
  mediaType: saves.mediaType,
  status: saves.status,
  savedAt: saves.savedAt,
  publishedAt: saves.publishedAt,
  deletedAt: saves.deletedAt,
  files: saves.files,
  width: saves.width,
  height: saves.height,
  fileSize: saves.fileSize,
  duration: sql<number | null>`${durationProjection()}`,
  caption: present(saves.caption),
  ocr: present(saves.ocrText),
  transcript: present(saves.transcript),
};

interface Selection {
  where?: SQL;
  limit?: number;
  offset?: number;
}

async function folderMap(runtime: ApiRuntime, ids: readonly string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const rows = await (await runtime.getDb())
    .select({ saveId: saveFolders.saveId, folderId: saveFolders.folderId })
    .from(saveFolders)
    .where(inArray(saveFolders.saveId, [...ids]));
  for (const row of rows) {
    map.set(row.saveId, [...(map.get(row.saveId) ?? []), row.folderId]);
  }
  return map;
}

export async function selectApiSaves(
  runtime: ApiRuntime,
  selection: Selection,
): Promise<ApiSave[]> {
  const db = await runtime.getDb();
  const base = db
    .select(COLUMNS)
    .from(saves)
    .where(selection.where)
    .orderBy(desc(saves.savedAt), desc(saves.id));
  const rows = await (selection.limit === undefined
    ? base
    : base.limit(selection.limit).offset(selection.offset ?? 0));
  const folders = await folderMap(
    runtime,
    rows.map((row) => row.id),
  );
  const libraryId = runtime.libraryId();
  return rows.map((row) => ({
    id: row.id,
    libraryId,
    source: row.source,
    url: row.url,
    title: row.title,
    description: row.description,
    author: row.author,
    siteName: row.siteName,
    tags: row.tags,
    folderIds: folders.get(row.id) ?? [],
    note: row.notes,
    rating: row.rating,
    favorite: row.favorite,
    kind: row.mediaType,
    status: row.status,
    savedAt: row.savedAt.getTime(),
    publishedAt: row.publishedAt?.getTime() ?? null,
    deletedAt: row.deletedAt?.getTime() ?? null,
    media: {
      files: row.files.length,
      width: row.width,
      height: row.height,
      duration: row.duration,
      bytes: row.fileSize,
    },
    thumbnail: pickCardFile(row.files) !== null,
    text: {
      caption: Boolean(row.caption),
      ocr: Boolean(row.ocr),
      transcript: Boolean(row.transcript),
    },
  }));
}

/** Hydrates saves in the order of `ids`, skipping ones that no longer exist. */
export async function apiSavesByIds(
  runtime: ApiRuntime,
  ids: readonly string[],
  options: { includeDeleted?: boolean } = {},
): Promise<ApiSave[]> {
  if (!ids.length) return [];
  const rows = await selectApiSaves(runtime, {
    where: and(
      inArray(saves.id, [...ids]),
      options.includeDeleted ? undefined : isNull(saves.deletedAt),
    ),
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Throws `save_not_found` naming every id that doesn't exist. */
export async function requireSaves(
  runtime: ApiRuntime,
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  const rows = await (await runtime.getDb())
    .select({ id: saves.id })
    .from(saves)
    .where(inArray(saves.id, unique));
  const found = new Set(rows.map((row) => row.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length)
    throw new PondError(
      "save_not_found",
      `No Save has the id ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.`,
    );
}
