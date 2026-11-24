import type {
  ApiFolder,
  ApiSearchRequest,
  ApiSource,
  ApiTag,
  ApiView,
} from "@pond/schema/api";
import { folders, saveFolders, saves, tags } from "@pond/schema/db";
import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";
import {
  libraryRetrievalInput,
  retrieveLibrary,
} from "../core/library-retrieval";
import { listViews } from "../core/saved-views";
import { requireLibrary } from "./api-runtime";
import type { ApiRuntime } from "./api-runtime";
import { apiSavesByIds } from "./api-saves";

const live = and(isNull(saves.deletedAt), ne(saves.status, "skipped"));

export async function libraryTags(runtime: ApiRuntime): Promise<Array<ApiTag>> {
  const db = await runtime.getDb();
  const used = await db
    .select({ name: sql<string>`value`, count: count() })
    .from(sql`${saves}, json_each(${saves.tags})`)
    .where(live)
    .groupBy(sql`value`);
  const registry = await db
    .select({ name: tags.name, starred: tags.starred })
    .from(tags)
    .where(eq(tags.archived, false));
  const counts = new Map(used.map((row) => [row.name, row.count]));
  const starred = new Map(registry.map((row) => [row.name, row.starred]));
  const names = new Set([...counts.keys(), ...starred.keys()]);
  return [...names]
    .map((name) => ({
      name,
      count: counts.get(name) ?? 0,
      starred: starred.get(name) ?? false,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function libraryFolders(
  runtime: ApiRuntime,
): Promise<Array<ApiFolder>> {
  const db = await runtime.getDb();
  const counts = await db
    .select({ folderId: saveFolders.folderId, count: count() })
    .from(saveFolders)
    .innerJoin(saves, eq(saves.id, saveFolders.saveId))
    .where(live)
    .groupBy(saveFolders.folderId);
  const byId = new Map(counts.map((row) => [row.folderId, row.count]));
  const rows = await db
    .select()
    .from(folders)
    .orderBy(asc(folders.sortOrder), asc(folders.name));
  return rows.map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    color: folder.color,
    count: byId.get(folder.id) ?? 0,
  }));
}

export async function libraryViews(): Promise<Array<ApiView>> {
  return (await listViews()).map((view) => ({
    id: view.id,
    name: view.name,
    kind: view.kind,
    parentId: view.parentId,
    query: view.query,
    sortKey: view.sortKey,
    sortDir: view.sortDir === "asc" ? "asc" : "desc",
  }));
}

export async function librarySources(
  runtime: ApiRuntime,
): Promise<Array<ApiSource>> {
  const rows = await (
    await runtime.getDb()
  )
    .select({ source: saves.source, count: count() })
    .from(saves)
    .where(live)
    .groupBy(saves.source);
  return rows.sort((a, b) => b.count - a.count);
}

export async function searchSaves(
  runtime: ApiRuntime,
  request: ApiSearchRequest,
) {
  const libraryId = requireLibrary(runtime, request.libraryId);
  const input = libraryRetrievalInput.parse({
    query: request.query,
    source: request.source,
    folderId: request.folderId,
    media: request.kinds,
    limit: request.limit ?? 20,
  });
  const { hits } = await retrieveLibrary(input);
  return {
    libraryId,
    saves: await apiSavesByIds(
      runtime,
      hits.map((hit) => hit.id),
    ),
  };
}
