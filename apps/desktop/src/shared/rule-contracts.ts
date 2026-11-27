import { FIELD_IDS, QuerySchema } from "@pond/schema/filters";
import { isGroup } from "@pond/schema/filters/types";
import type { FieldId, Query } from "@pond/schema/filters/types";
import { INBOX_CHANNELS } from "@pond/schema/inbox";
import type { InboxChannel } from "@pond/schema/inbox";
import { z } from "zod";

export const RULE_CAP = 200;
export const RULE_ACTION_CAP = 20;
const RULE_TAG_CAP = 50;

/** On-device processing fills these after a Save settles, so a Rule would match them only by timing. */
const UNSETTLED_FIELDS: ReadonlySet<FieldId> = new Set<FieldId>([
  "caption",
  "transcript",
  "color",
  "sensitiveContent",
  "modifiedAt",
]);

export const RULE_FIELDS: ReadonlyArray<FieldId> = FIELD_IDS.filter(
  (id) => !UNSETTLED_FIELDS.has(id),
);

function usesRuleFields(query: Query): boolean {
  return query.rules.every((clause) =>
    isGroup(clause)
      ? usesRuleFields(clause)
      : !UNSETTLED_FIELDS.has(clause.field),
  );
}

const RuleConditionsSchema = QuerySchema.refine(usesRuleFields, {
  message: "A Rule can't use fields that on-device processing fills later.",
});

export const RULE_CHANNELS = INBOX_CHANNELS;

export const RULE_CHANNEL_LABELS = {
  captures: "Captures",
  sync: "Sync",
  watches: "Watches",
  imports: "Imports",
} as const satisfies Record<InboxChannel, string>;

const NewSaveTriggerSchema = z.object({
  kind: z.literal("newSave"),
  /** The Inbox capture paths this Rule listens to. */
  channels: z.array(z.enum(INBOX_CHANNELS)).min(1),
  /** An Account or Watch ID, resolved the way Source incoming filing resolves owners; null is any owner. */
  ownerId: z.string().min(1).nullable(),
});

const AddedToFolderTriggerSchema = z.object({
  kind: z.literal("addedToFolder"),
  folderId: z.string().min(1),
  includeSubfolders: z.boolean(),
});

export const RuleTriggerSchema = z.discriminatedUnion("kind", [
  NewSaveTriggerSchema,
  AddedToFolderTriggerSchema,
]);
export type RuleTrigger = z.infer<typeof RuleTriggerSchema>;

export const RULE_INBOX_STATES = ["review", "processed"] as const;
export type RuleInboxState = (typeof RULE_INBOX_STATES)[number];

/** Every action only adds or sets; none removes a Folder, a tag, or a Save. */
export const RuleActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("addToFolder"), folderId: z.string().min(1) }),
  z.object({
    kind: z.literal("addTags"),
    tags: z.array(z.string().trim().min(1).max(200)).min(1).max(RULE_TAG_CAP),
  }),
  z.object({ kind: z.literal("favorite") }),
  /** Rates only Saves that have no rating, so a Rule never overrides yours. */
  z.object({
    kind: z.literal("rating"),
    rating: z.number().int().min(1).max(5),
  }),
  z.object({ kind: z.literal("inbox"), state: z.enum(RULE_INBOX_STATES) }),
]);
export type RuleAction = z.infer<typeof RuleActionSchema>;
export type RuleActionKind = RuleAction["kind"];

export const RuleInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  trigger: RuleTriggerSchema,
  conditions: RuleConditionsSchema,
  actions: z.array(RuleActionSchema).min(1).max(RULE_ACTION_CAP),
});
export type RuleInput = z.infer<typeof RuleInputSchema>;

