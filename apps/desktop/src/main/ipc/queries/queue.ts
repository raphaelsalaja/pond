import { SOURCE_GATE_REASONS, SOURCES } from "@pond/schema/db";
import { syncConfigFor } from "@pond/schema/sources";
import { z } from "zod";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import { QueueAttemptSchema } from "../../../shared/queue-contracts";
import {
  createRetryGeneration,
  listQueueGenerations,
  setQueueGenerationPaused,
} from "../../core/pipeline/queue-generations";
import { readQueueSummary } from "../../core/pipeline/queue-summary";
import { pauseSource, resumeSource } from "../../core/pipeline/rate-governor";
import { cancelGeneration } from "../../core/pipeline/reconciler-client";
import { getDb } from "../../db";
import { type QueryHandlerMap, query } from "./params";

const GateRowSchema = z.object({
  source: z.enum(SOURCES),
  state: z.enum(["closed", "open", "half_open", "paused"]),
  reason: z.enum(SOURCE_GATE_REASONS).nullable(),
  retryAt: z.number().nullable(),
  probeLeaseToken: z.string().nullable(),
});

const CountRowSchema = z.object({
  hourly: z.number(),
  daily: z.number(),
});

const StringId = z.string().trim().min(1);

const AttemptPayloadSchema = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "Malformed attempt payload." });
      return z.NEVER;
    }
  })
  .pipe(z.json());

const GENERATION_FINISHED: OkFailure = {
  ok: false,
  error: "This queue run has already finished.",
};

export const queueQueries = {
  "queue.summary": query(z.object({}), () => readQueueSummary()),

  "queue.sourceGates": query(z.object({}), async () => {
    const db = await getDb();
    const at = Date.now();
    const gates = z.array(GateRowSchema).parse(
      db.$raw
        .prepare(
          `SELECT
            source,
            state,
            reason,
            retry_at AS retryAt,
            probe_lease_token AS probeLeaseToken
          FROM source_gates
          WHERE state != 'closed'
          ORDER BY updated_at DESC`,
        )
        .all(),
    );
    const count = db.$raw.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN requested_at >= ? THEN permits ELSE 0 END), 0) AS hourly,
        COALESCE(SUM(permits), 0) AS daily
      FROM source_request_ledger
      WHERE source = ? AND requested_at >= ?`,
    );
    return gates.map((gate) => {
      const profile = syncConfigFor(gate.source).rate;
      const counts = CountRowSchema.parse(
        count.get(at - 60 * 60_000, gate.source, at - 24 * 60 * 60_000),
      );
      return {
        source: gate.source,
        state: gate.state,
        reason: gate.reason,
        retryAt: gate.retryAt,
        remainingHourly: Math.max(0, profile.maxPerHour - counts.hourly),
        remainingDaily: Math.max(0, profile.maxPerDay - counts.daily),
        recoveryProbe:
          gate.state === "half_open" && gate.probeLeaseToken != null,
      };
    });
  }),

  "queue.generations": query(z.object({}), () => listQueueGenerations()),

  "queue.attempts": query(
    z.object({
      saveId: StringId,
      limit: z.number().int().min(1).max(200).optional().default(50),
    }),
    async ({ saveId, limit }) => {
      const db = await getDb();
      return z
        .array(QueueAttemptSchema.extend({ payload: AttemptPayloadSchema }))
        .parse(
          db.$raw
            .prepare(
              `SELECT
                id,
                ts,
                kind,
                op,
                outcome,
                duration_ms AS durationMs,
                attempts,
                error_name AS errorName,
                error_message AS errorMessage,
                json(payload) AS payload
              FROM pipeline_events
              WHERE
                (
                  save_id = ?
                  AND kind IN ('pipeline.task.completed', 'pipeline.task.attempt')
                )
                OR (
                  kind = 'pipeline.source-gate.transition'
                  AND source = (SELECT source FROM saves WHERE id = ?)
                )
              ORDER BY ts DESC, id DESC
              LIMIT ?`,
            )
            .all(saveId, saveId, limit),
        );
    },
  ),

  "queue.retry": query(
    z.object({ ids: z.array(StringId).optional() }),
    ({ ids }) => createRetryGeneration(ids),
  ),
  "queue.generation.pause": query(z.object({ id: StringId }), async ({ id }) =>
    (await setQueueGenerationPaused(id, true))
      ? { ok: true as const }
      : GENERATION_FINISHED,
  ),
  "queue.generation.resume": query(
    z.object({ id: StringId }),
    async ({ id }) =>
      (await setQueueGenerationPaused(id, false))
        ? { ok: true as const }
        : GENERATION_FINISHED,
  ),
  "queue.generation.cancel": query(
    z.object({ id: StringId }),
    async ({ id }) => ({ ok: true, running: await cancelGeneration(id) }),
  ),
  "queue.source.resume": query(
    z.object({ source: z.enum(SOURCES) }),
    ({ source }) => {
      resumeSource(source);
      return { ok: true };
    },
  ),
  "queue.source.pause": query(
    z.object({ source: z.enum(SOURCES) }),
    ({ source }) => {
      pauseSource(source);
      return { ok: true };
    },
  ),
} satisfies QueryHandlerMap;
