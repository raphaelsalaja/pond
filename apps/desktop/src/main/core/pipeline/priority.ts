import type { Task } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import { z } from "zod";

const INTERACTIVE_PRIORITY = "interactive";

export const TaskPayloadSchema = z
  .looseObject({
    priority: z.string().optional(),
    force: z.boolean().optional(),
  })
  .catch({});

export type TaskPayload = z.infer<typeof TaskPayloadSchema>;

export function isInteractiveTrigger(trigger: string | undefined): boolean {
  if (!trigger) return true;
  if (trigger.startsWith("sync:")) return false;
  if (trigger.startsWith("watch:")) return false;
  if (trigger.startsWith("pipeline:")) return false;
  if (trigger.startsWith("enqueue:")) return false;
  if (trigger.startsWith("user:import")) return false;
  if (trigger === "cron" || trigger === "manual") return false;
  return true;
}

export type TaskWithPayload = Pick<Task, "payload">;

export function isInteractiveTask(task: TaskWithPayload): boolean {
  return (
    TaskPayloadSchema.parse(task.payload).priority === INTERACTIVE_PRIORITY
  );
}

export function withInteractivePriority(payload: TaskPayload = {}): JsonValue {
  return {
    ...payload,
    priority: INTERACTIVE_PRIORITY,
  };
}

export function canDispatchTask(input: {
  interactive: boolean;
  paused: boolean;
  inflightGlobal: number;
  inflightInteractive: number;
  inflightForOp: number;
  opCap: number;
  backgroundCap: number;
  interactiveCap: number;
}): boolean {
  if (input.interactive) {
    return input.inflightInteractive < input.interactiveCap;
  }
  if (input.paused) return false;
  const backgroundInflight = input.inflightGlobal - input.inflightInteractive;
  if (backgroundInflight >= input.backgroundCap) return false;
  if (input.inflightForOp >= input.opCap) return false;
  return true;
}
