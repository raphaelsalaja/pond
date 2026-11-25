import { saves, tags } from "@pond/schema/db";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { listViews } from "../../saved-views";

const live = and(isNull(saves.deletedAt), ne(saves.status, "skipped"));

export async function saveCards(ids: ReadonlyArray<string>) {
  const db = await getDb();
  const rows = await db
    .select({
      id: saves.id,
      title: saves.title,
      url: saves.url,
      author: saves.author,
      source: saves.source,
      mediaType: saves.mediaType,
      savedAt: saves.savedAt,
      files: saves.files,
    })
    .from(saves)
    .where(and(inArray(saves.id, [...ids]), isNull(saves.deletedAt)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

export async function listTags(limit: number) {
  const db = await getDb();
  const used = await db
    .select({ name: sql<string>`value`, count: count() })
    .from(sql`${saves}, json_each(${saves.tags})`)
    .where(live)
    .groupBy(sql`value`);
  const starred = new Set(
    (
      await db
        .select({ name: tags.name })
        .from(tags)
        .where(and(eq(tags.archived, false), eq(tags.starred, true)))
    ).map((row) => row.name),
  );
  const sorted = used
    .map((row) => ({
      name: row.name,
      count: row.count,
      starred: starred.has(row.name),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { tags: sorted.slice(0, limit), total: sorted.length };
}

export async function listSavedViews() {
  const views = await listViews();
  return {
    views: views.map((view) => ({
      id: view.id,
      name: view.name,
      kind: view.kind,
      parentId: view.parentId,
      query: view.query,
    })),
  };
}
