import { type Save, saves, tasks } from "@pond/schema/db";
import { majorityMediaType } from "@pond/schema/media-type";
import type { Transaction } from "@pond/schema/tx";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import {
  accountImportScope,
  importFilterReason,
} from "../../../shared/import-scope";
import { getDb } from "../../db";
import { executeBatch } from "../executor";
import { persistSave } from "../persist-save";
import { getAccount } from "../sync/accounts";

/** Skips a save its Account's scope filters out. Only a sync's first pass is checked, so a manual refresh keeps the save. */
export async function applyImportFilter(save: Save): Promise<boolean> {
  if (!save.accountId || save.status !== "ingesting") return false;
  const account = await getAccount(save.accountId);
  if (!account) return false;
  const reason = importFilterReason(
    accountImportScope(account.source, account.sync),
    capturedTraits(save),
  );
  if (!reason) return false;
  await persistSave(
    save.id,
    {
      status: "skipped",
      rawJson: save.rawJson ? { ...save.rawJson, importFilter: reason } : null,
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
  save: Pick<Save, "mediaType" | "publishedAt" | "rawJson">,
) {
  const capture = save.rawJson?.capture;
  if (!capture) {
    return { mediaType: save.mediaType, publishedAt: save.publishedAt };
  }
  const published = capture.publishedAt
    ? Date.parse(capture.publishedAt)
    : Number.NaN;
  return {
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
  if (rows.length === 0) return 0;
  const transactions = rows.map(
    (row): Transaction => ({
      kind: "purge",
      model: "save",
      id: row.id,
      before: row,
      meta: { actor: "system", actorReason: "sync:import-filter:release" },
    }),
  );
  await executeBatch(transactions);
  log.info("[pond pipeline:import-filter] released", {
    accountId,
    count: rows.length,
  });
  return rows.length;
}
