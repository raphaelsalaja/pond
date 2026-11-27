import type { SyncAction } from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import type { Rule } from "../../../shared/rule-contracts";
import { getDb } from "../../db";
import { registerSyncActionListener } from "../executor";
import { listFolders } from "../folders";
import { notificationLog } from "../notifications";
import { applyRules, folderTree, ruleListens } from "./engine";
import type { RuleEvent, RunResult } from "./engine";
import {
  clearIntake,
  failureStreak,
  recordRuns,
  settledIntake,
} from "./ledger";
import { isRuleChange, ruleReason, runRecords } from "./records";
import { listRules } from "./store";

/** Rules are cheap and people expect filing to feel immediate, unlike Routines' 90 s settle. */
const SETTLE_MS = 2000;
const STREAK_TO_NOTIFY = 5;
function notificationId(ruleId: string): string {
  return `rules:${ruleId}`;
}

async function updateNotifications(
  rules: ReadonlyArray<Rule>,
  result: RunResult,
): Promise<void> {
  const sqlite = (await getDb()).$raw;
  const touched = new Set([
    ...result.outcomes.map((outcome) => outcome.ruleId),
    ...result.failures.map((failure) => failure.ruleId),
  ]);
  for (const ruleId of touched) {
    const rule = rules.find((candidate) => candidate.id === ruleId);
    if (!rule) continue;
    const streak = failureStreak(sqlite, ruleId);
    if (streak >= STREAK_TO_NOTIFY) {
      const failure = result.failures.find((entry) => entry.ruleId === ruleId);
      await notificationLog.post({
        id: notificationId(ruleId),
        kind: "attention",
        priority: true,
        title: `The Rule “${rule.name}” keeps failing`,
        body: failure?.error ?? "Open Rules to see what went wrong.",
        target: { type: "settings", section: "rules" },
      });
    } else if (streak === 0) {
      await notificationLog.resolve([notificationId(ruleId)]);
    }
  }
}

/** Runs every enabled Rule whose trigger answers one of these events. */
export async function runRuleEvents(
  events: ReadonlyArray<RuleEvent>,
): Promise<RunResult | null> {
  if (!events.length) return null;
  const rules = listRules().filter((rule) => rule.enabled);
  if (!rules.length) return null;
  const tree = folderTree(await listFolders());
  const candidates = new Map<Rule, Array<string>>();
  for (const rule of rules) {
    const ids = events.flatMap((event) =>
      ruleListens(rule, event, tree) ? [event.saveId] : [],
    );
    if (ids.length) candidates.set(rule, [...new Set(ids)]);
  }
  if (!candidates.size) return null;
  const result = await applyRules(candidates, ruleReason);
  const kind = events[0]?.kind ?? "newSave";
  recordRuns((await getDb()).$raw, runRecords(result, kind));
  await updateNotifications(rules, result).catch((cause: unknown) =>
    log.warn("[pond rules] updating notifications failed", cause),
  );
  return result;
}

let chain: Promise<void> = Promise.resolve();

function serialize(work: () => Promise<void>): Promise<void> {
  chain = chain.then(work).catch((cause: unknown) => {
    log.warn("[pond rules] run failed", cause);
  });
  return chain;
}

/** Runs Rules for every waiting Save that finished downloading, in arrival order. Failed Saves leave the queue without a run. */
export function drainSettledSaves(): Promise<void> {
  return serialize(async () => {
    const sqlite = (await getDb()).$raw;
    for (;;) {
      const entries = settledIntake(sqlite, null, 200);
      if (!entries.length) return;
      try {
        await runRuleEvents(
          entries.flatMap((entry): Array<RuleEvent> =>
            entry.complete
              ? [
                  {
                    kind: "newSave",
                    saveId: entry.saveId,
                    channel: entry.channel,
                    ownerId: entry.ownerId,
                  },
                ]
              : [],
          ),
        );
      } finally {
        clearIntake(
          sqlite,
          entries.map((entry) => entry.saveId),
        );
      }
    }
  });
}

const SettledSchema = z.object({
  status: z.enum(["complete", "failed"]),
});

const FoldersSchema = z.object({ folderIds: z.array(z.string()) });

let listening = false;
let settleTimer: NodeJS.Timeout | undefined;
let folderTimer: NodeJS.Timeout | undefined;
const folderEvents = new Map<string, Set<string>>();

export function scheduleDrain(): void {
  if (settleTimer) return;
  settleTimer = setTimeout(() => {
    settleTimer = undefined;
    void drainSettledSaves();
  }, SETTLE_MS);
  settleTimer.unref();
}

function scheduleFolderEvents(): void {
  if (folderTimer) return;
  folderTimer = setTimeout(() => {
    folderTimer = undefined;
    const events: Array<RuleEvent> = [...folderEvents].map(([saveId, ids]) => ({
      kind: "addedToFolder",
      saveId,
      folderIds: [...ids],
    }));
    folderEvents.clear();
    void serialize(async () => {
      await runRuleEvents(events);
    });
  }, SETTLE_MS);
  folderTimer.unref();
}

/**
 * Rules answer two events: a Save settling, and a Save entering a folder.
 * Changes Rules make never count as either, so Rules can't loop.
 */
export function onSyncAction(action: SyncAction): void {
  if (action.modelName === "save") {
    if (action.action !== "I" && action.action !== "U") return;
    if (SettledSchema.safeParse(action.data).success) scheduleDrain();
    return;
  }
  if (action.modelName !== "save_folder" || action.action !== "U") return;
  if (isRuleChange(action)) return;
  const next = FoldersSchema.safeParse(action.data);
  if (!next.success) return;
  const previous = FoldersSchema.safeParse(action.prevData);
  const before = new Set(previous.success ? previous.data.folderIds : []);
  const added = next.data.folderIds.filter((id) => !before.has(id));
  if (!added.length) return;
  const pending = folderEvents.get(action.modelId) ?? new Set<string>();
  for (const id of added) pending.add(id);
  folderEvents.set(action.modelId, pending);
  scheduleFolderEvents();
}

/** Starts Rules for the open Library: moves old Source filing over once, then catches up on Saves that settled while Pond was closed. */
export async function startRules(): Promise<void> {
  if (!listening) {
    listening = true;
    registerSyncActionListener(onSyncAction);
  }
  const { migrateIncomingRules } = await import("./migrate-incoming");
  await migrateIncomingRules().catch((cause: unknown) =>
    log.warn("[pond rules] moving Source filing into Rules failed", cause),
  );
  await drainSettledSaves();
}

export function stopRules(): void {
  if (settleTimer) clearTimeout(settleTimer);
  if (folderTimer) clearTimeout(folderTimer);
  settleTimer = undefined;
  folderTimer = undefined;
  folderEvents.clear();
  void import("./apply-job").then((module) => module.cancelApplyJob());
}
