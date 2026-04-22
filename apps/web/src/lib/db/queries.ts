import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { saves, type Source } from "@pond/schema/db";
import { db } from "./client";

export interface SearchSavesArgs {
  source?: Source | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export async function searchSaves({
  source,
  q,
  limit = 60,
  offset = 0,
}: SearchSavesArgs) {
  const wheres = [] as ReturnType<typeof eq>[];
  if (source) wheres.push(eq(saves.source, source));
  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    wheres.push(
      or(
        ilike(saves.title, term),
        ilike(saves.description, term),
        ilike(saves.author, term),
        sql`${saves.tags} && ARRAY[${q.trim()}]::text[]`,
      )!,
    );
  }

  const where = wheres.length ? and(...wheres) : undefined;

  return db
    .select()
    .from(saves)
    .where(where)
    .orderBy(desc(saves.savedAt))
    .limit(limit)
    .offset(offset);
}

export async function countBySource() {
  const rows = await db
    .select({
      source: saves.source,
      count: sql<number>`count(*)::int`,
    })
    .from(saves)
    .groupBy(saves.source);
  return rows;
}

export async function getSave(id: string) {
  const [row] = await db.select().from(saves).where(eq(saves.id, id)).limit(1);
  return row ?? null;
}
