import { MEDIA_TYPES, type MediaType, saves } from "@pond/schema/db";
import { FIELD_DESCRIPTORS, fileExtension } from "@pond/schema/filters/fields";
import { isAuxiliaryKind } from "@shared/save-file-names";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type {
  DuplicateStorageResult,
  FolderStorage,
  LargestFilesResult,
  LargestSavesResult,
  StorageAttributionResult,
  StorageOrder,
  StorageShare,
} from "../../shared/storage-insights";
import type { Db } from "../db";
import { duplicateGroups } from "./duplicate-groups";

export interface LargestSavesInput {
  limit: number;
  search?: string;
  mediaType?: MediaType;
  source?: string;
  minBytes?: number;
  order?: StorageOrder;
}

export interface LargestFilesInput {
  limit: number;
  search?: string;
  kind?: string;
  extension?: string;
  order?: StorageOrder;
}

const SHARE_LIMIT = 12;
const FOLDER_LIMIT = 24;
const EXTENSION_FACETS = 40;

const LIVE = sql`${saves.deletedAt} is null and ${saves.status} != 'skipped'`;
const FILE_PATH = sql`json_extract(file.value, '$.path')`;
const FILE_KIND = sql`coalesce(json_extract(file.value, '$.kind'), 'file')`;
const FILE_SIZE = sql`json_extract(file.value, '$.size')`;
const FILES = sql`${saves}, json_each(${saves.files}) as file`;
/** Sums each Save's own `files[].size`, since `file_size` can hold only the first file. */
const SAVE_BYTES = sql`(select sum(${FILE_SIZE}) from json_each(${saves.files}) as file where ${FILE_SIZE} > 0)`;

const ShareRows = z.array(
  z.object({ key: z.string(), bytes: z.number(), saves: z.number() }),
);

const FolderRows = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    bytes: z.number(),
    saves: z.number(),
  }),
);

const FileRows = z.array(
  z.object({
    saveId: z.string(),
    saveTitle: z.string().nullable(),
    saveUrl: z.string(),
    fileIndex: z.number(),
    path: z.string(),
    kind: z.string(),
    size: z.number(),
  }),
);

const KindRows = z.array(z.object({ kind: z.string() }));

const ExtensionRows = z.array(z.object({ extension: z.string() }));

const TotalRow = z.object({ bytes: z.number(), saves: z.number() });

const UnsizedRow = z.object({ files: z.number() });

function isMediaType(value: string | null): value is MediaType {
  return MEDIA_TYPES.some((type) => type === value);
}

/** Groups match the Library's own filter projections, so each row opens the Saves it counted. */
function filterProjection(id: "type" | "source"): SQL {
  const projection = FIELD_DESCRIPTORS[id].sqlProjection?.();
  if (!projection) throw new Error(`The ${id} filter has no SQL projection.`);
  return projection;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) || path;
}

/** Ranks Saves by their recorded file size, which can differ from bytes on disk; Trash is left out. */
export function largestSaves(
  db: Db,
  input: LargestSavesInput,
): LargestSavesResult {
  const sized = [
    isNull(saves.deletedAt),
    ne(saves.status, "skipped"),
    gt(saves.fileSize, 0),
  ];
  const filters: (SQL | undefined)[] = [...sized];
  const search = input.search?.trim().toLowerCase();
  if (search)
    filters.push(
      or(
        sql`instr(lower(coalesce(${saves.title}, '')), ${search}) > 0`,
        sql`instr(lower(${saves.url}), ${search}) > 0`,
      ),
    );
  if (input.mediaType) filters.push(eq(saves.mediaType, input.mediaType));
  if (input.source) filters.push(sql`${saves.source} = ${input.source}`);
  if (input.minBytes) filters.push(gte(saves.fileSize, input.minBytes));
  const rows = db
    .select({
      id: saves.id,
      title: saves.title,
      url: saves.url,
      source: saves.source,
      mediaType: saves.mediaType,
      files: saves.files,
      fileSize: saves.fileSize,
    })
    .from(saves)
    .where(and(...filters))
    .orderBy(
      input.order === "smallest" ? asc(saves.fileSize) : desc(saves.fileSize),
      asc(saves.id),
    )
    .limit(input.limit)
    .all();
  const facets = db
    .selectDistinct({ source: saves.source, mediaType: saves.mediaType })
    .from(saves)
    .where(and(...sized))
    .all();
  return {
    saves: rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      source: row.source,
      mediaType: row.mediaType,
      fileCount: row.files?.length ?? 0,
      fileSize: row.fileSize ?? 0,
    })),
    sources: [...new Set(facets.map((row) => row.source))].sort(),
    mediaTypes: [
      ...new Set(facets.map((row) => row.mediaType).filter(isMediaType)),
    ].sort(),
  };
}

