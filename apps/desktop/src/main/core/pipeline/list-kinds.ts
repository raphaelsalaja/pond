import { type ListKind, type Source, saves } from "@pond/schema/db";
import {
  listKindsEqual,
  mergeListKinds,
  normalizeListKinds,
} from "@pond/schema/list-kinds";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import { releaseListFilteredSaves } from "./import-filter";

const EXPLICIT_SAVED = new Set([
  "toolbar",
  "action",
  "context-menu",
  "user:quickAdd",
]);

export function listKindsFromTrigger(trigger: string | undefined): ListKind[] {
  if (!trigger) return [];
  if (EXPLICIT_SAVED.has(trigger)) return ["saved"];
  const suffix = trigger.includes(":")
    ? trigger.slice(trigger.lastIndexOf(":") + 1)
    : trigger;
  if (suffix === "like" || suffix === "upvote") return ["liked"];
  if (
    suffix === "save" ||
    suffix === "bookmark" ||
    suffix === "favorite" ||
    suffix === "star" ||
    suffix === "graphql-save"
  ) {
    return ["saved"];
  }
  return [];
}

/** A slide split from a post answers to the post's Source ID, which is what a list walk reports. */
const postSourceId = sql<string>`coalesce(json_extract(${saves.rawSlim}, '$.split.sourceId'), ${saves.sourceId})`;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, size + i));
  return out;
}

/** Returns the source ids of list-filtered saves found on another list; they're purged so the run queues them as new. */
export async function mergeListKindsOntoExisting(
  source: Source,
  entries: ReadonlyArray<{ sourceId: string; listKinds?: ListKind[] }>,
): Promise<Set<string>> {
  const relisted = new Set<string>();
  const incoming = new Map<string, ListKind[]>();
  for (const entry of entries) {
    const next = normalizeListKinds(entry.listKinds);
    if (next.length === 0) continue;
    incoming.set(
      entry.sourceId,
      mergeListKinds(incoming.get(entry.sourceId), next),
    );
  }
  if (incoming.size === 0) return relisted;

  const db = await getDb();
  const released: string[] = [];
  for (const idChunk of chunk([...incoming.keys()], 400)) {
    const rows = db
      .select({
        id: saves.id,
        postId: postSourceId,
        listKinds: saves.listKinds,
        status: saves.status,
        importFilter: sql<
          string | null
        >`json_extract(${saves.rawJson}, '$.importFilter')`,
      })
      .from(saves)
      .where(
        and(
          eq(saves.source, source),
          or(
            inArray(saves.sourceId, idChunk),
            inArray(
              sql`json_extract(${saves.rawSlim}, '$.split.sourceId')`,
              idChunk,
            ),
          ),
        ),
      )
      .all();
    for (const row of rows) {
      const extra = incoming.get(row.postId);
      if (!extra) continue;
      const merged = mergeListKinds(row.listKinds, extra);
      if (listKindsEqual(row.listKinds, merged)) continue;
      if (row.status === "skipped" && row.importFilter === "list") {
        released.push(row.id);
        relisted.add(row.postId);
        continue;
      }
      await persistSave(
        row.id,
        { listKinds: merged },
        { actorReason: "pipeline:list-kinds" },
      );
    }
  }
  await releaseListFilteredSaves(released);
  return relisted;
}

/** Takes the list label off saves a complete walk no longer found; the saves themselves stay in the library. */
export async function dropMissingListKind(
  account: { id: string; source: Source },
  kind: ListKind,
  presentIds: ReadonlySet<string>,
): Promise<number> {
  const db = await getDb();
  const rows = db
    .select({
      id: saves.id,
      postId: postSourceId,
      listKinds: saves.listKinds,
    })
    .from(saves)
    .where(
      and(
        eq(saves.source, account.source),
        or(eq(saves.accountId, account.id), isNull(saves.accountId)),
      ),
    )
    .all();
  let dropped = 0;
  for (const row of rows) {
    if (presentIds.has(row.postId) || !row.listKinds.includes(kind)) continue;
    await persistSave(
      row.id,
      { listKinds: row.listKinds.filter((k) => k !== kind) },
      { actorReason: "pipeline:list-kinds" },
    );
    dropped += 1;
  }
  return dropped;
}
