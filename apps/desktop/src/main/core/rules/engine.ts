import { saveFolders, saves, tags as tagsTable } from "@pond/schema/db";
import type { Folder } from "@pond/schema/db";
import { buildWhere } from "@pond/schema/filters";
import type { Query } from "@pond/schema/filters";
import type { InboxChannel } from "@pond/schema/inbox";
import type { Transaction } from "@pond/schema/tx";
import { and, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import type { Rule } from "../../../shared/rule-contracts";
import { getDb } from "../../db";
import type { Db } from "../../db";
import { executeBatch, withMutationScope } from "../executor";
import { folderAssignmentTransactions, listFolders } from "../folders";
import { normalizeTagList, planTagRegistryUpdates } from "../tags";
import { recordBatchForUndo } from "../undo";
import { planBatch } from "./plan";
import type { BatchPlan, RuleOutcome, RuleTarget } from "./plan";

const CHUNK = 500;

/** Something that happened to one Save that a Rule may listen to. */
export type RuleEvent =
  | {
      kind: "newSave";
      saveId: string;
      channel: InboxChannel;
      ownerId: string | null;
    }
  | { kind: "addedToFolder"; saveId: string; folderIds: Array<string> };

export interface FolderTree {
  exists(folderId: string): boolean;
  /** The folder and every folder above it. */
  lineage(folderId: string): Array<string>;
}

export function folderTree(folders: ReadonlyArray<Folder>): FolderTree {
  const parents = new Map(
    folders.map((folder) => [folder.id, folder.parentId]),
  );
  return {
    exists: (folderId) => parents.has(folderId),
    lineage(folderId) {
      const out: Array<string> = [];
      const seen = new Set<string>();
      let current: string | null | undefined = folderId;
      while (current && !seen.has(current)) {
        seen.add(current);
        out.push(current);
        current = parents.get(current);
      }
      return out;
    },
  };
}

/** Whether a Rule's trigger answers this event. Conditions are checked separately. */
export function ruleListens(
  rule: Rule,
  event: RuleEvent,
  tree: FolderTree,
): boolean {
  if (rule.trigger.kind === "newSave") {
    if (event.kind !== "newSave") return false;
    if (!rule.trigger.channels.includes(event.channel)) return false;
    return !rule.trigger.ownerId || rule.trigger.ownerId === event.ownerId;
  }
  if (event.kind !== "addedToFolder") return false;
  const { folderId, includeSubfolders } = rule.trigger;
  return event.folderIds.some((added) =>
    includeSubfolders
      ? tree.lineage(added).includes(folderId)
      : added === folderId,
  );
}

/** Live Saves among `saveIds` that match `conditions`, compiled the same way as Smart Folders. */
export function matchingSaveIds(
  db: Db,
  conditions: Query,
  saveIds: ReadonlyArray<string>,
): Set<string> {
  const matched = new Set<string>();
  const where = buildWhere(conditions);
  for (let offset = 0; offset < saveIds.length; offset += CHUNK) {
    const ids = saveIds.slice(offset, offset + CHUNK);
    const rows = db
      .select({ id: saves.id })
      .from(saves)
      .where(and(inArray(saves.id, ids), isNull(saves.deletedAt), where))
      .all();
    for (const row of rows) matched.add(row.id);
  }
  return matched;
}

export function loadTargets(
  db: Db,
  saveIds: ReadonlyArray<string>,
): Map<string, RuleTarget> {
  const targets = new Map<string, RuleTarget>();
  for (let offset = 0; offset < saveIds.length; offset += CHUNK) {
    const ids = saveIds.slice(offset, offset + CHUNK);
    const rows = db
      .select({
        id: saves.id,
        tags: saves.tags,
        favorite: saves.favorite,
        rating: saves.rating,
        inboxState: saves.inboxState,
        inboxUntil: saves.inboxUntil,
        deletedAt: saves.deletedAt,
      })
      .from(saves)
      .where(inArray(saves.id, ids))
      .all();
    const members = db
      .select({ saveId: saveFolders.saveId, folderId: saveFolders.folderId })
      .from(saveFolders)
      .where(inArray(saveFolders.saveId, ids))
      .all();
    const folders = new Map<string, Array<string>>();
    for (const member of members) {
      folders.set(member.saveId, [
        ...(folders.get(member.saveId) ?? []),
        member.folderId,
      ]);
    }
    for (const row of rows) {
      targets.set(row.id, {
        id: row.id,
        tags: row.tags,
        folderIds: folders.get(row.id) ?? [],
        favorite: row.favorite,
        rating: row.rating,
        inboxState: row.inboxState,
        inboxUntil: row.inboxUntil,
        deleted: row.deletedAt !== null,
      });
    }
  }
  return targets;
}

function sameTags(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Writes a plan through the executor. Field changes land first, then folder
 * memberships, which read the new tags and add each folder's Auto-Tags.
 */
async function commitPlan(
  batch: BatchPlan,
  actorReason: string,
): Promise<Array<Transaction>> {
  const meta = { actor: "system", actorReason } as const;
  return withMutationScope(async () => {
    const db = await getDb();
    const fields: Array<Transaction> = [];
    const assignments: Array<{ saveId: string; folderIds: Array<string> }> = [];
    for (const [saveId, { before, after }] of batch.targets) {
      if (after.deleted) continue;
      const patch: Partial<RuleTarget> = {};
      const previous: Partial<RuleTarget> = {};
      const nextTags = normalizeTagList(after.tags);
      if (!sameTags(nextTags, before.tags)) {
        patch.tags = nextTags;
        previous.tags = before.tags;
      }
      if (after.favorite !== before.favorite) {
        patch.favorite = after.favorite;
        previous.favorite = before.favorite;
      }
      if (after.rating !== before.rating) {
        patch.rating = after.rating;
        previous.rating = before.rating;
      }
      if (
        after.inboxState !== before.inboxState ||
        after.inboxUntil !== before.inboxUntil
      ) {
        patch.inboxState = after.inboxState;
        patch.inboxUntil = after.inboxUntil;
        previous.inboxState = before.inboxState;
        previous.inboxUntil = before.inboxUntil;
      }
      if (Object.keys(patch).length) {
        fields.push({
          kind: "update",
          model: "save",
          id: saveId,
          patch,
          before: previous,
          meta,
        });
      }
      if (after.folderIds.some((id) => !before.folderIds.includes(id))) {
        assignments.push({ saveId, folderIds: after.folderIds });
      }
    }
    const newTags = fields.flatMap((tx) =>
      tx.kind === "update" && tx.model === "save" ? (tx.patch.tags ?? []) : [],
    );
    const registry = newTags.length
      ? planTagRegistryUpdates(newTags, db.select().from(tagsTable).all()).map(
          (tx): Transaction => ({ ...tx, meta: { ...tx.meta, ...meta } }),
        )
      : [];
    const first = [...registry, ...fields];
    if (first.length) await executeBatch(first);
    const folders = assignments.length
      ? (await folderAssignmentTransactions(assignments)).map(
          (tx): Transaction => ({ ...tx, meta: { ...tx.meta, ...meta } }),
        )
      : [];
    if (folders.length) await executeBatch(folders);
    return [...first, ...folders];
  });
}

export interface RunResult {
  outcomes: Array<RuleOutcome>;
  /** Rules whose conditions or writes failed, with the Saves they were meant for. */
  failures: Array<{ ruleId: string; saveId: string | null; error: string }>;
  /** Everything written, so a caller can record one Undo step for the whole run. */
  transactions: Array<Transaction>;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : "This Rule failed.";
}

/**
 * Plans and applies Rules for a set of Saves. Each Rule is matched on its
 * own, so one Rule with bad stored conditions can't stop the others, and a
 * failed write is retried one Save at a time so one bad Save can't stop the
 * rest.
 */
export async function applyRules(
  candidates: ReadonlyMap<Rule, ReadonlyArray<string>>,
  actorReason: (ruleIds: ReadonlyArray<string>) => string,
): Promise<RunResult> {
  const db = await getDb();
  const result: RunResult = { outcomes: [], failures: [], transactions: [] };
  const matches = new Map<string, Set<string>>();
  const rules: Array<Rule> = [];
  for (const [rule, saveIds] of candidates) {
    if (!saveIds.length) continue;
    try {
      const matched = matchingSaveIds(db, rule.conditions, saveIds);
      if (matched.size) {
        matches.set(rule.id, matched);
        rules.push(rule);
      }
    } catch (error) {
      log.warn("[pond rules] matching failed", rule.id, error);
      result.failures.push({
        ruleId: rule.id,
        saveId: null,
        error: message(error),
      });
    }
  }
  if (!rules.length) return result;
  const saveIds = [
    ...new Set([...matches.values()].flatMap((set) => [...set])),
  ];
  const tree = folderTree(await listFolders());
  for (let offset = 0; offset < saveIds.length; offset += CHUNK) {
    const chunk = saveIds.slice(offset, offset + CHUNK);
    const batch = planBatch(rules, matches, loadTargets(db, chunk), (id) =>
      tree.exists(id),
    );
    const reason = actorReason([
      ...new Set(batch.outcomes.map((outcome) => outcome.ruleId)),
    ]);
    try {
      const committed = await commitPlan(batch, reason);
      result.outcomes.push(...batch.outcomes);
      result.transactions.push(...committed);
    } catch (error) {
      log.warn(
        "[pond rules] applying a batch failed, retrying per Save",
        error,
      );
      for (const saveId of chunk) {
        const single = planBatch(
          rules,
          matches,
          loadTargets(db, [saveId]),
          (id) => tree.exists(id),
        );
        try {
          const committed = await commitPlan(single, reason);
          result.outcomes.push(...single.outcomes);
          result.transactions.push(...committed);
        } catch (cause) {
          for (const outcome of single.outcomes) {
            result.failures.push({
              ruleId: outcome.ruleId,
              saveId,
              error: message(cause),
            });
          }
        }
      }
    }
  }
  return result;
}

/** One Undo step for everything a run wrote; the tag registry stays, like folder assignment. */
export function recordRunForUndo(
  transactions: ReadonlyArray<Transaction>,
): string | null {
  const steps = transactions.filter((tx) => tx.model !== "tag");
  return steps.length ? recordBatchForUndo(steps) : null;
}
