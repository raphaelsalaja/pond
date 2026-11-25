export type SingleFlightTrigger = (force?: boolean) => Promise<void>;

export function createSingleFlightTrigger(
  run: (force: boolean) => Promise<void>,
): SingleFlightTrigger {
  let active: Promise<void> | null = null;
  let forcedReplayPending = false;

  const drain = async (initialForce: boolean): Promise<void> => {
    let force = initialForce;
    while (true) {
      forcedReplayPending = false;
      await run(force);
      if (!forcedReplayPending) return;
      force = true;
    }
  };

  return (force = false) => {
    if (active) {
      forcedReplayPending ||= force;
      return active;
    }
    active = drain(force).finally(() => {
      active = null;
    });
    return active;
  };
}
