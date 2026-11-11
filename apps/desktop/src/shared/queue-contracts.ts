import { SOURCES } from "@pond/schema/db";
import { z } from "zod";
import type { EmptyInput, OkResult } from "./query-contracts-shared";

export const QueueSummarySchema = z.object({
  running: z.number(),
  waiting: z.number(),
  parked: z.number(),
  failed: z.number(),
  cancelled: z.number(),
  dead: z.number(),
  actionable: z.number(),
});
export type QueueSummary = z.infer<typeof QueueSummarySchema>;

export const QueueSourceGateSchema = z.object({
  source: z.enum(SOURCES),
  state: z.enum(["closed", "open", "half_open", "paused"]),
  reason: z
    .enum([
      "rate_limit",
      "transient_failures",
      "at_risk",
      "manual",
      "global_pause",
    ])
    .nullable(),
  retryAt: z.number().nullable(),
  remainingHourly: z.number(),
  remainingDaily: z.number(),
  maxPerHour: z.number(),
  maxPerDay: z.number(),
  recoveryProbe: z.boolean(),
});
export type QueueSourceGate = z.infer<typeof QueueSourceGateSchema>;

export const QueueGenerationSchema = z.object({
  id: z.string(),
  kind: z.enum(["retry", "sync", "refresh"]),
  status: z.enum(["active", "paused", "cancelling", "cancelled", "done"]),
  source: z.enum(SOURCES).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().nullable(),
  total: z.number(),
  pending: z.number(),
  deferred: z.number(),
  running: z.number(),
  done: z.number(),
  blocked: z.number(),
  dead: z.number(),
  cancelled: z.number(),
});
export type QueueGeneration = z.infer<typeof QueueGenerationSchema>;

export const QueueAttemptSchema = z.object({
  id: z.number(),
  ts: z.number(),
  kind: z.enum([
    "pipeline.task.completed",
    "pipeline.task.attempt",
    "pipeline.source-gate.transition",
  ]),
  op: z.string().nullable(),
  outcome: z.string(),
  durationMs: z.number().nullable(),
  attempts: z.number().nullable(),
  errorName: z.string().nullable(),
  errorMessage: z.string().nullable(),
  payload: z.unknown(),
});
export type QueueAttempt = z.infer<typeof QueueAttemptSchema>;

export interface QueueQueryInputs {
  "queue.summary": EmptyInput;
  "queue.sourceGates": EmptyInput;
  "queue.generations": EmptyInput;
  "queue.attempts": { saveId: string; limit?: number };
  "queue.retry": { ids?: string[] };
  "queue.generation.pause": { id: string };
  "queue.generation.resume": { id: string };
  "queue.generation.cancel": { id: string };
  "queue.source.pause": {
    source: z.infer<typeof QueueSourceGateSchema>["source"];
  };
  "queue.source.resume": {
    source: z.infer<typeof QueueSourceGateSchema>["source"];
  };
}

export interface QueueQueryResults {
  "queue.summary": QueueSummary;
  "queue.sourceGates": QueueSourceGate[];
  "queue.generations": QueueGeneration[];
  "queue.attempts": QueueAttempt[];
  "queue.retry": {
    generationId: string | null;
    queued: number;
    sources: Partial<
      Record<z.infer<typeof QueueSourceGateSchema>["source"], number>
    >;
  };
  "queue.generation.pause": OkResult;
  "queue.generation.resume": OkResult;
  "queue.generation.cancel": OkResult<{ running: number }>;
  "queue.source.pause": OkResult;
  "queue.source.resume": OkResult;
}
