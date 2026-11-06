import type { ApiLibraryInfo } from "@pond/schema/api";
import { saves, tasks } from "@pond/schema/db";
import { inArray, sql } from "drizzle-orm";
import { activeLibraryId } from "../core/active-library-query";
import { readLibraryIdentity } from "../core/library-identity";
import { getDb } from "../db";
import { libraryRoot } from "../paths";
import { resolveTheme } from "../theme";

export interface LibraryInfo extends ApiLibraryInfo {
  theme: Awaited<ReturnType<typeof resolveTheme>>;
}

export async function libraryInfo(): Promise<LibraryInfo> {
  const db = await getDb();
  const [counts] = await db
    .select({
      active: sql<number>`coalesce(sum(${saves.deletedAt} is null and ${saves.status} != 'skipped'), 0)`,
      trashed: sql<number>`coalesce(sum(${saves.deletedAt} is not null), 0)`,
      ingesting: sql<number>`coalesce(sum(${saves.deletedAt} is null and ${saves.status} = 'ingesting'), 0)`,
      failed: sql<number>`coalesce(sum(${saves.deletedAt} is null and ${saves.status} = 'failed'), 0)`,
    })
    .from(saves);
  const [queue] = await db
    .select({
      pending: sql<number>`coalesce(sum(${tasks.status} in ('pending', 'deferred')), 0)`,
      running: sql<number>`coalesce(sum(${tasks.status} = 'running'), 0)`,
    })
    .from(tasks)
    .where(inArray(tasks.status, ["pending", "deferred", "running"]));
  return {
    libraryId: activeLibraryId(),
    path: libraryRoot(),
    name: (await readLibraryIdentity(libraryRoot())).name,
    counts: {
      active: Number(counts?.active ?? 0),
      trashed: Number(counts?.trashed ?? 0),
      ingesting: Number(counts?.ingesting ?? 0),
      failed: Number(counts?.failed ?? 0),
    },
    queue: {
      pending: Number(queue?.pending ?? 0),
      running: Number(queue?.running ?? 0),
    },
    theme: await resolveTheme(),
  };
}
