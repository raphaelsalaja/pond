import { Badge, Empty, Switch } from "@pond/ui";
import type { FishRoutine, FishSummary } from "@shared/fish-contracts";
import { describeWhen, isRoutineDue } from "@shared/fish-routine";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { routineItems, setRoutinePaused } from "../../../lib/menu";
import { useNow } from "../../../lib/use-now";
import styles from "./styles.module.css";

/**
 * Presence says the fish is busy, not which routine; a due routine is the one it picked up. Only what
 * needs noticing shows: a run in progress or a failed one.
 */
function RunLine({
  fish,
  routine,
  now,
}: {
  fish: FishSummary;
  routine: FishRoutine;
  now: Date;
}) {
  const running =
    Boolean(fish.activity) && isRoutineDue(routine, now.getTime());
  const failed = !running && routine.lastRun?.status === "failed";
  if (!running && !failed) return null;
  return (
    <span className={styles.run} data-tone={failed ? "error" : undefined}>
      <Badge.Dot tone={running ? "accent" : "negative"} live={running} />
      {running ? "Running" : "Last run failed"}
    </span>
  );
}

export function RoutineList({
  fish,
  onEditRoutine,
}: {
  fish: FishSummary;
  onEditRoutine?: (routine: FishRoutine) => void;
}) {
  const now = useNow();
  if (!fish.routines.length)
    return (
      <Empty.Root size="inline" variant="dashed">
        <Empty.Description>No Routines Yet</Empty.Description>
      </Empty.Root>
    );
  return (
    <ul className={styles.list}>
      {fish.routines.map((routine) => (
        <SpecContextMenu
          key={routine.id}
          buildItems={() => routineItems(fish, routine, onEditRoutine)}
        >
          <li className={styles.row}>
            <span className={styles.text}>
              <span className={styles.name}>{routine.name}</span>
              <span className={styles.schedule}>
                {describeWhen(routine.when)}
              </span>
              <RunLine fish={fish} routine={routine} now={now} />
            </span>
            <Switch.Root
              className={styles.switch}
              checked={!routine.paused}
              aria-label={`${routine.paused ? "Resume" : "Pause"} ${routine.name}`}
              onCheckedChange={(checked) =>
                setRoutinePaused(fish, routine, !checked)
              }
            />
          </li>
        </SpecContextMenu>
      ))}
    </ul>
  );
}
