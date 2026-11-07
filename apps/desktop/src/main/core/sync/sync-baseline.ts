import {
  type ConnectedAccount,
  type SourceSyncPrefs,
  saves,
} from "@pond/schema/db";
import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "../../db";
import { getAccountSync, patchAccountSync } from "./accounts";

export { patchAccountSync } from "./accounts";

const RECENT_KNOWN_WINDOW = 1500;

export interface SyncBaseline {
  knownIds: Set<string>;
  total: number;
  full: boolean;
}

export function syncBaselineWhere(
  account: Pick<ConnectedAccount, "id" | "source">,
) {
  if (account.source === "mymind")
    return and(eq(saves.accountId, account.id), isNull(saves.deletedAt));
  return and(
    eq(saves.source, account.source),
    or(eq(saves.accountId, account.id), isNull(saves.accountId)),
    isNull(saves.deletedAt),
  );
}

export async function loadAllKnownIds(
  account: Pick<ConnectedAccount, "id" | "source">,
): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(syncBaselineWhere(account));
  return new Set<string>(rows.map((r) => r.sourceId));
}

export async function loadSyncBaseline(
  account: ConnectedAccount,
  forceFull: boolean,
): Promise<SyncBaseline> {
  const db = await getDb();
  const cfg = await getAccountSync(account.id);
  const full = forceFull || cfg.lastFullSyncAt === null;
  if (full) {
    const knownIds = await loadAllKnownIds(account);
    return { knownIds, total: knownIds.size, full: true };
  }
  const rows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(syncBaselineWhere(account))
    .orderBy(desc(saves.savedAt))
    .limit(RECENT_KNOWN_WINDOW);
  const knownIds = new Set<string>(rows.map((r) => r.sourceId));
  const totalRow = await db
    .select({ c: count() })
    .from(saves)
    .where(syncBaselineWhere(account))
    .get();
  return { knownIds, total: totalRow?.c ?? knownIds.size, full: false };
}

export async function countSavesForAccount(
  account: Pick<ConnectedAccount, "id" | "source">,
): Promise<number> {
  const db = await getDb();
  const totalRow = await db
    .select({ c: count() })
    .from(saves)
    .where(syncBaselineWhere(account))
    .get();
  return totalRow?.c ?? 0;
}

export async function persistWatermark(
  accountId: string,
  opts: {
    full: boolean;
    newestId: string | null;
    total: number;
    resumeCursor?: string | null;
    collectionsChecked?: boolean;
  },
): Promise<string> {
  const lastSyncedAt = new Date().toISOString();
  const patch: Partial<SourceSyncPrefs> = {
    lastSyncedAt,
    lastError: null,
    knownCount: opts.total,
  };
  if (opts.resumeCursor !== undefined) patch.resumeCursor = opts.resumeCursor;
  if (opts.newestId) patch.highWaterMark = opts.newestId;
  if (opts.full) patch.lastFullSyncAt = lastSyncedAt;
  if (opts.collectionsChecked) patch.lastCollectionCheckAt = lastSyncedAt;
  await patchAccountSync(accountId, patch);
  return lastSyncedAt;
}
