import type { SyncAction } from "@pond/schema/db";
import type { RunResult } from "./engine";
import type { RunRecord } from "./ledger";

const RULE_REASON = "rule:";

export function ruleReason(ruleIds: ReadonlyArray<string>): string {
  return `${RULE_REASON}${ruleIds.join(",")}`;
}

export function isRuleChange(action: Pick<SyncAction, "actorReason">): boolean {
  return action.actorReason?.startsWith(RULE_REASON) ?? false;
}

export function runRecords(
  result: RunResult,
  trigger: string,
): Array<RunRecord> {
  return [
    ...result.outcomes.map((outcome): RunRecord => ({
      ruleId: outcome.ruleId,
      saveId: outcome.saveId,
      trigger,
      outcome: outcome.changes.length ? "changed" : "unchanged",
      changes: outcome.changes,
      error: outcome.skipped[0] ?? null,
    })),
    ...result.failures.map((failure): RunRecord => ({
      ruleId: failure.ruleId,
      saveId: failure.saveId,
      trigger,
      outcome: "failed",
      changes: [],
      error: failure.error,
    })),
  ];
}
