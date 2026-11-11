import type { Source } from "@pond/schema/db";
import { syncConfigFor } from "@pond/schema/sources";
import type { QueueSourceGate } from "@shared/queue-contracts";

interface StoredSourceGate {
  source: Source;
  state: QueueSourceGate["state"];
  reason: QueueSourceGate["reason"];
  retryAt: number | null;
  probeLeaseToken: string | null;
}

interface SourceRequestUsage {
  source: Source;
  hourly: number;
  daily: number;
}

function summarize(
  gate: StoredSourceGate,
  usage: SourceRequestUsage | undefined,
): QueueSourceGate {
  const rate = syncConfigFor(gate.source).rate;
  return {
    source: gate.source,
    state: gate.state,
    reason: gate.reason,
    retryAt: gate.retryAt,
    remainingHourly: Math.max(0, rate.maxPerHour - (usage?.hourly ?? 0)),
    remainingDaily: Math.max(0, rate.maxPerDay - (usage?.daily ?? 0)),
    maxPerHour: rate.maxPerHour,
    maxPerDay: rate.maxPerDay,
    recoveryProbe: gate.state === "half_open" && gate.probeLeaseToken != null,
  };
}

/** A closed gate still holds work back once its source spends the hourly or daily request budget, so those sources are listed too. */
export function summarizeSourceGates(
  gates: readonly StoredSourceGate[],
  usage: readonly SourceRequestUsage[],
): QueueSourceGate[] {
  const bySource = new Map(usage.map((row) => [row.source, row]));
  const listed = new Set(gates.map((gate) => gate.source));
  const capped = usage
    .filter((row) => !listed.has(row.source))
    .map((row) =>
      summarize(
        {
          source: row.source,
          state: "closed",
          reason: null,
          retryAt: null,
          probeLeaseToken: null,
        },
        row,
      ),
    )
    .filter((gate) => gate.remainingHourly === 0 || gate.remainingDaily === 0);
  return [
    ...gates.map((gate) => summarize(gate, bySource.get(gate.source))),
    ...capped,
  ];
}
