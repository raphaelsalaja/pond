import { expect, it, vi } from "vitest";
import { createSingleFlightTrigger } from "./single-flight";

it("replays a forced trigger that arrives during an active run", async () => {
  let releaseFirst: (() => void) | undefined;
  const firstRun = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const run = vi.fn(async () => {
    if (run.mock.calls.length === 1) {
      await firstRun;
    }
  });
  const trigger = createSingleFlightTrigger(run);

  const initial = trigger(false);
  const forced = trigger(true);
  expect(run).toHaveBeenCalledTimes(1);

  releaseFirst?.();
  await Promise.all([initial, forced]);

  expect(run.mock.calls).toEqual([[false], [true]]);
});