export const RuleSchema = RuleInputSchema.extend({
  id: z.string().min(1).max(64),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Rule = z.infer<typeof RuleSchema>;

/** One change a Rule made, or would make, to one Save. */
export type RuleChange =
  | { kind: "folder"; folderId: string }
  | { kind: "tag"; tag: string }
  | { kind: "favorite" }
  | { kind: "rating"; rating: number }
  | { kind: "inbox"; state: RuleInboxState };

export type RuleRunOutcome = "changed" | "unchanged" | "failed";

export interface RuleRunEntry {
  id: number;
  ruleId: string;
  saveId: string | null;
  at: number;
  /** `newSave`, `addedToFolder`, or `apply` for Apply to Existing Saves. */
  trigger: string;
  outcome: RuleRunOutcome;
  changes: Array<RuleChange>;
  error: string | null;
}

export interface RuleStats {
  lastRunAt: number | null;
  /** Saves this Rule matched. */
  matched: number;
  /** Saves this Rule actually changed. */
  changed: number;
  failed: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

export interface RuleSummary {
  rule: Rule;
  stats: RuleStats;
  /** Folders the Rule points at that no longer exist. */
  missingFolderIds: Array<string>;
}

export interface FolderAutoTags {
  folderId: string;
  tags: Array<string>;
}

export interface RuleList {
  rules: Array<RuleSummary>;
  /** Entries in `rules.json` this build can't read; they're kept in the file. */
  unreadable: number;
  autoTags: Array<FolderAutoTags>;
}

export interface RuleConditionResult {
  /** Index of the top-level clause in the Rule's conditions. */
  index: number;
  passed: boolean;
}

export interface RuleTestResult {
  trigger: { applies: boolean | null; reason: string };
  conditions: Array<RuleConditionResult>;
  matched: boolean;
  /** What running the Rule now would change. */
  changes: Array<RuleChange>;
  /** Actions the Save already satisfies. */
  already: Array<RuleChange>;
}

export interface RuleActionPreview {
  action: RuleAction;
  wouldChange: number;
  already: number;
}

export interface RulePreview {
  matched: number;
  wouldChange: number;
  actions: Array<RuleActionPreview>;
  sampleIds: Array<string>;
}

export type RuleApplyState =
  | { status: "idle" }
  | {
      status: "running";
      ruleId: string;
      done: number;
      total: number;
      changed: number;
    }
  | {
      status: "finished";
      ruleId: string;
      done: number;
      total: number;
      changed: number;
      cancelled: boolean;
      error: string | null;
      undoId: string | null;
    };

export type RuleWriteResult =
  | { ok: true; rule: Rule }
  | { ok: false; error: string };

export interface RuleQueryInputs {
  "rules.list": Record<string, never>;
  "rules.create": { rule: RuleInput };
  "rules.update": { id: string; rule: RuleInput };
  "rules.setEnabled": { id: string; enabled: boolean };
  "rules.duplicate": { id: string };
  "rules.delete": { id: string };
  "rules.test": { rule: RuleInput; saveId: string };
  "rules.preview": { rule: RuleInput };
  "rules.applyToExisting": { id: string };
  "rules.applyState": Record<string, never>;
  "rules.cancelApply": Record<string, never>;
  "rules.activity": { id: string; limit?: number };
  "rules.searchSaves": { text: string };
}

export interface RuleSavePick {
  id: string;
  title: string;
  url: string;
  source: string;
}

export interface RuleQueryResults {
  "rules.list": RuleList;
  "rules.create": RuleWriteResult;
  "rules.update": RuleWriteResult;
  "rules.setEnabled": RuleWriteResult;
  "rules.duplicate": RuleWriteResult;
  "rules.delete": { ok: true } | { ok: false; error: string };
  "rules.test": RuleTestResult;
  "rules.preview": RulePreview;
  "rules.applyToExisting": { ok: true } | { ok: false; error: string };
  "rules.applyState": RuleApplyState;
  "rules.cancelApply": { ok: true };
  "rules.activity": Array<RuleRunEntry>;
  "rules.searchSaves": Array<RuleSavePick>;
}
