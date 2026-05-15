import { saves } from "@pond/schema/db";
import { count, isNotNull, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getDb } from "../db";
import { libraryRoot } from "../paths";

export async function libraryInfoHandler(c: Context) {
  const db = await getDb();
  const [total] = await db
    .select({ n: count() })
    .from(saves)
    .where(isNull(saves.archivedAt));
  const [archived] = await db
    .select({ n: count() })
    .from(saves)
    .where(isNotNull(saves.archivedAt));
  return c.json({
    status: "success",
    data: {
      path: libraryRoot(),
      name:
        libraryRoot()
          .split("/")
          .pop()
          ?.replace(/\.library$/, "") ?? "Library",
      counts: {
        active: Number(total?.n ?? 0),
        archived: Number(archived?.n ?? 0),
      },
    },
  });
}
