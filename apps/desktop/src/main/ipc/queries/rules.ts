import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import { RuleInputSchema } from "../../../shared/rule-contracts";
import type { Rule, RuleList } from "../../../shared/rule-contracts";
import { listFolders } from "../../core/folders";
import { getPrefs } from "../../core/prefs";
import { EMPTY_STATS, listRuns, ruleStats } from "../../core/rules/ledger";
import {
  createRule,
  deleteRule,
  duplicateRule,
  getRule,
  readRules,
  setRuleEnabled,
  updateRule,
} from "../../core/rules/store";
import { getDb } from "../../db";
import { query } from "./params";

const Id = z.object({ id: z.string().min(1).max(64) });

function written(
  write: () => Rule,
): { ok: true; rule: Rule } | { ok: false; error: string } {
  try {
    return { ok: true, rule: write() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "The Rule couldn't be saved.",
    };
  }
}

function folderIdsOf(rule: Rule): Array<string> {
  const ids = rule.actions.flatMap((action) =>
    action.kind === "addToFolder" ? [action.folderId] : [],
  );
  if (rule.trigger.kind === "addedToFolder") ids.push(rule.trigger.folderId);
  return ids;
}

async function listAll(): Promise<RuleList> {
  const shelf = readRules();
  const stats = ruleStats((await getDb()).$raw);
  const folders = new Set((await listFolders()).map((folder) => folder.id));
  const prefs = await getPrefs();
  return {
    rules: shelf.rules.map((rule) => ({
      rule,
      stats: stats.get(rule.id) ?? EMPTY_STATS,
      missingFolderIds: folderIdsOf(rule).filter((id) => !folders.has(id)),
    })),
    unreadable: shelf.unreadable.length,
    autoTags: Object.entries(prefs.folderRules)
      .filter(([id, rule]) => folders.has(id) && rule.automaticTags.length)
      .map(([folderId, rule]) => ({ folderId, tags: rule.automaticTags })),
  };
}

export const rulesQueries = {
  "rules.list": query(z.object({}), listAll),
  "rules.create": query(z.object({ rule: RuleInputSchema }), ({ rule }) =>
    written(() => createRule(rule)),
  ),
  "rules.update": query(Id.extend({ rule: RuleInputSchema }), ({ id, rule }) =>
    written(() => updateRule(id, rule)),
  ),
  "rules.setEnabled": query(
    Id.extend({ enabled: z.boolean() }),
    ({ id, enabled }) => written(() => setRuleEnabled(id, enabled)),
  ),
  "rules.duplicate": query(Id, ({ id }) => written(() => duplicateRule(id))),
  "rules.delete": query(Id, ({ id }): QueryResult<"rules.delete"> => {
    try {
      deleteRule(id);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The Rule couldn't be deleted.",
      };
    }
  }),
  "rules.test": query(
    z.object({ rule: RuleInputSchema, saveId: z.string().min(1) }),
    async ({ rule, saveId }) => {
      const { testRule } = await import("../../core/rules/inspect");
      return testRule(rule, saveId);
    },
  ),
  "rules.preview": query(
    z.object({ rule: RuleInputSchema }),
    async ({ rule }) => {
      const { previewRule } = await import("../../core/rules/inspect");
      return previewRule(rule);
    },
  ),
  "rules.applyToExisting": query(
    Id,
    async ({ id }): Promise<QueryResult<"rules.applyToExisting">> => {
      const rule = getRule(id);
      if (!rule) return { ok: false, error: "That Rule no longer exists." };
      const { startApplyJob } = await import("../../core/rules/apply-job");
      return startApplyJob(rule);
    },
  ),
  "rules.applyState": query(z.object({}), async () => {
    const { applyState } = await import("../../core/rules/apply-job");
    return applyState();
  }),
  "rules.cancelApply": query(z.object({}), async () => {
    const { cancelApplyJob } = await import("../../core/rules/apply-job");
    cancelApplyJob();
    return { ok: true as const };
  }),
  "rules.activity": query(
    Id.extend({ limit: z.number().int().min(1).max(500).optional() }),
    async ({ id, limit }) => listRuns((await getDb()).$raw, id, limit),
  ),
  "rules.searchSaves": query(
    z.object({ text: z.string().max(200) }),
    async ({ text }) => {
      const { searchSaves } = await import("../../core/rules/inspect");
      return searchSaves(text);
    },
  ),
};
