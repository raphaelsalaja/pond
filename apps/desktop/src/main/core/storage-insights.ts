import { MEDIA_TYPES, type MediaType, saves } from "@pond/schema/db";
import { and, desc, eq, gt, isNull, type SQL, sql } from "drizzle-orm";
import type { LargestSave } from "../../shared/storage-insights";
import { getDb } from "../db";

export interface LargestSavesInput {
  limit: number;
  search?: string;
  mediaType?: MediaType;
  source?: string;
}

function isMediaType(value: string | null): value is MediaType {
  return MEDIA_TYPES.some((type) => type === value);
}

/** Ranks Saves by their recorded file size, which can differ from bytes on disk; Trash is left out. */
export async function largestSaves(input: LargestSavesInput): Promise<{
  saves: LargestSave[];
  sources: string[];
  mediaTypes: MediaType[];
}> {
  const db = await getDb();
  const sized = [isNull(saves.deletedAt), gt(saves.fileSize, 0)];
  const filters: SQL[] = [...sized];
  const search = input.search?.trim().toLowerCase();
  if (search)
    filters.push(
      sql`instr(lower(coalesce(${saves.title}, ${saves.url})), ${search}) > 0`,
    );
  if (input.mediaType) filters.push(eq(saves.mediaType, input.mediaType));
  if (input.source) filters.push(sql`${saves.source} = ${input.source}`);
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
    .orderBy(desc(saves.fileSize))
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
