import { isGroup } from "@pond/schema/filters/types";
import type { Clause, Query } from "@pond/schema/filters/types";
import type {
  RuleAction,
  RuleChange,
  RuleInput,
  RuleTrigger,
} from "@shared/rule-contracts";
import { RULE_CHANNEL_LABELS, RULE_CHANNELS } from "@shared/rule-contracts";

/** Looks up display names for IDs a Rule stores. */
export interface RuleNames {
  folder(id: string): string | null;
  owner(id: string): string | null;
  predicate(clause: Clause): string;
}

export function joinList(items: ReadonlyArray<string>, last = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${last} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${last} ${items.at(-1)}`;
}

function folderName(id: string, names: RuleNames): string {
  return names.folder(id) ?? "a deleted folder";
}

function describeTrigger(trigger: RuleTrigger, names: RuleNames): string {
  if (trigger.kind === "addedToFolder") {
    const folder = folderName(trigger.folderId, names);
    return trigger.includeSubfolders
      ? `When a Save is added to ${folder} or a folder inside it`
      : `When a Save is added to ${folder}`;
  }
  const all = RULE_CHANNELS.every((channel) =>
    trigger.channels.includes(channel),
  );
  const paths = all
    ? "any capture path"
    : joinList(
        trigger.channels.map((channel) => RULE_CHANNEL_LABELS[channel]),
        "or",
      );
  const owner = trigger.ownerId
    ? ` from ${names.owner(trigger.ownerId) ?? "a removed Account or Watch"}`
    : "";
  return `When a new Save arrives through ${paths}${owner}`;
}

function describeConditions(query: Query, names: RuleNames): string | null {
  if (!query.rules.length) return query.not ? "if nothing" : null;
  const parts = query.rules.map((clause) =>
    isGroup(clause)
      ? `(${describeConditions(clause, names) ?? "anything"})`
      : names.predicate(clause),
  );
  const joined = joinList(parts, query.combinator === "or" ? "or" : "and");
  return query.not ? `unless ${joined}` : `if ${joined}`;
}

function describeAction(action: RuleAction, names: RuleNames): string {
  switch (action.kind) {
    case "addToFolder":
      return `add it to ${folderName(action.folderId, names)}`;
    case "addTags":
      return `tag it ${joinList(action.tags)}`;
    case "favorite":
      return "favorite it";
    case "rating":
      return `rate it ${action.rating} ${action.rating === 1 ? "star" : "stars"} if it has no rating`;
    case "inbox":
      return action.state === "review"
        ? "send it to the Inbox"
        : "mark it processed in the Inbox";
  }
}

export function describeChange(change: RuleChange, names: RuleNames): string {
  switch (change.kind) {
    case "folder":
      return `Added to ${folderName(change.folderId, names)}`;
    case "tag":
      return `Tagged ${change.tag}`;
    case "favorite":
      return "Favorited";
    case "rating":
      return `Rated ${change.rating} ${change.rating === 1 ? "star" : "stars"}`;
    case "inbox":
      return change.state === "review"
        ? "Sent to the Inbox"
        : "Marked processed";
  }
}

/** One sentence that says what a Rule does, for the list and the builder. */
export function summarizeRule(rule: RuleInput, names: RuleNames): string {
  const conditions = describeConditions(rule.conditions, names);
  const actions = joinList(
    rule.actions.map((action) => describeAction(action, names)),
  );
  return `${describeTrigger(rule.trigger, names)}${conditions ? `, ${conditions}` : ""}, ${actions}.`;
}
