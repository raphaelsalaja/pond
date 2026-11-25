import { expect, it } from "vitest";
import { createSingleFlightTrigger } from "./single-flight";

it("replays a forced trigger that arrives during an active run", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const calls: Array<boolean> = [];
  const trigger = createSingleFlightTrigger(async (force) => {
    calls.push(force);
    if (calls.length === 1) {
      await firstRun;
    }
  });

  const initial = trigger(false);
  const forced = trigger(true);
  expect(calls).toHaveLength(1);

  releaseFirst?.();
  await Promise.all([initial, forced]);

  expect(calls).toEqual([false, true]);
});
