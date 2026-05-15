import type { Save } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";

export async function findExisting(
  payload: IngestPayload,
  dedupeByUrl: boolean,
): Promise<Save | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(saves)
    .where(
      and(
        eq(saves.source, payload.source),
        eq(saves.sourceId, payload.sourceId),
      ),
    )
    .limit(1);
  if (rows[0]) return rows[0];
  if (!dedupeByUrl) return null;
  const byUrl = await db
    .select()
    .from(saves)
    .where(eq(saves.url, payload.url))
    .limit(1);
  return byUrl[0] ?? null;
}
