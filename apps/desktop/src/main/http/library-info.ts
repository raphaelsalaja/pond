import { saves } from "@pond/schema/db";
import { count, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getDb } from "../db";
import { libraryRoot } from "../paths";

export async function libraryInfoHandler(c: Context) {
  const db = await getDb();
  const [total] = await db
    .select({ n: count() })
    .from(saves)
    .where(isNull(saves.deletedAt));
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
      },
    },
  });
}
