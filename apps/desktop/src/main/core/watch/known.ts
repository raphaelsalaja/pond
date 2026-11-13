import { deletedSourceIds, type Source } from "@pond/schema/db";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { enqueueCandidateKey } from "../pipeline/enqueue-input";
import type { WatchEntry } from "./types";

/** SQLite binds a limited number of variables in one statement. */
const SOURCE_ID_CHUNK = 400;

function chunk(ids: readonly string[], size: number): string[][] {
  const out: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    out.push(ids.slice(index, index + size));
  }
  return out;
}

/**
 * Emptying Trash deletes the Save row.
 * The Source ID stays in `deleted_source_ids`, so a later check must treat it as already seen.
 */
async function purgedSourceKeys(
  entries: readonly WatchEntry[],
  fallback: Source,
): Promise<Set<string>> {
  const idsBySource = new Map<Source, string[]>();
  for (const entry of entries) {
    const source = entry.source ?? fallback;
    const ids = idsBySource.get(source);
    if (ids) ids.push(entry.sourceId);
    else idsBySource.set(source, [entry.sourceId]);
  }
  const keys = new Set<string>();
  if (idsBySource.size === 0) return keys;

  const db = await getDb();
  for (const [source, ids] of idsBySource) {
    for (const group of chunk([...new Set(ids)], SOURCE_ID_CHUNK)) {
      const rows = await db
        .select({ sourceId: deletedSourceIds.sourceId })
        .from(deletedSourceIds)
        .where(
          and(
            eq(deletedSourceIds.source, source),
            inArray(deletedSourceIds.sourceId, group),
          ),
        );
      for (const row of rows) {
        keys.add(enqueueCandidateKey({ source, sourceId: row.sourceId }));
      }
    }
  }
  return keys;
}

/** Posts a Watch should queue. Rows still in the library, including Trash, are already known. */
export async function freshWatchEntries(input: {
  entries: readonly WatchEntry[];
  fallback: Source;
  present: ReadonlyArray<{ source: Source; sourceId: string }>;
}): Promise<WatchEntry[]> {
  const knownIds = new Set(
    input.present.map((row) => enqueueCandidateKey(row)),
  );
  for (const key of await purgedSourceKeys(input.entries, input.fallback)) {
    knownIds.add(key);
  }
  return input.entries.filter(
    (entry) =>
      !knownIds.has(
        enqueueCandidateKey({
          source: entry.source ?? input.fallback,
          sourceId: entry.sourceId,
        }),
      ),
  );
}
