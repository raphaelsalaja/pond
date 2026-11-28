import type { Transaction } from "@pond/schema/tx";
import log from "electron-log/main.js";
import type { Rule, RuleApplyState } from "../../../shared/rule-contracts";
import { getDb } from "../../db";
import { libraryRoot } from "../../paths";
import { applyRules, recordRunForUndo } from "./engine";
import { allMatchingIds } from "./inspect";
import { recordRuns } from "./ledger";
import { ruleReason, runRecords } from "./records";

const CHUNK = 200;

let state: RuleApplyState = { status: "idle" };
let controller: AbortController | null = null;

export function applyState(): RuleApplyState {
  return state;
}

export function cancelApplyJob(): void {
  controller?.abort();
}

function pause(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 25);
  });
}

/**
 * Applies a Rule to every live Save that matches its conditions, one chunk
 * at a time. Cancelling stops between chunks and keeps what was applied;
 * running it again only does the rest, because finished Saves plan no changes.
 * The whole run is one Undo step.
 */
export function startApplyJob(
  rule: Rule,
): { ok: true } | { ok: false; error: string } {
  if (state.status === "running") {
    return { ok: false, error: "A Rule is already being applied." };
  }
  const current = new AbortController();
  controller = current;
  state = { status: "running", ruleId: rule.id, done: 0, total: 0, changed: 0 };
  void run(rule, current.signal);
  return { ok: true };
}

async function run(rule: Rule, signal: AbortSignal): Promise<void> {
  const library = libraryRoot();
  const written: Array<Transaction> = [];
  let done = 0;
  let total = 0;
  let changed = 0;
  let error: string | null = null;
  try {
    const db = await getDb();
    const ids = allMatchingIds(db, rule.conditions);
    total = ids.length;
    state = { status: "running", ruleId: rule.id, done, total, changed };
    for (let offset = 0; offset < ids.length; offset += CHUNK) {
      if (signal.aborted || libraryRoot() !== library) break;
      const chunk = ids.slice(offset, offset + CHUNK);
      const result = await applyRules(new Map([[rule, chunk]]), ruleReason);
      written.push(...result.transactions);
      recordRuns((await getDb()).$raw, runRecords(result, "apply"));
      done += chunk.length;
      changed += result.outcomes.filter(
        (outcome) => outcome.changes.length,
      ).length;
      state = { status: "running", ruleId: rule.id, done, total, changed };
      await pause();
    }
  } catch (cause) {
    log.warn("[pond rules] applying to existing Saves failed", rule.id, cause);
    error =
      cause instanceof Error ? cause.message : "The Rule couldn't be applied.";
  }
  const undoId = libraryRoot() === library ? recordRunForUndo(written) : null;
  state = {
    status: "finished",
    ruleId: rule.id,
    done,
    total,
    changed,
    cancelled: signal.aborted,
    error,
    undoId,
  };
  if (controller?.signal === signal) controller = null;
}
