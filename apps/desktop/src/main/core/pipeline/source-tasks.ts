import type { Op } from "@pond/schema/db";

export const SOURCE_TASK_OPS: readonly Op[] = [
  "harvest_metadata",
  "capture_tweet",
  "archive_page",
];

export function isSourceTask(op: Op): boolean {
  return SOURCE_TASK_OPS.includes(op);
}
