import { saves } from "@pond/schema/db";
import { buildWhere } from "@pond/schema/filters";
import type { Query } from "@pond/schema/filters";
import { and, desc, isNull, or, sql } from "drizzle-orm";
import type {
  RuleActionPreview,
  RuleInput,
  RulePreview,
  RuleSavePick,
  RuleTestResult,
} from "../../../shared/rule-contracts";
import { RULE_CHANNEL_LABELS } from "../../../shared/rule-contracts";
import { getDb } from "../../db";
import type { Db } from "../../db";
import { listFolders } from "../folders";
import { folderTree, loadTargets, matchingSaveIds } from "./engine";
import { intakeFor } from "./ledger";
import { planActions } from "./plan";

const SAMPLE = 60;
const PAGE = 1000;

/** Every live Save matching `conditions`, in newest-first order. */
export function allMatchingIds(db: Db, conditions: Query): Array<string> {
  const where = buildWhere(conditions);
  return db
    .select({ id: saves.id })
    .from(saves)
    .where(and(isNull(saves.deletedAt), where))
    .orderBy(desc(saves.savedAt))
    .all()
    .map((row) => row.id);
}

/** Dry run against one Save. Nothing is written. */
export async function testRule(
  rule: RuleInput,
  saveId: string,
): Promise<RuleTestResult> {
  const db = await getDb();
  const tree = folderTree(await listFolders());
  const conditions = rule.conditions.rules.map((clause, index) => ({
    index,
    passed: matchingSaveIds(db, { combinator: "and", rules: [clause] }, [
      saveId,
    ]).has(saveId),
  }));
  const matched = matchingSaveIds(db, rule.conditions, [saveId]).has(saveId);
  const target = loadTargets(db, [saveId]).get(saveId);
  if (!target) throw new Error("That Save no longer exists.");
  const plan = planActions(rule.actions, target, (id) => tree.exists(id));
  return {
    trigger: describeTrigger(db, rule, saveId, target.folderIds, tree),
    conditions,
    matched,
    changes: plan.changes,
    already: plan.already,
  };
}

function describeTrigger(
  db: Db,
  rule: RuleInput,
  saveId: string,
  folderIds: ReadonlyArray<string>,
  tree: ReturnType<typeof folderTree>,
): RuleTestResult["trigger"] {
  if (rule.trigger.kind === "addedToFolder") {
    const { folderId, includeSubfolders } = rule.trigger;
    const inside = folderIds.some((id) =>
      includeSubfolders ? tree.lineage(id).includes(folderId) : id === folderId,
    );
    return inside
      ? { applies: true, reason: "This Save is in the folder now." }
      : {
          applies: false,
          reason:
            "This Save isn't in the folder, so the Rule would run when it's added.",
        };
  }
  const intake = intakeFor(db.$raw, saveId);
  if (!intake) {
    return {
      applies: null,
      reason:
        "Pond only knows how a Save arrived while it's downloading, so only the conditions are checked.",
    };
  }
  const channel = rule.trigger.channels.includes(intake.channel);
  const owner =
    !rule.trigger.ownerId || rule.trigger.ownerId === intake.ownerId;
  return {
    applies: channel && owner,
    reason: !channel
      ? `It arrived through ${RULE_CHANNEL_LABELS[intake.channel]}, which this Rule doesn't listen to.`
      : owner
        ? `It arrived through ${RULE_CHANNEL_LABELS[intake.channel]}.`
        : "It arrived from a different Account or Watch.",
  };
}

/** Dry run against the whole Library. Nothing is written. */
export async function previewRule(rule: RuleInput): Promise<RulePreview> {
  const db = await getDb();
  const tree = folderTree(await listFolders());
  const ids = allMatchingIds(db, rule.conditions);
  const counts = rule.actions.map((action): RuleActionPreview => ({
    action,
    wouldChange: 0,
    already: 0,
  }));
  let wouldChange = 0;
  for (let offset = 0; offset < ids.length; offset += PAGE) {
    const targets = loadTargets(db, ids.slice(offset, offset + PAGE));
    for (const target of targets.values()) {
      let changed = false;
      for (const [index, action] of rule.actions.entries()) {
        const plan = planActions([action], target, (id) => tree.exists(id));
        const entry = counts[index];
        if (!entry) continue;
        if (plan.changes.length) {
          entry.wouldChange += 1;
          changed = true;
        } else if (plan.already.length) {
          entry.already += 1;
        }
      }
      if (changed) wouldChange += 1;
    }
  }
  return {
    matched: ids.length,
    wouldChange,
    actions: counts,
    sampleIds: ids.slice(0, SAMPLE),
  };
}

/** A short title search so the Rules page can pick a Save to test against. */
export async function searchSaves(text: string): Promise<Array<RuleSavePick>> {
  const db = await getDb();
  const term = text.trim();
  const pattern = `%${term.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const rows = db
    .select({
      id: saves.id,
      title: saves.title,
      url: saves.url,
      source: saves.source,
    })
    .from(saves)
    .where(
      and(
        isNull(saves.deletedAt),
        term
          ? or(
              sql`${saves.title} LIKE ${pattern} ESCAPE '\\'`,
              sql`${saves.url} LIKE ${pattern} ESCAPE '\\'`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(saves.savedAt))
    .limit(20)
    .all();
  return rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || row.url,
    url: row.url,
    source: row.source,
  }));
}
