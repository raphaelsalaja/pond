import type { SyncAction } from "@pond/schema/db";
import { z } from "zod";
import { schedule } from "../../lib/scheduler";

const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Sources import in bursts and tag Saves after insert, so routines wait for a batch to settle. */
const NEW_SAVE_SETTLE_MS = 90_000;
/** A Save enters review on capture, when its snooze ends, or when someone adds it to the Inbox. */
const EntersReviewSchema = z.object({ inboxState: z.literal("review") });

export function startFishRoutines(runtime: {
  onSyncAction(listener: (action: SyncAction) => void): () => void;
}): void {
  schedule({
    name: "fish-routines",
    every: CHECK_EVERY_MS,
    initialDelay: 60_000,
    fn: async () => (await import("./routines")).runDueRoutines(),
  });
  const created = new Set<string>();
  const reviewing = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  runtime.onSyncAction((action) => {
    if (action.modelName !== "save" || action.actor === "agent") return;
    const entersReview =
      (action.action === "I" || action.action === "U") &&
      EntersReviewSchema.safeParse(action.data).success;
    if (action.action === "I") created.add(action.modelId);
    else if (!entersReview) return;
    if (entersReview) reviewing.add(action.modelId);
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const saveIds = [...created];
      const inboxIds = [...reviewing];
      created.clear();
      reviewing.clear();
      void import("./routines").then(async (routines) => {
        if (saveIds.length) await routines.runNewSaveRoutines(saveIds);
        if (inboxIds.length) await routines.runInboxRoutines(inboxIds);
      });
    }, NEW_SAVE_SETTLE_MS);
    timer.unref();
  });
}
