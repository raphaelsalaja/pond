import type { InboxChannel } from "@pond/schema/inbox";
import type Database from "better-sqlite3";
import { z } from "zod";
import type {
  RuleChange,
  RuleRunEntry,
  RuleRunOutcome,
  RuleStats,
} from "../../../shared/rule-contracts";

/** Runs kept per Rule; history is diagnostic and lives in the index, not the Library. */
const RUNS_PER_RULE = 2000;

/**
 * `rule_intake` holds Saves that arrived while some Rule listened to their
 * capture path and haven't settled yet. `rule_runs` records each Rule that
 * matched a Save, and each failure. Both are index data: a rebuilt index
 * loses them and never re-runs a Rule.
 */
export function ensureRuleTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rule_intake (
      save_id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      owner_id TEXT,
      queued_at INTEGER NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS rule_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT NOT NULL,
      save_id TEXT,
      at INTEGER NOT NULL,
      trigger TEXT NOT NULL,
      outcome TEXT NOT NULL,
      changes TEXT NOT NULL DEFAULT '[]',
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS rule_runs_rule_idx ON rule_runs(rule_id, id);
  `);
}

const IntakeRowSchema = z.object({
  save_id: z.string(),
  channel: z.enum(["captures", "sync", "watches", "imports"]),
  owner_id: z.string().nullable(),
});

const SettledRowSchema = IntakeRowSchema.extend({
  complete: z.number(),
});

export interface IntakeEntry {
  saveId: string;
  channel: InboxChannel;
  ownerId: string | null;
}

export function recordIntake(
  sqlite: Database.Database,
  entries: ReadonlyArray<IntakeEntry>,
  now = Date.now(),
): void {
  if (!entries.length) return;
  const insert = sqlite.prepare(
    `INSERT INTO rule_intake (save_id, channel, owner_id, queued_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(save_id) DO UPDATE SET owner_id = COALESCE(excluded.owner_id, rule_intake.owner_id)`,
  );
  sqlite.transaction(() => {
    for (const entry of entries) {
      insert.run(entry.saveId, entry.channel, entry.ownerId, now);
    }
  })();
}

export interface SettledEntry extends IntakeEntry {
  /** False for a Save that failed or is gone, which Rules leave alone. */
  complete: boolean;
}

/** Intake rows whose Save is no longer downloading, or is gone. */
export function settledIntake(
  sqlite: Database.Database,
  saveIds: ReadonlyArray<string> | null,
  limit = 500,
): Array<SettledEntry> {
  const filter = saveIds
    ? `AND i.save_id IN (SELECT value FROM json_each(@ids))`
    : "";
  const rows = sqlite
    .prepare(
      `SELECT i.save_id, i.channel, i.owner_id,
         (s.status IS 'complete' AND s.deleted_at IS NULL) AS complete
       FROM rule_intake i
       LEFT JOIN saves s ON s.id = i.save_id
       WHERE (s.id IS NULL OR s.status IS NOT 'ingesting') ${filter}
       ORDER BY i.queued_at LIMIT @limit`,
    )
    .all({ ids: JSON.stringify(saveIds ?? []), limit });
  return z
    .array(SettledRowSchema)
    .parse(rows)
    .map((row) => ({
      saveId: row.save_id,
      channel: row.channel,
      ownerId: row.owner_id,
      complete: row.complete === 1,
    }));
}

export function intakeFor(
  sqlite: Database.Database,
  saveId: string,
): IntakeEntry | null {
  const row = IntakeRowSchema.optional().parse(
    sqlite
      .prepare(
        "SELECT save_id, channel, owner_id FROM rule_intake WHERE save_id = ?",
      )
      .get(saveId),
  );
  return row
    ? { saveId: row.save_id, channel: row.channel, ownerId: row.owner_id }
    : null;
}

export function clearIntake(
  sqlite: Database.Database,
  saveIds: ReadonlyArray<string>,
): void {
  if (!saveIds.length) return;
  sqlite
    .prepare(
      "DELETE FROM rule_intake WHERE save_id IN (SELECT value FROM json_each(?))",
    )
    .run(JSON.stringify(saveIds));
}

export interface RunRecord {
  ruleId: string;
  saveId: string | null;
  trigger: string;
  outcome: RuleRunOutcome;
  changes: ReadonlyArray<RuleChange>;
  error?: string | null;
}

export function recordRuns(
  sqlite: Database.Database,
  runs: ReadonlyArray<RunRecord>,
  now = Date.now(),
): void {
  if (!runs.length) return;
  const insert = sqlite.prepare(
    "INSERT INTO rule_runs (rule_id, save_id, at, trigger, outcome, changes, error) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const prune = sqlite.prepare(
    `DELETE FROM rule_runs WHERE rule_id = @rule AND id <= (
       SELECT id FROM rule_runs WHERE rule_id = @rule ORDER BY id DESC LIMIT 1 OFFSET @keep
     )`,
  );
  sqlite.transaction(() => {
    for (const run of runs) {
      insert.run(
        run.ruleId,
        run.saveId,
        now,
        run.trigger,
        run.outcome,
        JSON.stringify(run.changes),
        run.error ?? null,
      );
    }
    for (const ruleId of new Set(runs.map((run) => run.ruleId))) {
      prune.run({ rule: ruleId, keep: RUNS_PER_RULE });
    }
  })();
}

const ChangeSchema: z.ZodType<RuleChange> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("folder"), folderId: z.string() }),
  z.object({ kind: z.literal("tag"), tag: z.string() }),
  z.object({ kind: z.literal("favorite") }),
  z.object({ kind: z.literal("rating"), rating: z.number() }),
  z.object({
    kind: z.literal("inbox"),
    state: z.enum(["review", "processed"]),
  }),
]);

const RunRowSchema = z.object({
  id: z.number(),
  rule_id: z.string(),
  save_id: z.string().nullable(),
  at: z.number(),
  trigger: z.string(),
  outcome: z.enum(["changed", "unchanged", "failed"]),
  changes: z.string(),
  error: z.string().nullable(),
});

function parseChanges(text: string): Array<RuleChange> {
  try {
    return z.array(ChangeSchema).catch([]).parse(JSON.parse(text));
  } catch {
    return [];
  }
}

export function listRuns(
  sqlite: Database.Database,
  ruleId: string,
  limit = 100,
): Array<RuleRunEntry> {
  const rows = z
    .array(RunRowSchema)
    .parse(
      sqlite
        .prepare(
          "SELECT * FROM rule_runs WHERE rule_id = ? ORDER BY id DESC LIMIT ?",
        )
        .all(ruleId, limit),
    );
  return rows.map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    saveId: row.save_id,
    at: row.at,
    trigger: row.trigger,
    outcome: row.outcome,
    changes: parseChanges(row.changes),
    error: row.error,
  }));
}

const StatsRowSchema = z.object({
  rule_id: z.string(),
  last_run_at: z.number().nullable(),
  matched: z.number(),
  changed: z.number(),
  failed: z.number(),
});

const ErrorRowSchema = z.object({
  rule_id: z.string(),
  error: z.string().nullable(),
  at: z.number(),
});

export const EMPTY_STATS: RuleStats = {
  lastRunAt: null,
  matched: 0,
  changed: 0,
  failed: 0,
  lastError: null,
  lastErrorAt: null,
};

/** A Rule's last error shows only while it's newer than its last success. */
export function ruleStats(sqlite: Database.Database): Map<string, RuleStats> {
  const stats = new Map<string, RuleStats>();
  const rows = z.array(StatsRowSchema).parse(
    sqlite
      .prepare(
        `SELECT rule_id, MAX(at) AS last_run_at,
           COUNT(DISTINCT CASE WHEN outcome != 'failed' THEN save_id END) AS matched,
           COUNT(DISTINCT CASE WHEN outcome = 'changed' THEN save_id END) AS changed,
           SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM rule_runs GROUP BY rule_id`,
      )
      .all(),
  );
  for (const row of rows) {
    stats.set(row.rule_id, {
      ...EMPTY_STATS,
      lastRunAt: row.last_run_at,
      matched: row.matched,
      changed: row.changed,
      failed: row.failed,
    });
  }
  const errors = z.array(ErrorRowSchema).parse(
    sqlite
      .prepare(
        `SELECT r.rule_id, r.error, r.at FROM rule_runs r
         WHERE r.outcome = 'failed' AND r.id = (
           SELECT MAX(id) FROM rule_runs WHERE rule_id = r.rule_id
         )`,
      )
      .all(),
  );
  for (const row of errors) {
    const current = stats.get(row.rule_id);
    if (current) {
      stats.set(row.rule_id, {
        ...current,
        lastError: row.error ?? "This Rule failed.",
        lastErrorAt: row.at,
      });
    }
  }
  return stats;
}

/** How many of a Rule's most recent runs failed in a row. */
export function failureStreak(
  sqlite: Database.Database,
  ruleId: string,
  window = 10,
): number {
  const rows = z
    .array(z.object({ outcome: z.string() }))
    .parse(
      sqlite
        .prepare(
          "SELECT outcome FROM rule_runs WHERE rule_id = ? ORDER BY id DESC LIMIT ?",
        )
        .all(ruleId, window),
    );
  let streak = 0;
  for (const row of rows) {
    if (row.outcome !== "failed") break;
    streak += 1;
  }
  return streak;
}

/** Saves split from an arriving post arrived with it, so they wait for the same Rules. */
export function inheritIntake(
  sqlite: Database.Database,
  fromSaveId: string,
  saveIds: ReadonlyArray<string>,
): void {
  if (!saveIds.length) return;
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO rule_intake (save_id, channel, owner_id, queued_at)
       SELECT value, i.channel, i.owner_id, i.queued_at
       FROM rule_intake i, json_each(?) WHERE i.save_id = ?`,
    )
    .run(JSON.stringify(saveIds), fromSaveId);
}
