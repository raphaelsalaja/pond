import { saves } from "@pond/schema/db";
import { buildWhere } from "@pond/schema/filters";
import { durationProjection } from "@pond/schema/filters/fields";
import {
  and,
  asc,
  count,
  desc,
  isNotNull,
  isNull,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type {
  LibraryQueryPage,
  LibraryQueryRequest,
} from "../../shared/library-query";
import type { Db } from "../db";
import { prepareManualOrder } from "../lib/folder-order";
import { PondError } from "../lib/pond-error";
import { compileKeywordWhere } from "./keyword-query";

export function librarySortColumn(
  key = "savedAt",
  options: { randomSeed?: string; orderKey?: string } = {},
): SQLWrapper {
  switch (key) {
    case "random":
      return sql`pond_order_key(${saves.id}, ${options.randomSeed ?? "pond"})`;
    case "manual":
      return sql`pond_manual_rank(${options.orderKey ?? ""}, ${saves.id})`;
    case "createdAt":
      return saves.createdAt;
    case "publishedAt":
      return saves.publishedAt;
    case "title":
      return sql`lower(coalesce(${saves.title}, ''))`;
    case "tagName":
      return sql`(select lower(value) from json_each(${saves.tags}) order by lower(value) limit 1)`;
    case "tagCount":
      return sql`json_array_length(${saves.tags})`;
    case "duration":
      return durationProjection();
    case "fileSize":
      return saves.fileSize;
    case "rating":
      return saves.rating;
    case "fileCount":
      return sql`json_array_length(${saves.files})`;
    case "width":
      return saves.width;
    case "height":
      return saves.height;
    case "dimensions":
      return sql`cast(${saves.width} as real) * ${saves.height}`;
    case "aspectRatio":
      return sql`cast(${saves.width} as real) / nullif(${saves.height}, 0)`;
    case "creator":
      return sql`lower(coalesce(${saves.author}, ''))`;
    case "source":
      return sql`lower(${saves.source})`;
    case "type":
      return sql`lower(coalesce(${saves.mediaType}, ''))`;
    default:
      return saves.savedAt;
  }
}

export function libraryQueryWhere(
  request: LibraryQueryRequest,
  hiddenFolderIds: readonly string[] = [],
) {
  const scope = request.scope ?? {};
  return and(
    scope.deletedOnly ? isNotNull(saves.deletedAt) : isNull(saves.deletedAt),
    scope.deletedOnly ? undefined : sql`${saves.status} = 'complete'`,
    buildWhere(request.query),
    request.keywords?.trim()
      ? compileKeywordWhere(request.keywords, "all", request.keywordScopes)
      : undefined,
    scope.source
      ? sql`lower(${saves.source}) = ${scope.source.toLowerCase()}`
      : undefined,
    scope.untagged ? sql`json_array_length(${saves.tags}) = 0` : undefined,
    scope.folderIds
      ? sql`exists (select 1 from save_folders sf where sf.save_id = ${saves.id} and sf.folder_id in (select value from json_each(${JSON.stringify(scope.folderIds)})))`
      : undefined,
    scope.uncategorized
      ? sql`not exists (select 1 from save_folders sf where sf.save_id = ${saves.id})`
      : undefined,
    scope.tag
      ? sql`exists (select 1 from json_each(${saves.tags}) where lower(value) = ${scope.tag.toLowerCase()})`
      : undefined,
    scope.saveIds
      ? sql`${saves.id} in (select value from json_each(${JSON.stringify(scope.saveIds)}))`
      : undefined,
    scope.savedSince !== undefined
      ? sql`${saves.savedAt} >= ${scope.savedSince}`
      : undefined,
    hiddenFolderIds.length > 0
      ? sql`not exists (select 1 from save_folders locked_sf where locked_sf.save_id = ${saves.id} and locked_sf.folder_id in (select value from json_each(${JSON.stringify(hiddenFolderIds)})))`
      : undefined,
  );
}

const UNPINNED_RANK = 1_000_000_000;

function queryOrder(
  request: LibraryQueryRequest,
  manualOrder: readonly string[],
  pinnedIds: readonly string[] = [],
) {
  const orderKey =
    request.sortKey === "manual" ? prepareManualOrder(manualOrder) : "";
  const pinKey = JSON.stringify(pinnedIds);
  const column = librarySortColumn(request.sortKey, {
    randomSeed: request.randomSeed,
    orderKey,
  });
  // savedAt is non-null; leave nullable, manual, random and pinned sorts general.
  const unpinnedRecency =
    pinnedIds.length === 0 &&
    (request.sortKey === undefined || request.sortKey === "savedAt");
  const pinRank = unpinnedRecency
    ? sql`${UNPINNED_RANK}`
    : sql`coalesce((select cast(key as integer) from json_each(${pinKey}) where value = ${saves.id} limit 1), ${UNPINNED_RANK})`;
  const direction = request.sortDir === "asc" ? asc(column) : desc(column);
  return {
    column,
    pinRank,
    unpinnedRecency,
    orderBy: unpinnedRecency
      ? [direction, desc(saves.id)]
      : [asc(pinRank), asc(sql`${column} is null`), direction, desc(saves.id)],
    signature: `${request.sortKey}:${request.sortDir}:${request.randomSeed ?? "pond"}:${orderKey}:${pinKey}`,
  };
}

const Revision = z.object({ revision: z.number() });
function revisionOf(db: Db): number {
  return Revision.parse(
    db.$raw.prepare("select total_changes() as revision").get(),
  ).revision;
}

interface LibraryPageRow {
  id: string;
  value: string | number | null;
  rank: number;
}

function assertLibrary(request: LibraryQueryRequest, libraryId: string): void {
  if (request.libraryId && request.libraryId !== libraryId)
    throw new PondError(
      "library_mismatch",
      "The active Library changed. Run the search again.",
    );
}

export async function queryLibraryPage(
  db: Db,
  libraryId: string,
  request: LibraryQueryRequest,
  manualOrder: readonly string[] = [],
  pinnedIds: readonly string[] = [],
  hiddenFolderIds: readonly string[] = [],
): Promise<LibraryQueryPage> {
  assertLibrary(request, libraryId);
  const { column, pinRank, signature, orderBy, unpinnedRecency } = queryOrder(
    request,
    manualOrder,
    pinnedIds,
  );
  const revision = revisionOf(db);
  const cursor = request.cursor;
  if (cursor && cursor.libraryId !== libraryId)
    throw new PondError(
      "library_mismatch",
      "This cursor belongs to another Library. Run the search again.",
    );
  if (cursor && cursor.sortSignature !== signature)
    throw new PondError(
      "stale_cursor",
      "The sort order changed. Run the search again.",
    );
  const ascending = request.sortDir === "asc";
  const where = libraryQueryWhere(request, hiddenFolderIds);
  const rank = cursor?.rank ?? UNPINNED_RANK;
  const fastCursor =
    unpinnedRecency && rank === UNPINNED_RANK && cursor?.value != null;
  const within = !cursor
    ? undefined
    : fastCursor
      ? ascending
        ? sql`(${column} > ${cursor.value} or (${column} = ${cursor.value} and ${saves.id} < ${cursor.id}))`
        : sql`(${column}, ${saves.id}) < (${cursor.value}, ${cursor.id})`
      : cursor.value === null
        ? and(isNull(column), sql`${saves.id} < ${cursor.id}`)
        : sql`(${column} is null or ${ascending ? sql`${column} > ${cursor.value}` : sql`${column} < ${cursor.value}`} or (${column} = ${cursor.value} and ${saves.id} < ${cursor.id}))`;
  const after = fastCursor
    ? within
    : within
      ? sql`(${pinRank} > ${rank} or (${pinRank} = ${rank} and ${within}))`
      : undefined;
  const limit = Math.min(500, Math.max(1, request.limit ?? 250));
  const result: { total: number; rows: LibraryPageRow[] } = db.$raw.transaction(
    () => {
      const total =
        db.select({ count: count() }).from(saves).where(where).get()?.count ??
        0;
      const rows = db
        .select({
          id: saves.id,
          value: sql<string | number | null>`${column}`,
          rank: sql<number>`${pinRank}`,
        })
        .from(saves)
        .where(and(where, after))
        .orderBy(...orderBy)
        .limit(limit + 1)
        .all();
      return { total, rows };
    },
  )();
  const page = result.rows.slice(0, limit);
  const last = page.at(-1);
  return {
    ids: page.map((row) => row.id),
    total: result.total,
    revision,
    libraryId,
    nextCursor:
      result.rows.length > limit && last
        ? {
            value: last.value,
            id: last.id,
            ...(last.rank !== UNPINNED_RANK && { rank: last.rank }),
            libraryId,
            sortSignature: signature,
          }
        : null,
  };
}

export async function queryLibraryIds(
  db: Db,
  libraryId: string,
  request: LibraryQueryRequest,
  manualOrder: readonly string[] = [],
  pinnedIds: readonly string[] = [],
  hiddenFolderIds: readonly string[] = [],
) {
  assertLibrary(request, libraryId);
  const { orderBy } = queryOrder(request, manualOrder, pinnedIds);
  const rows = await db
    .select({ id: saves.id })
    .from(saves)
    .where(libraryQueryWhere(request, hiddenFolderIds))
    .orderBy(...orderBy);
  return {
    ids: rows.map((row) => row.id),
    libraryId,
    revision: revisionOf(db),
  };
}