/** Ranks single files across Saves; only the file name leaves main, never its path on disk. */
export function largestFiles(
  db: Db,
  input: LargestFilesInput,
): LargestFilesResult {
  const filters: SQL[] = [LIVE, sql`${FILE_SIZE} > 0`];
  const search = input.search?.trim().toLowerCase();
  if (search) filters.push(sql`instr(lower(${FILE_PATH}), ${search}) > 0`);
  if (input.kind) filters.push(sql`${FILE_KIND} = ${input.kind}`);
  if (input.extension)
    filters.push(sql`pond_file_extension(${FILE_PATH}) = ${input.extension}`);
  const direction = input.order === "smallest" ? sql`asc` : sql`desc`;
  const rows = FileRows.parse(
    db.all(
      sql`select ${saves.id} as saveId, ${saves.title} as saveTitle,
        ${saves.url} as saveUrl, file.key as fileIndex,
        coalesce(${FILE_PATH}, '') as path, ${FILE_KIND} as kind,
        ${FILE_SIZE} as size
      from ${FILES}
      where ${sql.join(filters, sql` and `)}
      order by size ${direction}, ${saves.id}, file.key
      limit ${input.limit}`,
    ),
  );
  const kinds = KindRows.parse(
    db.all(
      sql`select distinct ${FILE_KIND} as kind from ${FILES}
      where ${LIVE} and ${FILE_SIZE} > 0
      order by kind`,
    ),
  );
  const extensions = ExtensionRows.parse(
    db.all(
      sql`select pond_file_extension(${FILE_PATH}) as extension from ${FILES}
      where ${LIVE} and ${FILE_SIZE} > 0
        and pond_file_extension(${FILE_PATH}) is not null
      group by extension
      order by sum(${FILE_SIZE}) desc
      limit ${EXTENSION_FACETS}`,
    ),
  );
  return {
    files: rows.map((row) => ({
      saveId: row.saveId,
      saveTitle: row.saveTitle,
      saveUrl: row.saveUrl,
      fileIndex: row.fileIndex,
      name: fileName(row.path),
      kind: row.kind,
      extension: fileExtension(row.path),
      size: row.size,
    })),
    kinds: kinds.map((row) => row.kind),
    extensions: extensions.map((row) => row.extension),
  };
}

function shares(db: Db, key: SQL): StorageShare[] {
  return ShareRows.parse(
    db.all(
      sql`select ${key} as key, count(*) as saves, sum(${SAVE_BYTES}) as bytes
      from ${saves}
      where ${LIVE} and ${SAVE_BYTES} > 0 and coalesce(${key}, '') != ''
      group by key
      order by bytes desc
      limit ${SHARE_LIMIT}`,
    ),
  );
}

/** A Save in two folders counts toward both, but toward its top-level folder only once. */
function folderShares(db: Db): FolderStorage[] {
  return FolderRows.parse(
    db.all(
      sql`with recursive tree(root_id, folder_id) as (
        select id, id from folders
        where parent_id is null or parent_id not in (select id from folders)
        union
        select tree.root_id, folders.id
        from tree join folders on folders.parent_id = tree.folder_id
      ),
      members(root_id, save_id) as (
        select distinct tree.root_id, save_folders.save_id
        from tree join save_folders on save_folders.folder_id = tree.folder_id
      ),
      sized(id, bytes) as (
        select ${saves.id}, ${SAVE_BYTES} from ${saves} where ${LIVE}
      )
      select folders.id as id, folders.name as name,
        count(*) as saves, sum(sized.bytes) as bytes
      from members
      join sized on sized.id = members.save_id
      join folders on folders.id = members.root_id
      where sized.bytes > 0
      group by folders.id, folders.name
      order by bytes desc
      limit ${FOLDER_LIMIT}`,
    ),
  );
}

/** Splits the bytes Saves record for their files by type, source, extension, and top-level folder. */
export function storageAttribution(db: Db): StorageAttributionResult {
  const totals = TotalRow.parse(
    db.get(
      sql`select coalesce(sum(${FILE_SIZE}), 0) as bytes,
        count(distinct ${saves.id}) as saves
      from ${FILES}
      where ${LIVE} and ${FILE_SIZE} > 0`,
    ),
  );
  const unsized = UnsizedRow.parse(
    db.get(
      sql`select count(*) as files from ${FILES}
      where ${LIVE} and coalesce(${FILE_SIZE} > 0, 0) = 0`,
    ),
  );
  /** Grouped by position because `json_each` has its own `key` column, which shadows the alias. */
  const extensions = ShareRows.parse(
    db.all(
      sql`select pond_file_extension(${FILE_PATH}) as key,
        count(distinct ${saves.id}) as saves, sum(${FILE_SIZE}) as bytes
      from ${FILES}
      where ${LIVE} and ${FILE_SIZE} > 0
        and pond_file_extension(${FILE_PATH}) is not null
      group by 1
      order by bytes desc
      limit ${SHARE_LIMIT}`,
    ),
  );
  return {
    totalBytes: totals.bytes,
    saves: totals.saves,
    unsizedFiles: unsized.files,
    types: shares(db, filterProjection("type")),
    sources: shares(db, filterProjection("source")),
    extensions,
    folders: folderShares(db),
  };
}

/** Each Save keeps its own copy on disk, so every exact duplicate past the first is extra space. */
export function duplicateStorage(db: Db): DuplicateStorageResult {
  const rows = db
    .select({ id: saves.id, files: saves.files })
    .from(saves)
    .where(and(isNull(saves.deletedAt), ne(saves.status, "skipped")))
    .all();
  const filesById = new Map(rows.map((row) => [row.id, row.files ?? []]));
  const { groups } = duplicateGroups(
    [...filesById].map(([id, files]) => ({ id, files, phash: null })),
  );
  const exact = groups.filter((group) => group.kind === "exact");
  let extraBytes = 0;
  for (const group of exact) {
    const originals = (filesById.get(group.ids[0] ?? "") ?? []).filter(
      (file) => !isAuxiliaryKind(file.kind),
    );
    if (!originals.length || originals.some((file) => !(file.size > 0)))
      continue;
    const copy = originals.reduce((sum, file) => sum + file.size, 0);
    extraBytes += copy * (group.ids.length - 1);
  }
  const ids = exact.flatMap((group) => group.ids);
  return { groups: exact.length, saves: ids.length, extraBytes, ids };
}
