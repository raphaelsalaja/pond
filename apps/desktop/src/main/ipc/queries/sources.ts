import { saves } from "@pond/schema/db";
import type { SourceSyncPrefs } from "@pond/schema/db";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { OkResult } from "../../../shared/query-contracts-shared";
import { getAccount, patchAccountSync } from "../../core/sync/accounts";
import { syncBaselineWhere } from "../../core/sync/sync-baseline";
import { getWatch, patchWatchSync } from "../../core/sync/watches";
import { getDb } from "../../db";
import { lastNativeContactAt } from "../../native/rpc";
import { query, StringParam } from "./params";
import type { QueryHandlerMap } from "./params";

const RECENT_LIMIT = 12;

const TargetSchema = z.object({
  kind: z.enum(["account", "watch"]),
  id: StringParam,
});

async function patchTargetSync(
  target: z.infer<typeof TargetSchema>,
  patch: Partial<SourceSyncPrefs>,
): Promise<OkResult> {
  if (target.kind === "account") {
    if (!(await getAccount(target.id))) {
      return { ok: false, error: "Account not found." };
    }
    await patchAccountSync(target.id, patch);
    return { ok: true };
  }
  if (!(await getWatch(target.id))) {
    return { ok: false, error: "Watch not found." };
  }
  await patchWatchSync(target.id, patch);
  return { ok: true };
}

export const sourcesQueries = {
  "sources.setSchedule": query(
    TargetSchema.extend({
      paused: z.boolean().catch(false),
      intervalHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 30)
        .nullable()
        .catch(null),
    }),
    (params) =>
      patchTargetSync(params, {
        paused: params.paused || undefined,
        intervalHours: params.intervalHours ?? undefined,
      }),
  ),

  "sources.extensionLastSeen": query(z.object({}), () => ({
    at: lastNativeContactAt(),
  })),

  "sources.overview": query(z.object({ id: StringParam }), async (params) => {
    const db = await getDb();
    const account = await getAccount(params.id);
    /** Accounts match like `countSavesForAccount`, so saves from that source with no account count too. */
    const owned = account
      ? and(syncBaselineWhere(account), ne(saves.status, "skipped"))
      : and(
          eq(saves.accountId, params.id),
          isNull(saves.deletedAt),
          ne(saves.status, "skipped"),
        );
    const [totals] = await db
      .select({
        saves: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum((select sum(json_extract(value, '$.size')) from json_each(${saves.files}))), 0)`,
      })
      .from(saves)
      .where(owned);
    const recent = await db
      .select({ id: saves.id })
      .from(saves)
      .where(owned)
      .orderBy(desc(saves.savedAt), desc(saves.id))
      .limit(RECENT_LIMIT);
    return {
      saves: Number(totals?.saves ?? 0),
      bytes: Number(totals?.bytes ?? 0),
      recent: recent.map((row) => row.id),
    };
  }),
} satisfies QueryHandlerMap;
