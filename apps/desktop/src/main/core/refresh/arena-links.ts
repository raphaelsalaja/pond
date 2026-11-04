import { setTimeout as delay } from "node:timers/promises";
import { arenaLinkUrl, isWebPageSave } from "@shared/web-page-save";
import log from "electron-log/main.js";
import { z } from "zod";
import type {
  ArenaLinkConversion,
  ArenaLinkConversionProgress,
} from "../../../shared/arena-link-contracts";
import { type Db, getDb } from "../../db";
import { refreshSave } from "./index";

/** Saves stay out of the library while they refresh, so a batch caps how many are hidden at once. */
const BATCH_SIZE = 20;
const SETTLE_POLL_MS = 2_000;

type RawDb = Pick<Db, "$raw">;

const CandidateSchema = z.object({
  id: z.string(),
  url: z.string(),
  linkUrl: z.string().nullable(),
  blockClass: z.string().nullable(),
});

const SaveUrlSchema = z.object({ id: z.string(), url: z.string() });

const CountSchema = z.object({ count: z.number() });

/** Link saves harvested before Link blocks became web pages; `ingesting` ones are already converting. */
export function listUnconvertedArenaLinks(db: RawDb): string[] {
  const rows = z.array(CandidateSchema).parse(
    db.$raw
      .prepare(
        `SELECT
          id,
          url,
          json_extract(raw_json, '$.capture.url') AS linkUrl,
          json_extract(raw_json, '$.capture.extras.blockClass') AS blockClass
        FROM saves
        WHERE
          source = 'arena'
          AND deleted_at IS NULL
          AND status IN ('complete', 'failed')
          AND lower(json_extract(raw_json, '$.capture.extras.blockClass')) = 'link'
        ORDER BY saved_at ASC, id ASC`,
      )
      .all(),
  );
  return rows
    .filter(
      (row) =>
        !isWebPageSave({ source: "arena", url: row.url }) &&
        row.linkUrl !== null &&
        arenaLinkUrl({
          source: "arena",
          url: row.linkUrl,
          extras: { blockClass: row.blockClass ?? undefined },
        }) !== null,
    )
    .map((row) => row.id);
}

export function countIngesting(db: RawDb, ids: readonly string[]): number {
  return CountSchema.parse(
    db.$raw
      .prepare(
        `SELECT COUNT(*) AS count FROM saves
        WHERE status = 'ingesting' AND id IN (SELECT value FROM json_each(?))`,
      )
      .get(JSON.stringify(ids)),
  ).count;
}

export function convertedArenaLinks(
  db: RawDb,
  ids: readonly string[],
): Set<string> {
  const rows = z.array(SaveUrlSchema).parse(
    db.$raw
      .prepare(
        `SELECT id, url FROM saves
        WHERE
          source = 'arena'
          AND deleted_at IS NULL
          AND id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(ids)),
  );
  return new Set(
    rows
      .filter((row) => isWebPageSave({ source: "arena", url: row.url }))
      .map((row) => row.id),
  );
}

/** Puts settled linked-page harvests back on the save's own budget, so a later refresh reads the block from Are.na again. */
export function restoreLinkedPageHarvests(db: RawDb): void {
  db.$raw
    .prepare(
      `UPDATE tasks
      SET
        source = (SELECT saves.source FROM saves WHERE saves.id = tasks.save_id),
        payload = NULL,
        updated_at = ?
      WHERE
        op = 'harvest_metadata'
        AND status IN ('done', 'dead', 'cancelled')
        AND json_extract(payload, '$.linkedPage') = 1`,
    )
    .run(Date.now());
}

export interface ArenaLinkJobDeps {
  batchSize: number;
  list: () => Promise<string[]>;
  queue: (saveId: string) => Promise<boolean>;
  settle: (saveIds: readonly string[]) => Promise<void>;
  converted: (saveIds: readonly string[]) => Promise<ReadonlySet<string>>;
  restore: () => Promise<void>;
}

const defaultDeps: ArenaLinkJobDeps = {
  batchSize: BATCH_SIZE,
  list: async () => listUnconvertedArenaLinks(await getDb()),
  queue: async (saveId) =>
    (
      await refreshSave(saveId, {
        harvestPayload: { force: true, linkedPage: true },
        harvestSource: "web",
      })
    ).ok,
  settle: async (saveIds) => {
    const db = await getDb();
    while (countIngesting(db, saveIds) > 0) await delay(SETTLE_POLL_MS);
  },
  converted: async (saveIds) => convertedArenaLinks(await getDb(), saveIds),
  restore: async () => restoreLinkedPageHarvests(await getDb()),
};

let running: Promise<ArenaLinkConversion> | null = null;

export function isConvertingArenaLinks(): boolean {
  return running !== null;
}

export async function countUnconvertedArenaLinks(): Promise<number> {
  return listUnconvertedArenaLinks(await getDb()).length;
}

export async function convertArenaLinks(
  onProgress?: (progress: ArenaLinkConversionProgress) => void,
  deps: ArenaLinkJobDeps = defaultDeps,
): Promise<ArenaLinkConversion | { ok: false; reason: "already_running" }> {
  if (running) return { ok: false, reason: "already_running" };
  running = runConversion(onProgress, deps).finally(() => {
    running = null;
  });
  return running;
}

async function runConversion(
  onProgress: ((progress: ArenaLinkConversionProgress) => void) | undefined,
  deps: ArenaLinkJobDeps,
): Promise<ArenaLinkConversion> {
  await deps.restore();
  const ids = await deps.list();
  const progress: ArenaLinkConversionProgress = {
    processed: 0,
    total: ids.length,
    converted: 0,
    failed: 0,
  };
  onProgress?.({ ...progress });
  for (let start = 0; start < ids.length; start += deps.batchSize) {
    const batch = ids.slice(start, start + deps.batchSize);
    const queued: string[] = [];
    for (const id of batch) if (await deps.queue(id)) queued.push(id);
    await deps.settle(queued);
    const converted = await deps.converted(batch);
    await deps.restore();
    progress.processed += batch.length;
    progress.converted += converted.size;
    progress.failed += batch.length - converted.size;
    onProgress?.({ ...progress });
  }
  log.info("[pond arena-links] converted Link saves", progress);
  return { ok: true, ...progress };
}
