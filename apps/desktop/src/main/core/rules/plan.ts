import { applyInboxChange } from "@pond/schema/inbox";
import type { InboxState } from "@pond/schema/inbox";
import type {
  Rule,
  RuleAction,
  RuleChange,
} from "../../../shared/rule-contracts";

/** The organization fields of one Save that Rule actions read and write. */
export interface RuleTarget {
  id: string;
  tags: Array<string>;
  folderIds: Array<string>;
  favorite: boolean;
  rating: number | null;
  inboxState: InboxState | null;
  inboxUntil: number | null;
  deleted: boolean;
}

export interface ActionPlan {
  changes: Array<RuleChange>;
  already: Array<RuleChange>;
  /** Actions that can't run, like a folder that was deleted. */
  skipped: Array<string>;
  next: RuleTarget;
}

function hasTag(tags: ReadonlyArray<string>, tag: string): boolean {
  const lower = tag.toLocaleLowerCase();
  return tags.some((existing) => existing.toLocaleLowerCase() === lower);
}

/** What one Rule's actions do to a Save, given what earlier Rules already did to it. */
export function planActions(
  actions: ReadonlyArray<RuleAction>,
  target: RuleTarget,
  folderExists: (folderId: string) => boolean,
): ActionPlan {
  const plan: ActionPlan = {
    changes: [],
    already: [],
    skipped: [],
    next: {
      ...target,
      tags: [...target.tags],
      folderIds: [...target.folderIds],
    },
  };
  const next = plan.next;
  for (const action of actions) {
    switch (action.kind) {
      case "addToFolder": {
        const change: RuleChange = {
          kind: "folder",
          folderId: action.folderId,
        };
        if (!folderExists(action.folderId)) {
          plan.skipped.push("A folder this Rule files into no longer exists.");
        } else if (next.folderIds.includes(action.folderId)) {
          plan.already.push(change);
        } else {
          next.folderIds.push(action.folderId);
          plan.changes.push(change);
        }
        break;
      }
      case "addTags": {
        for (const raw of action.tags) {
          const tag = raw.trim();
          if (!tag) continue;
          const change: RuleChange = { kind: "tag", tag };
          if (hasTag(next.tags, tag)) {
            plan.already.push(change);
          } else {
            next.tags.push(tag);
            plan.changes.push(change);
          }
        }
        break;
      }
      case "favorite": {
        if (next.favorite) plan.already.push({ kind: "favorite" });
        else {
          next.favorite = true;
          plan.changes.push({ kind: "favorite" });
        }
        break;
      }
      case "rating": {
        const change: RuleChange = { kind: "rating", rating: action.rating };
        if (next.rating) {
          plan.already.push({ kind: "rating", rating: next.rating });
        } else {
          next.rating = action.rating;
          plan.changes.push(change);
        }
        break;
      }
      case "inbox": {
        const change: RuleChange = { kind: "inbox", state: action.state };
        const inbox = applyInboxChange(
          { kind: "inbox", state: action.state },
          {
            inboxState: next.inboxState,
            inboxUntil: next.inboxUntil,
            deletedAt: next.deleted ? 1 : null,
          },
        );
        if (inbox) {
          next.inboxState = inbox.inboxState;
          next.inboxUntil = inbox.inboxUntil;
          plan.changes.push(change);
        } else {
          plan.already.push(change);
        }
        break;
      }
    }
  }
  return plan;
}

export interface RuleOutcome {
  ruleId: string;
  saveId: string;
  changes: Array<RuleChange>;
  skipped: Array<string>;
}

export interface BatchPlan {
  outcomes: Array<RuleOutcome>;
  /** The end state of every Save some Rule changed. */
  targets: Map<string, { before: RuleTarget; after: RuleTarget }>;
}

/**
 * Runs every matching Rule against each Save in a stable order. Actions only
 * add, so the end state doesn't depend on order; the order only decides
 * which Rule gets credit when two of them ask for the same change.
 */
export function planBatch(
  rules: ReadonlyArray<Rule>,
  matches: ReadonlyMap<string, ReadonlySet<string>>,
  targets: ReadonlyMap<string, RuleTarget>,
  folderExists: (folderId: string) => boolean,
): BatchPlan {
  const ordered = [...rules].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
  const batch: BatchPlan = { outcomes: [], targets: new Map() };
  for (const [saveId, before] of targets) {
    let current = before;
    for (const rule of ordered) {
      if (!matches.get(rule.id)?.has(saveId)) continue;
      const plan = planActions(rule.actions, current, folderExists);
      batch.outcomes.push({
        ruleId: rule.id,
        saveId,
        changes: plan.changes,
        skipped: plan.skipped,
      });
      current = plan.next;
    }
    if (current !== before)
      batch.targets.set(saveId, { before, after: current });
  }
  return batch;
}
