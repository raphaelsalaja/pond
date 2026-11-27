import type {
  RuleAction,
  RuleActionKind,
  RuleInput,
} from "@shared/rule-contracts";
import { RULE_CHANNELS, RuleInputSchema } from "@shared/rule-contracts";
import {
  compileRuleQuery,
  editableQuery,
  ruleQueryReady,
} from "@/shared/components/conditions-editor";

export function emptyRule(): RuleInput {
  return {
    name: "",
    enabled: true,
    trigger: { kind: "newSave", channels: [...RULE_CHANNELS], ownerId: null },
    conditions: { combinator: "and", rules: [] },
    actions: [{ kind: "addToFolder", folderId: "" }],
  };
}

/** Starting points from the kinds of Rules people ask for most. */
export const RULE_STARTERS: ReadonlyArray<{ title: string; rule: RuleInput }> =
  [
    {
      title: "PDFs to a Folder",
      rule: {
        ...emptyRule(),
        name: "PDFs",
        conditions: {
          combinator: "and",
          rules: [{ field: "format", operator: "some", value: ["pdf"] }],
        },
      },
    },
    {
      title: "A Website to a Folder",
      rule: {
        ...emptyRule(),
        name: "From github.com",
        conditions: {
          combinator: "and",
          rules: [{ field: "url", operator: "contains", value: "github.com" }],
        },
      },
    },
    {
      title: "Videos to a Folder",
      rule: {
        ...emptyRule(),
        name: "Videos",
        conditions: {
          combinator: "and",
          rules: [{ field: "type", operator: "eq", value: "video" }],
        },
      },
    },
  ];

/** The editor keeps an ID on every condition row; stored Rules may not have them. */
export function editableRule(rule: RuleInput): RuleInput {
  return { ...rule, conditions: editableQuery(rule.conditions) };
}

export function newAction(kind: RuleActionKind): RuleAction {
  switch (kind) {
    case "addToFolder":
      return { kind, folderId: "" };
    case "addTags":
      return { kind, tags: [] };
    case "favorite":
      return { kind };
    case "rating":
      return { kind, rating: 3 };
    case "inbox":
      return { kind, state: "review" };
  }
}

export const RULE_ACTION_KINDS = [
  "addToFolder",
  "addTags",
  "favorite",
  "rating",
  "inbox",
] as const satisfies ReadonlyArray<RuleActionKind>;

export const ACTION_LABELS: Record<RuleActionKind, string> = {
  addToFolder: "Add to Folder",
  addTags: "Add Tags",
  favorite: "Favorite",
  rating: "Rate Unrated Saves",
  inbox: "Inbox",
};

export type DraftProblem = "name" | "trigger" | "conditions" | "actions";

/** The first part of a draft that can't be saved yet, in the order the builder shows them. */
export function draftProblem(rule: RuleInput): DraftProblem | null {
  if (!rule.name.trim()) return "name";
  if (rule.trigger.kind === "newSave" && !rule.trigger.channels.length)
    return "trigger";
  if (rule.trigger.kind === "addedToFolder" && !rule.trigger.folderId)
    return "trigger";
  if (!ruleQueryReady(rule.conditions)) return "conditions";
  if (!rule.actions.length) return "actions";
  const incomplete = rule.actions.some(
    (action) =>
      (action.kind === "addToFolder" && !action.folderId) ||
      (action.kind === "addTags" && !action.tags.some((tag) => tag.trim())),
  );
  return incomplete ? "actions" : null;
}

/** The stored form of a draft: compiled conditions and trimmed names. Throws if it isn't complete. */
export function prepareRule(rule: RuleInput): RuleInput {
  return RuleInputSchema.parse({
    ...rule,
    name: rule.name.trim(),
    conditions: compileRuleQuery(rule.conditions),
    actions: rule.actions.map((action) =>
      action.kind === "addTags"
        ? {
            ...action,
            tags: action.tags.map((tag) => tag.trim()).filter(Boolean),
          }
        : action,
    ),
  });
}
