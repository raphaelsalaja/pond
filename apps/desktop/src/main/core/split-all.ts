import { type SaveFile, type Source, saves } from "@pond/schema/db";
import { EXTERNAL_SOURCE_IDS } from "@pond/schema/sources";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { AUXILIARY_KINDS } from "../../shared/save-file-names";
import { canSplitFiles } from "../../shared/save-slides";
import type { SplitAllProgress } from "../../shared/saves-mutation-contracts";
import { getDb } from "../db";
import { libraryId } from "../paths";
import { getDownloadConfig } from "./prefs";
import { type SplitSaveResult, splitSave } from "./split-save";

export interface SplitCandidate {
  id: string;
  source: Source;
  files: SaveFile[];
}

export interface SplitAllRuntime {
  /** Complete saves outside Trash with more than one original file, by ID after `after`. */
  page(after: string | null, limit: number): Promise<SplitCandidate[]>;
  /** Sources whose own Split Into Saves setting is off. */
  optedOut(): Promise<ReadonlySet<Source>>;
  split(id: string): Promise<SplitSaveResult>;
  library(): string;
  pause(): Promise<void>;
}

const PAGE_SIZE = 500;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 25;

const IDLE: SplitAllProgress = {
  running: false,
  total: 0,
  processed: 0,
  split: 0,
  created: 0,
  failed: 0,
};

const auxiliaryKinds = sql.join(
  [...AUXILIARY_KINDS].map((kind) => sql`${kind}`),
  sql`, `,
);

const runtime: SplitAllRuntime = {
  async page(after, limit) {
    const db = await getDb();
    return db
      .select({ id: saves.id, source: saves.source, files: saves.files })
      .from(saves)
      .where(
        and(
          isNull(saves.deletedAt),
          eq(saves.status, "complete"),
          after === null ? undefined : gt(saves.id, after),
          sql`(select count(*) from json_each(${saves.files}) where json_extract(value, '$.kind') not in (${auxiliaryKinds})) > 1`,
        ),
      )
      .orderBy(asc(saves.id))
      .limit(limit)
      .all();
  },
  async optedOut() {
    const { imageSources } = await getDownloadConfig();
    return new Set(
      EXTERNAL_SOURCE_IDS.filter(
        (source) => imageSources[source]?.splitPosts === false,
      ),
    );
  },
  split: (id) => splitSave(id, "user"),
  library: libraryId,
  pause: () => new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS)),
};

let status: SplitAllProgress = IDLE;

/** Splitting leaves one slide per save, so a rerun after a quit only finds the saves still left. */
export async function splittableIds(
  dependencies: SplitAllRuntime,
): Promise<string[]> {
  const skip = await dependencies.optedOut();
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    const rows = await dependencies.page(after, PAGE_SIZE);
    for (const row of rows)
      if (!skip.has(row.source) && canSplitFiles(row.files)) ids.push(row.id);
    const last = rows.at(-1);
    if (!last || rows.length < PAGE_SIZE) return ids;
    after = last.id;
  }
}

export async function runSplitAll(
  dependencies: SplitAllRuntime,
  report: (progress: SplitAllProgress) => void,
): Promise<SplitAllProgress> {
  const library = dependencies.library();
  const ids = await splittableIds(dependencies);
  const progress = { ...IDLE, running: true, total: ids.length };
  report({ ...progress });
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    if (dependencies.library() !== library) break;
    for (const id of ids.slice(start, start + BATCH_SIZE)) {
      const result = await dependencies.split(id).catch((err) => {
        log.warn("[pond split] split all skipped a save", id, err);
        return null;
      });
      progress.processed += 1;
      if (!result) progress.failed += 1;
      else if (result.ok) {
        progress.split += 1;
        progress.created += result.created.length;
      }
    }
    report({ ...progress });
    await dependencies.pause();
  }
  return { ...progress, running: false };
}

export async function countSplittableSaves(
  dependencies: SplitAllRuntime = runtime,
): Promise<number> {
  return (await splittableIds(dependencies)).length;
}

export function splitAllStatus(): SplitAllProgress {
  return { ...status };
}

export function startSplitAll(
  dependencies: SplitAllRuntime = runtime,
): SplitAllProgress {
  if (status.running) return splitAllStatus();
  status = { ...IDLE, running: true };
  void runSplitAll(dependencies, (next) => {
    status = next;
  })
    .then((final) => {
      status = final;
    })
    .catch((err) => {
      log.warn("[pond split] split all stopped", err);
      status = { ...status, running: false };
    });
  return splitAllStatus();
}
