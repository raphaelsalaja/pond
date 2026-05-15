import { saves } from "@pond/schema/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getDb } from "../db";

export async function itemGetHandler(c: Context) {
  const method = c.req.method;
  let params: Record<string, unknown> = {};
  if (method === "POST") {
    try {
      params = (await c.req.json()) as Record<string, unknown>;
    } catch {
      params = {};
    }
  } else {
    const url = new URL(c.req.url);
    params = Object.fromEntries(url.searchParams.entries());
  }

  const db = await getDb();
  const limit = Math.min(Number(params.limit ?? 200), 1000);
  const offset = Math.max(Number(params.offset ?? 0), 0);
  const includeArchived =
    params.includeArchived === "true" || params.includeArchived === true;
  const includeDeleted =
    params.includeDeleted === "true" || params.includeDeleted === true;

  const filters = [];
  if (!includeArchived) filters.push(isNull(saves.archivedAt));
  if (!includeDeleted) filters.push(isNull(saves.deletedAt));

  const ids = Array.isArray(params.ids)
    ? (params.ids as string[])
    : typeof params.ids === "string"
      ? (params.ids as string).split(",").filter(Boolean)
      : [];
  if (ids.length > 0) filters.push(inArray(saves.id, ids));

  const source = params.source as string | undefined;
  if (source)
    filters.push(
      eq(saves.source, source as unknown as typeof saves.$inferSelect.source),
    );

  const rows = await db
    .select()
    .from(saves)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(saves.savedAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    status: "success",
    data: rows,
    meta: { limit, offset, count: rows.length, hasMore: rows.length === limit },
  });
}
