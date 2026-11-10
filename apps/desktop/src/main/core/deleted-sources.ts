import {
  type ConnectedAccount,
  type SaveStatus,
  type Source,
  saves,
} from "@pond/schema/db";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

/**
 * These purges remove a row so a later fetch can import it again.
 * A Save the user deleted is not one of them.
 */
const RELEASED_DELETES = new Set([
  "sync:import-filter:release",
  "split-save:rollback",
  "eagle-package-rollback",
]);

interface DeletedSourceSave {
  source: Source;
  sourceId: string;
  status?: SaveStatus | null;
  deletedAt?: Date | null;
  rawJson?: {
    importFilter?: string | null;
    split?: { sourceId?: string | null } | null;
  } | null;
}

export function remembersDeletedSource(
  save: Pick<DeletedSourceSave, "status" | "deletedAt" | "rawJson">,
  reason: string | null | undefined,
): boolean {
  if (reason && RELEASED_DELETES.has(reason)) return false;
  if (
    save.deletedAt == null &&
    save.status === "skipped" &&
    save.rawJson?.importFilter
  ) {
    return false;
  }
  return true;
}

/** The save's own Source ID, plus the post id a split slide still answers to. */
export function deletedSourceKeys(
  save: Pick<DeletedSourceSave, "source" | "sourceId" | "rawJson">,
): Array<{ source: Source; sourceId: string }> {
  const keys = [{ source: save.source, sourceId: save.sourceId }];
  const postId = save.rawJson?.split?.sourceId;
  if (postId && postId !== save.sourceId) {
    keys.push({ source: save.source, sourceId: postId });
  }
  return keys;
}

/**
 * Automatic fetching already knows dismissed ids.
 * An explicit full walk (`forceFull`, Fetch Older Saves) keeps the live set.
 */
export function knownIdsForFetch(input: {
  forceFull: boolean;
  liveIds: ReadonlySet<string>;
  dismissedIds: ReadonlySet<string>;
}): Set<string> {
  if (input.forceFull) return new Set(input.liveIds);
  const ids = new Set(input.liveIds);
  for (const id of input.dismissedIds) ids.add(id);
  return ids;
}

/** Trashed rows stay in the library, but the live baseline leaves them out. */
export function trashedBaselineWhere(
  account: Pick<ConnectedAccount, "id" | "source">,
) {
  if (account.source === "mymind") {
    return and(eq(saves.accountId, account.id), isNotNull(saves.deletedAt));
  }
  return and(
    eq(saves.source, account.source),
    or(eq(saves.accountId, account.id), isNull(saves.accountId)),
    isNotNull(saves.deletedAt),
  );
}
