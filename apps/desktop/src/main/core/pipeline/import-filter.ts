import { saves, tasks } from "@pond/schema/db";
import type { ImportScope, Save } from "@pond/schema/db";
import { majorityMediaType } from "@pond/schema/media-type";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import type { Transaction } from "@pond/schema/tx";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import {
  accountImportScope,
  importFilterReason,
  listFilterReason,
} from "../../../shared/import-scope";
import type { ImportFilterReason } from "../../../shared/import-scope";
import { getDb } from "../../db";
import { executeBatch } from "../executor";
import { persistSave } from "../persist-save";
import { getAccount } from "../sync/accounts";

/** Skips a save its Account's scope filters out. Only a sync's first pass is checked, so a manual refresh keeps the save. */
export function applyImportFilter(save: Save): Promise<boolean> {
  return skipFiltered(save, (scope) =>
    importFilterReason(scope, capturedTraits(save)),
  );
}

/** Skips a save from a list the scope leaves out before its capture waits on a rate-limited lookup. */
export function applyListFilter(save: Save): Promise<boolean> {
  return skipFiltered(save, (scope) => listFilterReason(scope, save.listKinds));
}

async function skipFiltered(
  save: Save,
  reasonFor: (scope: ImportScope | undefined) => ImportFilterReason | null,
): Promise<boolean> {
  if (!save.accountId || save.status !== "ingesting") {
    return false;
  }
  const account = await getAccount(save.accountId);
  if (!account) {
    return false;
  }
  const reason = reasonFor(accountImportScope(account.source, account.sync));
  if (!reason) {
    return false;
  }
  await persistSave(
    save.id,
    {
      status: "skipped",
      rawJson: save.rawJson
        ? { ...save.rawJson, importFilter: reason }
        : storedAsRawJson({ importFilter: reason }),
    },
    { actorReason: `sync:import-filter:${reason}` },
  );
  const db = await getDb();
  db.update(tasks)
    .set({
      status: "cancelled",
      lastError: "skipped by import filter",
      cancellationFence: sql`${tasks.cancellationFence} + 1`,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.saveId, save.id),
        inArray(tasks.status, ["pending", "deferred", "blocked"]),
      ),
    )
    .run();
  log.info("[pond pipeline:import-filter] skipped", {
    saveId: save.id,
    reason,
  });
  return true;
}

/** Reads media and date from the capture, since a seeded save's columns can lag behind it. */
export function capturedTraits(
  save: Pick<Save, "listKinds" | "mediaType" | "publishedAt" | "rawJson">,
) {
  const capture = save.rawJson?.capture;
  if (!capture) {
    return {
      listKinds: save.listKinds,
      mediaType: save.mediaType,
      publishedAt: save.publishedAt,
    };
  }
  const published = capture.publishedAt
    ? Date.parse(capture.publishedAt)
    : Number.NaN;
  return {
    listKinds: save.listKinds,
    mediaType: majorityMediaType(
      capture.media.flatMap((m) => (m.type === "link" ? [] : [m.type])),
    ),
    publishedAt: Number.isFinite(published)
      ? new Date(published)
      : save.publishedAt,
  };
}

/** Purges saves the old scope filtered out, so the next full walk sees them again and the new scope decides. */
export async function releaseFilteredSaves(accountId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(saves)
    .where(
      and(
        eq(saves.accountId, accountId),
        eq(saves.status, "skipped"),
        ne(
          sql`coalesce(json_extract(${saves.rawJson}, '$.importFilter'), '')`,
          "",
        ),
      ),
    );
  if (rows.length === 0) {
    return 0;
  }
  await purgeReleased(rows);
  log.info("[pond pipeline:import-filter] released", {
    accountId,
    count: rows.length,
  });
  return rows.length;
}

/** Purges saves skipped for their list, so the walk that found them on another list queues them again. */
export async function releaseListFilteredSaves(
  ids: ReadonlyArray<string>,
): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(saves)
    .where(
      and(
        inArray(saves.id, [...ids]),
        eq(saves.status, "skipped"),
        eq(sql`json_extract(${saves.rawJson}, '$.importFilter')`, "list"),
      ),
    );
  await purgeReleased(rows);
}

async function purgeReleased(rows: Array<Save>): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const transactions = rows.map((row): Transaction => ({
    kind: "purge",
    model: "save",
    id: row.id,
    before: row,
    meta: { actor: "system", actorReason: "sync:import-filter:release" },
  }));
  await executeBatch(transactions);
}
