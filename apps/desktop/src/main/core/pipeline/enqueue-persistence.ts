import {
  type NewSave,
  type NewSyncAction,
  type NewTask,
  type Save,
  type Source,
  type SyncAction,
  saves,
  syncActions,
  tasks,
} from "@pond/schema/db";
import { domainFromUrl } from "@pond/schema/domain";
import { type InboxFields, NOT_IN_INBOX } from "@pond/schema/inbox";
import { listKindsEqual, mergeListKinds } from "@pond/schema/list-kinds";
import { and, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import {
  type EnqueueCandidate,
  type EnqueueOptions,
  enqueueCandidateKey,
} from "./enqueue-input";
import { createPendingTasks } from "./enqueue-scheduling";
import { seedToInsertColumns } from "./seed";

export interface EnqueueBundle {
  save: NewSave;
  tasks: NewTask[];
  action: NewSyncAction;
}

export interface EnqueuePersistence {
  loadExistingSave(source: Source, sourceId: string): Promise<Save | undefined>;
  loadExistingCandidateKeys(
    candidates: readonly EnqueueCandidate[],
  ): Promise<Set<string>>;
  insertBundle(bundle: EnqueueBundle): SyncAction | undefined;
  insertBundles(
    bundles: EnqueueBundle[],
    groupSize: number,
  ): Promise<SyncAction[]>;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    groups.push(rows.slice(index, index + size));
  }
  return groups;
}

export async function openEnqueuePersistence(): Promise<EnqueuePersistence> {
  const db = await getDb();
  return {
    async loadExistingSave(source, sourceId) {
      const existing = await db
        .select()
        .from(saves)
        .where(and(eq(saves.source, source), eq(saves.sourceId, sourceId)));
      return existing[0];
    },
    async loadExistingCandidateKeys(candidates) {
      const bySource = new Map<Source, EnqueueCandidate[]>();
      for (const candidate of candidates) {
        const group = bySource.get(candidate.source) ?? [];
        group.push(candidate);
        bySource.set(candidate.source, group);
      }

      const existingKeys = new Set<string>();
      for (const [source, group] of bySource) {
        const ids = group.map((candidate) => candidate.sourceId);
        for (const idChunk of chunk(ids, 400)) {
          const rows = db
            .select({ sourceId: saves.sourceId })
            .from(saves)
            .where(
              and(eq(saves.source, source), inArray(saves.sourceId, idChunk)),
            )
            .all();
          for (const row of rows) {
            existingKeys.add(
              enqueueCandidateKey({ source, sourceId: row.sourceId }),
            );
          }
        }
      }
      return existingKeys;
    },
    insertBundle(bundle) {
      /** Atomic insertion prevents a crash from leaving a half-ingested Save. */
      return db.transaction((tx) => {
        tx.insert(saves).values(bundle.save).run();
        tx.insert(tasks).values(bundle.tasks).run();
        return tx
          .insert(syncActions)
          .values(bundle.action)
          .returning()
          .all()[0];
      });
    },
    async insertBundles(bundles, groupSize) {
      const insertedActions: SyncAction[] = [];
      for (const group of chunk(bundles, groupSize)) {
        const groupActions = db.transaction((tx) => {
          tx.insert(saves)
            .values(group.map((bundle) => bundle.save))
            .run();
          tx.insert(tasks)
            .values(group.flatMap((bundle) => bundle.tasks))
            .run();
          return tx
            .insert(syncActions)
            .values(group.map((bundle) => bundle.action))
            .returning()
            .all();
        });
        insertedActions.push(...groupActions);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      return insertedActions;
    },
  };
}

export async function persistMergedListKinds(
  saveId: string,
  current: Save["listKinds"],
  incoming: NonNullable<Save["listKinds"]>,
  reason: string,
): Promise<void> {
  if (incoming.length === 0) return;
  const merged = mergeListKinds(current, incoming);
  if (listKindsEqual(current, merged)) return;
  await persistSave(saveId, { listKinds: merged }, { actorReason: reason });
}

export function createEnqueueBundle(
  candidate: EnqueueCandidate,
  opts: Pick<EnqueueOptions, "accountId" | "generationId" | "trigger">,
  now: Date,
  actorReason: string,
  inbox: InboxFields = NOT_IN_INBOX,
): EnqueueBundle {
  const id = ulid();
  const save: NewSave = {
    id,
    source: candidate.source,
    sourceId: candidate.sourceId,
    accountId: opts.accountId ?? null,
    url: candidate.url,
    siteName: domainFromUrl(candidate.url),
    status: "ingesting",
    ingestStartedAt: now,
    tags: [],
    listKinds: candidate.listKinds,
    files: [],
    coverIndex: 0,
    savedAt: now,
    createdAt: now,
    ...inbox,
  };
  if (candidate.seed) {
    Object.assign(save, seedToInsertColumns(candidate.seed));
  }
  return {
    save,
    tasks: createPendingTasks(
      id,
      candidate.source,
      now,
      opts.trigger,
      ulid,
      opts.generationId,
    ),
    action: {
      modelName: "save",
      modelId: id,
      action: "I",
      data: save,
      actor: opts.trigger?.startsWith("user:") ? "user" : "system",
      actorReason,
      batchId: ulid(),
    },
  };
}
